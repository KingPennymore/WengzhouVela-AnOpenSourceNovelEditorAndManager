import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorChrome } from '../web/app-core/editor-chrome.mjs';

test('editor chrome enters compact once, toggles explicitly and survives repeated context updates', () => {
  const state = new EditorChrome();
  assert.equal(state.toggle(), false);
  assert.equal(state.context('write', true), false);
  assert.equal(state.context('write', false), true);
  assert.equal(state.compact, true);
  assert.equal(state.toggle(), true);
  assert.equal(state.compact, false);
  for (let i = 0; i < 10; i++) {
    assert.equal(state.context('write', false), false);
    assert.equal(state.compact, false);
  }
  state.context('reader', false);
  assert.equal(state.compact, false);
  assert.equal(state.toggle(), false);
  state.context('write', false);
  assert.equal(state.compact, true);
  state.context('write', true);
  assert.equal(state.compact, false);
});
