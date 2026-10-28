import { launchBrowser } from './browser-launch.mjs';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startSourceAppServer } from './source-app-server.mjs';

const fixture = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
import {previewDownload} from './web/sync-download.mjs';
let workspace, submit, applied;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function begin(seed,result){
 workspace=structuredClone(seed);applied=null;document.querySelector('#sync-probe')?.remove();
 const root=document.createElement('form');root.id='sync-probe';root.style.cssText='position:fixed;inset:10%;z-index:10000;overflow:auto;background:var(--paper);padding:16px';document.body.append(root);
 previewDownload({workspace,result,folder:'Book',escape,checkpoint:()=>{},save:()=>true,onApply:value=>applied=value,openModal:(_title,html,callback)=>{root.innerHTML=html;submit=callback;}});
}
export function edit(){workspace.documents[0].text='预览后的新修改';}
export async function apply(){try{await submit(new FormData(document.querySelector('#sync-probe')));return {applied};}catch(error){return {error:error.message,applied};}}
`,
  },
  bundle: true,
  format: 'esm',
  write: false,
  target: 'chrome105',
});
const server = await startSourceAppServer();
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  await page.route(server.url + '/sync-safety-fixture.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fixture.outputFiles[0].text }),
  );
  await page.goto(server.url);
  await page.waitForFunction(() => window.velaReady);
  await page.evaluate(async () => {
    window.syncSafety = await import('/sync-safety-fixture.js');
  });
  const identity = { repo: 'writer/book', branch: 'main' };
  const workspace = {
    documents: [
      {
        id: 'old',
        name: 'old.txt',
        path: 'Book/old.txt',
        text: '原稿',
        remote: { ...identity, path: 'old.txt', lastSyncedText: '原稿' },
      },
      {
        id: 'edited',
        name: 'edited.txt',
        path: 'Book/edited.txt',
        text: '本地新稿',
        remote: { ...identity, path: 'edited.txt', lastSyncedText: '原稿' },
      },
    ],
    repositories: [
      {
        ...identity,
        folder: 'Book',
        baseFiles: { 'old.txt': { hash: 'a' }, 'edited.txt': { hash: 'b' } },
      },
    ],
  };
  const result = {
    ...identity,
    commit: 'head',
    files: [],
    folders: [],
    fullSnapshot: true,
    selection: null,
    remotePaths: [],
    deletionData: { 'Book/old.txt': '5Y6f56i/', 'Book/edited.txt': '5pys5Zyw5paw56i/' },
  };
  await page.evaluate(({ workspace, result }) => syncSafety.begin(workspace, result), {
    workspace,
    result,
  });
  const rows = page.locator('#sync-probe [data-download]');
  assert.equal(await rows.count(), 2);
  assert.equal(await rows.nth(0).locator('input').isChecked(), false);
  assert.equal(await rows.nth(0).locator('input').isDisabled(), false);
  assert.equal(await rows.nth(1).locator('input').isDisabled(), true);
  await mkdir('test-results/sync', { recursive: true });
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height: 850 });
    await page.screenshot({ path: 'test-results/sync/preview-' + width + '.png' });
  }
  await rows.nth(0).locator('input').check();
  let saved = await page.evaluate(() => syncSafety.apply());
  assert.equal(saved.applied.deletions.length, 1);
  assert.equal(saved.applied.deletions[0].localPath, 'Book/old.txt');
  assert.equal(saved.applied.files.length, 0);
  await page.evaluate(({ workspace, result }) => syncSafety.begin(workspace, result), {
    workspace,
    result,
  });
  await rows.nth(0).locator('input').check();
  await page.evaluate(() => syncSafety.edit());
  saved = await page.evaluate(() => syncSafety.apply());
  assert.match(saved.error, /本地文稿已变化/);
  assert.equal(saved.applied, null);
  await page.evaluate(
    ({ workspace, result }) =>
      syncSafety.begin(workspace, { ...result, selection: ['new.txt'], fullSnapshot: false }),
    { workspace, result },
  );
  assert.equal(await rows.count(), 0);
  await page.evaluate(
    ({ workspace, result }) =>
      syncSafety.begin(workspace, {
        ...result,
        branch: 'draft',
        files: [{ path: 'old.txt', text: '其他分支' }],
      }),
    { workspace, result },
  );
  assert.equal(await rows.count(), 1);
  assert.equal(await rows.first().locator('input').isDisabled(), true);
  console.log(
    'PASS sync preview: deletion opt-in, modified-file protection, stale-preview refusal, partial-pull scope and branch collisions',
  );
} finally {
  await browser.close();
  await server.close();
}
