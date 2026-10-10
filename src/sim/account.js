// The player's account: who they are and which store items they've unlocked.
// It is saved apart from the game save, so a beta progress reset never takes away items.
// Items are locked to the account: there is no way to give, trade or sell them.
// Today the account lives in this browser only; server sign-in comes later (docs/BETA.md).

export const ACCOUNT_KEY = 'memefishing-account-v1';
const NAME_MAX = 20;

function randomId(rng) {
  let id = '';
  for (let i = 0; i < 12; i += 1) id += Math.floor(rng() * 36).toString(36);
  return id;
}

export function newAccount(rng = Math.random, now = Date.now()) {
  return {
    version: 1,
    id: `acct_${randomId(rng)}`,
    name: `Angler-${1000 + Math.floor(rng() * 9000)}`,
    createdAt: now,
    betaNoticeSeenAt: null,
    // { item, paidWith: 'reel' | 'usd', price, at }
    entitlements: [],
    equipped: {}
  };
}

export function loadAccount(storage, rng, now) {
  try {
    const raw = storage?.getItem(ACCOUNT_KEY);
    if (!raw) return newAccount(rng, now);
    const data = JSON.parse(raw);
    if (data.version !== 1 || typeof data.id !== 'string') return newAccount(rng, now);
    const fresh = newAccount(rng, now);
    return { ...fresh, ...data, entitlements: Array.isArray(data.entitlements) ? data.entitlements : [], equipped: data.equipped || {} };
  } catch {
    return newAccount(rng, now);
  }
}

export function saveAccount(storage, account) {
  try {
    storage?.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    // Private mode or full storage: the account lasts for this session only.
  }
}

export function cleanName(name) {
  return String(name ?? '')
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .trim()
    .slice(0, NAME_MAX);
}

export function rename(account, name) {
  const clean = cleanName(name);
  if (clean.length < 3) return false;
  account.name = clean;
  return true;
}

export const ownsItem = (account, itemId) => account.entitlements.some((e) => e.item === itemId);

export function grant(account, item, paidWith, now = Date.now()) {
  if (ownsItem(account, item.id)) return false;
  account.entitlements.push({ item: item.id, paidWith, price: paidWith === 'usd' ? item.usd : item.price, at: now });
  return true;
}
