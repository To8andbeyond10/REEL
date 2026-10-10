import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOLDS, HUD_KEY, hudClasses, loadHudView, newHudView, saveHudView, toggleClean, toggleFold } from '../src/game/hudview.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test('everything shows by default', () => {
  assert.deepEqual(hudClasses(newHudView()), []);
});

test('clean view folds every optional panel and comes back the same', () => {
  const v = toggleClean(newHudView());
  assert.deepEqual(hudClasses(v), ['clean', ...Object.keys(FOLDS).map((k) => `fold-${k}`)]);
  assert.deepEqual(hudClasses(toggleClean(v)), []);
});

test('single panels fold on their own, and unfolding one leaves clean view', () => {
  const v = toggleFold(newHudView(), 'gear');
  assert.deepEqual(hudClasses(v), ['fold-gear']);
  toggleClean(v);
  toggleFold(v, 'info');
  assert.deepEqual(hudClasses(v), ['fold-wallet', 'fold-gear']);
  assert.deepEqual(hudClasses(toggleFold(v, 'nonsense')), ['fold-wallet', 'fold-gear']);
});

test('the view is remembered, and a broken save shows everything', () => {
  const storage = memoryStorage();
  saveHudView(storage, toggleFold(toggleClean(newHudView()), 'wallet'));
  assert.deepEqual(hudClasses(loadHudView(storage)), ['fold-info', 'fold-gear']);
  storage.setItem(HUD_KEY, '{nope');
  assert.deepEqual(hudClasses(loadHudView(storage)), []);
});
