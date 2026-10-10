import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, createTutorial, currentStep, tutorialEvent } from '../src/sim/tutorial.js';

const at = (t) => currentStep(t)?.id;

test('a clean first catch walks every step to the end', () => {
  const t = createTutorial();
  assert.equal(at(t), 'welcome');
  for (const e of ['next', 'look', 'cast', 'bite', 'hooked', 'fight-end', 'catch-done', 'panel:market', 'next']) {
    assert.ok(tutorialEvent(t, e), e);
  }
  assert.equal(at(t), 'explore');
  assert.ok(tutorialEvent(t, 'next'));
  assert.equal(t.done, true);
  assert.equal(currentStep(t), null);
});

test('steps that wait for an action ignore Next', () => {
  const t = createTutorial();
  tutorialEvent(t, 'next');
  tutorialEvent(t, 'next');
  assert.equal(at(t), 'cast');
  assert.equal(tutorialEvent(t, 'next'), false);
  assert.equal(at(t), 'cast');
});

test('running ahead during the catch skips to the right step', () => {
  const t = createTutorial();
  assert.ok(tutorialEvent(t, 'cast'));
  assert.equal(at(t), 'wait');
});

test('opening a menu early does not skip the catch', () => {
  const t = createTutorial();
  tutorialEvent(t, 'next');
  assert.equal(tutorialEvent(t, 'panel:market'), false);
  assert.equal(at(t), 'look');
});

test('a missed strike goes back to waiting with a hint', () => {
  const t = createTutorial();
  for (const e of ['next', 'look', 'cast', 'bite']) tutorialEvent(t, e);
  assert.equal(at(t), 'strike');
  tutorialEvent(t, 'missed');
  assert.equal(at(t), 'wait');
  assert.match(t.note, /Missed/);
  tutorialEvent(t, 'bite');
  assert.equal(at(t), 'strike');
  assert.equal(t.note, '');
});

test('losing the fish goes back to casting', () => {
  const t = createTutorial();
  for (const e of ['next', 'look', 'cast', 'bite', 'hooked']) tutorialEvent(t, e);
  tutorialEvent(t, 'lost');
  assert.equal(at(t), 'cast');
  assert.match(t.note, /got away/);
});

test('every step tells the player how to move on', () => {
  for (const s of STEPS) assert.ok(s.next || s.until, s.id);
  assert.ok(STEPS.at(-1).last);
});
