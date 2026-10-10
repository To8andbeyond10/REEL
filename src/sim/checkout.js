// Card checkout for the in-game market: store looks and gear that advances play.
// The card is typed into Stripe's own checkout page, never into the game, and the server
// prices every item from this same catalogue (api/checkout.js), so a player can't change it.
// Gear bought by card is an early unlock: it skips the level lock, shows its stats like any
// other gear, can also be earned with REEL, and never changes Cash Waters odds.
import { FLAGS } from './flags.js';
import { grant, ownsItem } from './account.js';
import { ALL_GEAR } from './profile.js';
import { STORE_ITEMS } from './store.js';

// Dollar prices for gear. Free starter gear isn't sold. Add a line here to sell another item.
export const GEAR_USD = {
  'rod-diamond': 1.99,
  'rod-whale': 4.99,
  'rod-satoshi': 7.99,
  'reel-moon': 1.99,
  'reel-cold': 4.99,
  'reel-hodl': 7.99,
  'line-fluoro10': 0.99,
  'line-braid30': 1.99,
  'line-ledger65': 2.99,
  jig: 0.99,
  popper: 0.99,
  bottom: 0.99,
  minnow: 0.99,
  crank: 1.99,
  finder: 3.99,
  'boat-kayak': 4.99,
  'boat-bass': 9.99
};

const GEAR_FOR_SALE = ALL_GEAR.filter((g) => GEAR_USD[g.id] > 0).map((g) => ({ ...g, kind: 'gear', usd: GEAR_USD[g.id] }));
const LOOKS_FOR_SALE = STORE_ITEMS.filter((i) => i.usd > 0).map((i) => ({ ...i, kind: 'look' }));

// Everything that can be bought by card, by id.
export const cashItemById = (id) => GEAR_FOR_SALE.find((g) => g.id === id) || LOOKS_FOR_SALE.find((i) => i.id === id) || null;
export const gearUsd = (id) => GEAR_USD[id] || 0;

// Card-bought gear lives on the account, so a progress reset never takes it away.
// Copies it into the game save's owned list; returns the ids it added.
export function syncPaidGear(profile, account) {
  const added = [];
  for (const e of account.entitlements || []) {
    const g = GEAR_FOR_SALE.find((x) => x.id === e.item);
    if (g && !profile.owned.includes(g.id)) {
      profile.owned.push(g.id);
      added.push(g.id);
    }
  }
  return added;
}

export async function startCheckout(item, account, flags = FLAGS, fetchFn = globalThis.fetch) {
  if (!flags.realMoneyPayments) throw new Error('Card payments are switched off.');
  if (!item || !cashItemById(item.id)) throw new Error('This item is not sold for cash.');
  const res = await fetchFn('/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ item: item.id, account: account.id })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error || 'Checkout is not available right now.');
  return data.url;
}

// After Stripe sends the player back, asks the server whether the payment went through
// and unlocks the item on this account if it did.
export async function completeCheckout(account, sessionId, fetchFn = globalThis.fetch, now = Date.now()) {
  const res = await fetchFn(`/api/checkout-status?session_id=${encodeURIComponent(sessionId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.paid) return { ok: false, why: data.error || 'Payment not completed.' };
  const item = cashItemById(data.item);
  if (!item || data.account !== account.id) return { ok: false, why: 'That payment belongs to another account.' };
  if (!ownsItem(account, item.id)) grant(account, item, 'usd', now);
  return { ok: true, item };
}
