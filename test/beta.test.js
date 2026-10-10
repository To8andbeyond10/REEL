import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptBetaNotice, hasBadge, loadAccount, newAccount, saveAccount } from '../src/sim/account.js';
import { STATS_KEY, addPlayTime, clearStats, loadStats, newStats, saveStats, startSession, summary, track } from '../src/sim/telemetry.js';
import { createRng } from '../src/sim/random.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

test('accepting the beta notice grants Founding Angler once, for free', () => {
  const account = newAccount(createRng(1), 0);
  assert.equal(hasBadge(account, 'founding-angler'), false);
  acceptBetaNotice(account, 10);
  acceptBetaNotice(account, 20);
  assert.deepEqual(account.badges, ['founding-angler']);
  assert.equal(account.betaNoticeSeenAt, 10);
  assert.deepEqual(account.entitlements, []);
});

test('an account saved before badges existed loads with none', () => {
  const storage = memoryStorage();
  const account = newAccount(createRng(2), 0);
  delete account.badges;
  saveAccount(storage, account);
  assert.deepEqual(loadAccount(storage, createRng(3), 1).badges, []);
});

test('beta stats count sessions, days, play time and what players try', () => {
  const stats = newStats(0);
  const day = 86400000;
  startSession(stats, day);
  startSession(stats, day + 1000);
  startSession(stats, 3 * day);
  addPlayTime(stats, 2);
  addPlayTime(stats, 600); // a background tab doesn't count as play time
  track(stats, 'sim-cast');
  track(stats, 'cash-cast', { quick: true, chum: true });
  track(stats, 'cash-cast', { quick: false });
  track(stats, 'cash-frenzy');
  track(stats, 'panel', { name: 'cash' });
  track(stats, 'purchase', { item: 'float-neon', paidWith: 'reel', at: 5 });
  const s = summary(stats);
  assert.deepEqual(s, { sessions: 3, daysPlayed: 2, playMinutes: 0, simCasts: 1, cashCasts: 2, quickShare: 0.5, frenzyBuys: 1, purchases: 1 });
  assert.equal(stats.playSeconds, 7);
  assert.equal(stats.panels.cash, 1);
});

test('beta stats stay local and can be deleted', () => {
  const storage = memoryStorage();
  const stats = newStats(0);
  startSession(stats, 0);
  saveStats(storage, stats);
  assert.equal(loadStats(storage).sessions, 1);
  const fresh = clearStats(storage, 1);
  assert.equal(storage.getItem(STATS_KEY), null);
  assert.equal(fresh.sessions, 0);
});
