import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import {
  normalizeFontName,
  normalizeFontList,
  fontFamilyCss,
  applyFontPreference,
  listSystemFonts,
} from '../web/app-core/system-fonts.mjs';

test('font names are bounded, deduplicated and treated as CSS strings', () => {
  assert.equal(normalizeFontName({ family: 'Bad' }), '');
  assert.equal(normalizeFontName('a'.repeat(161)), '');
  assert.equal(normalizeFontName('Bad\nFont'), '');
  assert.deepEqual(
    new Set(normalizeFontList([' Arial ', 'arial', '宋体', null, '', 'Bad\u0000Font'])),
    new Set(['Arial', '宋体']),
  );
  assert.equal(fontFamilyCss('system-ui'), 'system-ui,sans-serif');
  assert.equal(fontFamilyCss('monospace'), 'monospace,sans-serif');
  assert.equal(fontFamilyCss('宋体'), '"宋体",system-ui,sans-serif');
  assert.equal(
    fontFamilyCss('Font",serif; color:red'),
    '"Font\\",serif; color:red",system-ui,sans-serif',
  );
  const values = new Map();
  const document = {
    documentElement: {
      style: {
        setProperty: (key, value) => values.set(key, value),
        removeProperty: (key) => values.delete(key),
      },
    },
  };
  applyFontPreference(document, 'Consolas');
  assert.equal(values.get('--app-font-family'), '"Consolas",system-ui,sans-serif');
  applyFontPreference(document, '');
  assert.equal(values.size, 0);
});

test('native catalogs and explicit browser font access remain separate', async () => {
  let requests = 0;
  const services = {
    native: true,
    transport: async (operation) => {
      assert.equal(operation, 'listSystemFonts');
      return ['A', 'A', 'B'];
    },
    window: {
      queryLocalFonts: async () => {
        requests++;
        return [{ family: 'C' }, { family: 'C' }];
      },
    },
  };
  assert.deepEqual(await listSystemFonts(services), ['A', 'B']);
  assert.equal(requests, 0);
  services.native = false;
  assert.deepEqual(await listSystemFonts(services), ['C']);
  assert.equal(requests, 1);
  services.window.queryLocalFonts = async () => {
    throw new Error('Permission denied');
  };
  await assert.rejects(listSystemFonts(services), /Permission denied/);
  await assert.rejects(listSystemFonts({ ...services, window: {} }), /不支持/);
});

const compiled = await build({
  entryPoints: ['entry/src/main/ets/services/SystemFonts.ets'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  loader: { '.ets': 'ts' },
  plugins: [
    {
      name: 'font-sdk',
      setup(plugin) {
        plugin.onResolve({ filter: /^@kit\./ }, (args) => ({ path: args.path, namespace: 'kit' }));
        plugin.onLoad({ filter: /.*/, namespace: 'kit' }, (args) => ({
          contents: `module.exports=globalThis.sdk[${JSON.stringify(args.path)}]`,
        }));
      },
    },
  ],
});

test('Harmony phone fonts use the graphics API; API 12 keeps configured families and aliases', async () => {
  for (const api of [12, 14]) {
    const calls = [];
    const sdk = {
      '@kit.ArkUI': {
        font: {
          getUIFontConfig: () => ({
            generic: [{ family: 'HarmonyOS Sans', alias: [{ name: 'sans-serif' }] }],
            fallbackGroups: [{ fallback: [{ family: 'HarmonyOS Sans SC' }] }],
          }),
        },
      },
      '@kit.BasicServicesKit': { deviceInfo: { sdkApiVersion: api } },
      '@kit.ArkGraphics2D': {
        text: {
          SystemFontType: { ALL: 1 },
          getSystemFontFullNamesByType: async () => {
            calls.push('list');
            return ['Regular', 'Bold', 'Gone'];
          },
          getFontDescriptorByFullName: async (name) => {
            if (name === 'Gone') throw new Error('Font removed');
            return { fontFamily: 'Installed font', path: '/private/font.ttf' };
          },
        },
      },
    };
    const module = { exports: {} };
    new vm.Script(compiled.outputFiles[0].text).runInContext(
      vm.createContext({ sdk, module, exports: module.exports }),
    );
    const fonts = await module.exports.listSystemFonts();
    assert.ok(fonts.includes('HarmonyOS Sans SC'));
    assert.ok(fonts.includes('sans-serif'));
    assert.equal(fonts.includes('Installed font'), api >= 14);
    assert.equal(calls.length, api >= 14 ? 1 : 0);
    assert.equal(fonts.filter((name) => name === 'Installed font').length, api >= 14 ? 1 : 0);
    assert.ok(fonts.every((name) => !name.includes('/')));
  }
});
