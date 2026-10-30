import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVela,
  velaText,
  createVelaV2,
  effectiveVela,
  editorPreferences,
  setVelaPreference,
  projectWriter,
  rewriteVelaFiles,
} from '../web/vela.mjs';
import { extractionContext } from '../web/ai-workspace.mjs';
const book = () =>
  Object.assign(createVelaV2('Book'), {
    editor: {
      lineNumbers: true,
      marginLeft: 8,
      marginRight: 10,
      fontFamily: 'serif',
      autoNouns: false,
      highlightTerms: true,
      glossaryPanel: true,
      snippets: [{ label: 'hello', text: 'hello world' }],
    },
    chapters: { countMode: 'letters', includeHeading: false, templates: [] },
    ai: {
      suggestions: false,
      models: { extract: 'deepseek-chat' },
      targets: { outline: 'notes/story.pcs' },
    },
  });
const workspace = (c) => ({
  settings: { novelLineNumbers: false, writer: { countMode: 'nonspace', includeHeading: true } },
  documents: [
    { id: 'c', name: '.vela', path: 'Book/.vela', text: velaText(c) },
    { id: 'b', name: 'a.txt', path: 'Book/a.txt', text: 'text' },
  ],
  activeId: 'b',
});
test('new preferences round trip without changing v2/v3 or unknown extension data', () => {
  for (const version of [2, 3]) {
    const c = { ...book(), version, extensions: { keep: { x: 1 } } };
    assert.deepEqual(parseVela(velaText(c)), c);
  }
});
test('preferences inherit globally, by work and by file, including explicit false', () => {
  const g = {
    ...createVelaV2('', { global: true }),
    editor: { lineNumbers: true, marginLeft: 30 },
  };
  const c = book();
  c.files = { 'a.txt': { editor: { lineNumbers: false }, ai: { models: { suggest: 'fast' } } } };
  const result = effectiveVela(g, c, 'a.txt');
  assert.equal(result.editor.lineNumbers, false);
  assert.equal(result.editor.marginLeft, 8);
  assert.equal(result.ai.models.extract, 'deepseek-chat');
  assert.equal(result.ai.models.suggest, 'fast');
});
test('editor and writer consumers use project overrides and snippets', () => {
  const w = workspace(book()),
    p = editorPreferences(w, w.documents[1]);
  assert.equal(p.lineNumbers, true);
  assert.equal(p.autoNouns, false);
  assert.equal(p.snippets[0].label, 'hello');
  assert.equal(projectWriter(w, w.documents[1]).countMode, 'letters');
  assert.equal(projectWriter(w, w.documents[1]).includeHeading, false);
});
test('legacy documents without preferences preserve local defaults', () => {
  const w = workspace(createVelaV2('Book'));
  w.settings.novelLineNumbers = true;
  assert.equal(editorPreferences(w, w.documents[1]).lineNumbers, true);
  assert.equal(projectWriter(w, w.documents[1]).countMode, 'nonspace');
});
test('bounds, booleans and nested values are validated', () => {
  for (const patch of [
    { marginLeft: -1 },
    { marginRight: Infinity },
    { lineNumbers: 1 },
    { fontFamily: 'bad\nfont' },
    { snippets: [{ label: 'x', text: 1 }] },
  ])
    assert.throws(() => velaText({ ...book(), editor: patch }));
  assert.throws(() => velaText({ ...book(), files: { 'a.txt': { editor: { marginLeft: -1 } } } }));
  assert.throws(() => velaText({ ...book(), workspaceDefaults: { ai: { key: 'secret' } } }));
});
test('AI credentials and escaping or unsuitable target paths are rejected', () => {
  for (const ai of [
    { key: 'secret' },
    { endpoint: 'https://example.com' },
    { enabled: true },
    { targets: { outline: '../evil.pcs' } },
    { targets: { outline: 'C:/evil.pcs' } },
    { targets: { outline: 'bad.txt' } },
    { models: { extract: '../model' } },
  ])
    assert.throws(() => velaText({ ...book(), ai }));
});
test('AI targets resolve inside the work and follow renamed folders', () => {
  const w = workspace(book());
  assert.equal(extractionContext(w, w.documents[1]).targets.outline, 'Book/notes/story.pcs');
  const after = structuredClone(w);
  rewriteVelaFiles(w, after, 'move', 'Book/notes', 'Book/plan');
  assert.equal(parseVela(after.documents[0].text).ai.targets.outline, 'plan/story.pcs');
});

test('preference writers preserve unknown data and refuse invalid-config fallback overwrite', () => {
  const w = workspace(book());
  setVelaPreference(w, w.documents[1], 'editor', 'lineNumbers', false);
  assert.equal(parseVela(w.documents[0].text).editor.lineNumbers, false);
  w.documents[0].text = '{broken';
  assert.throws(() => setVelaPreference(w, w.documents[1], 'editor', 'lineNumbers', true));
  assert.equal(w.documents[0].text, '{broken');
});

test('new works copy all supported defaults without sharing objects or reading lists',()=>{const defaults={editor:{lineNumbers:true},ai:{suggestions:false},formats:{outline:{showEditorMarkers:false}},reading:{items:[{path:'other.txt'}],layout:{fontSize:22}}};const c=createVelaV2('New',{defaults});assert.equal(c.ai.suggestions,false);assert.equal(c.formats.outline.showEditorMarkers,false);assert.equal(c.reading.layout.fontSize,22);assert.deepEqual(c.reading.items,[]);c.editor.lineNumbers=false;assert.equal(defaults.editor.lineNumbers,true);});
