// Beta stats: what the beta needs to learn (does the game hold players, what do they try).
// Kept in this browser only. Nothing is sent anywhere; the player can view, download or delete it.

export const STATS_KEY = 'memefishing-beta-stats-v1';

export function newStats(now = Date.now()) {
  return {
    version: 1,
    firstSeen: now,
    lastSeen: now,
    sessions: 0,
    days: [],
    playSeconds: 0,
    simCasts: 0,
    cashCasts: { quick: 0, full: 0, frenzy: 0, chum: 0 },
    panels: {},
    purchases: []
  };
}

export function loadStats(storage, now = Date.now()) {
  try {
    const data = JSON.parse(storage?.getItem(STATS_KEY) || 'null');
    if (!data || data.version !== 1) return newStats(now);
    const fresh = newStats(now);
    return { ...fresh, ...data, cashCasts: { ...fresh.cashCasts, ...data.cashCasts }, panels: { ...data.panels } };
  } catch {
    return newStats(now);
  }
}

export function saveStats(storage, stats) {
  try {
    storage?.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Stats are a nice-to-have; never break the game over them.
  }
}

export function clearStats(storage, now = Date.now()) {
  try {
    storage?.removeItem?.(STATS_KEY);
  } catch {
    // ignore
  }
  return newStats(now);
}

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

export function startSession(stats, now = Date.now()) {
  stats.sessions += 1;
  stats.lastSeen = now;
  const d = dayKey(now);
  if (!stats.days.includes(d)) stats.days.push(d);
}

// Adds play time, capped per tick so a tab left in the background doesn't count.
export function addPlayTime(stats, seconds, now = Date.now()) {
  stats.playSeconds += Math.max(0, Math.min(seconds, 5));
  stats.lastSeen = now;
}

export function track(stats, event, data = {}) {
  if (event === 'sim-cast') stats.simCasts += 1;
  else if (event === 'cash-cast') {
    stats.cashCasts[data.quick ? 'quick' : 'full'] += 1;
    if (data.chum) stats.cashCasts.chum += 1;
  } else if (event === 'cash-frenzy') stats.cashCasts.frenzy += 1;
  else if (event === 'panel') stats.panels[data.name] = (stats.panels[data.name] || 0) + 1;
  else if (event === 'purchase') stats.purchases.push({ item: data.item, paidWith: data.paidWith, at: data.at });
}

// The numbers the beta is judged on, for the "Your beta data" view.
export function summary(stats) {
  const cash = stats.cashCasts.quick + stats.cashCasts.full;
  return {
    sessions: stats.sessions,
    daysPlayed: stats.days.length,
    playMinutes: Math.round(stats.playSeconds / 60),
    simCasts: stats.simCasts,
    cashCasts: cash,
    quickShare: cash ? stats.cashCasts.quick / cash : 0,
    frenzyBuys: stats.cashCasts.frenzy,
    purchases: stats.purchases.length
  };
}
