// The in-game store: looks for your float and rod.
// Rules (docs/BETA.md):
// - Every item is exactly what the card shows. No random or mystery rewards.
// - Store items only change how things look. They never change bites, fights or prices.
// - Items are locked to the account (see account.js). There's no gifting, trading or selling back.
// - During the beta, items cost REEL points. Real-money checkout is off (flags.js).
import { FLAGS } from './flags.js';
import { grant, ownsItem } from './account.js';

export const SKIN_SLOTS = {
  float: { label: 'Floats', default: 'float-classic' },
  rod: { label: 'Rod finishes', default: 'rod-graphite' }
};

// Float colours: body (lower half), cap (upper half), antenna; glow lights the cap and antenna.
// Rod colours: blank (the rod itself), with a gloss level.
export const STORE_ITEMS = [
  { id: 'float-classic', slot: 'float', name: 'Classic Red', price: 0, usd: 0, look: { body: '#f2f2ee', cap: '#e8402e', antenna: '#ffb21e', glow: 0.25 }, blurb: 'The float every angler starts with.' },
  { id: 'float-neon', slot: 'float', name: 'Neon Pump', price: 250, usd: 0.99, look: { body: '#1d221c', cap: '#39ff6a', antenna: '#39ff6a', glow: 0.7 }, blurb: 'Bright green, easy to spot in chop.' },
  { id: 'float-doge', slot: 'float', name: 'Much Float', price: 300, usd: 0.99, look: { body: '#fff4d6', cap: '#f2b33d', antenna: '#7a4a1e', glow: 0.25 }, blurb: 'Very orange. Wow.' },
  { id: 'float-diamond', slot: 'float', name: 'Diamond Hands', price: 600, usd: 1.99, look: { body: '#e8f6ff', cap: '#6fd0ff', antenna: '#bff0ff', glow: 0.45 }, blurb: 'Ice-blue cap that catches the light.' },
  { id: 'float-gold', slot: 'float', name: 'Golden Bag', price: 900, usd: 1.99, look: { body: '#c9a23f', cap: '#f4d06a', antenna: '#fff2a8', glow: 0.35 }, blurb: 'For anglers who have made it.' },
  { id: 'float-night', slot: 'float', name: 'Night Owl', price: 750, usd: 1.99, look: { body: '#1a1a24', cap: '#ff4fd8', antenna: '#ffe14f', glow: 1 }, blurb: 'Glows hot pink after dark.' },
  { id: 'rod-graphite', slot: 'rod', name: 'Graphite', price: 0, usd: 0, look: { blank: '#20262e', gloss: 0.75 }, blurb: 'Plain dark graphite.' },
  { id: 'rod-chrome', slot: 'rod', name: 'Chrome', price: 400, usd: 1.99, look: { blank: '#b9bec6', gloss: 0.92 }, blurb: 'Mirror finish.' },
  { id: 'rod-camo', slot: 'rod', name: 'Reed Camo', price: 350, usd: 1.99, look: { blank: '#3e5a2e', gloss: 0.4 }, blurb: 'Matte green, like the reeds.' },
  { id: 'rod-pink', slot: 'rod', name: 'Pink Candle', price: 450, usd: 1.99, look: { blank: '#d94f8a', gloss: 0.8 }, blurb: 'Only goes up.' },
  { id: 'rod-ice', slot: 'rod', name: 'Cold Wallet', price: 500, usd: 2.99, look: { blank: '#5fa8cf', gloss: 0.85 }, blurb: 'Frosted blue.' },
  { id: 'rod-gold', slot: 'rod', name: 'Whale Gold', price: 1200, usd: 3.99, look: { blank: '#c8a03c', gloss: 0.9 }, blurb: 'Gold blank for the trophy wall.' }
];

export const EFFECT_TEXT = "Looks only. Doesn't change bites, fights or prices.";

export const itemById = (id) => STORE_ITEMS.find((i) => i.id === id);
export const itemsFor = (slot) => STORE_ITEMS.filter((i) => i.slot === slot);

export const ownsSkin = (account, item) => item.price === 0 || ownsItem(account, item.id);

export function equippedSkin(account, slot) {
  const id = account.equipped?.[slot];
  const item = id && itemById(id);
  return item && item.slot === slot && ownsSkin(account, item) ? item : itemById(SKIN_SLOTS[slot].default);
}

export function canBuyItem(profile, account, item) {
  if (!item) return { ok: false, why: 'Not for sale' };
  if (ownsSkin(account, item)) return { ok: false, why: 'Owned' };
  if (profile.wallet < item.price) return { ok: false, why: `${item.price} REEL` };
  return { ok: true };
}

// Pays with REEL points from the game wallet and adds the item to the account.
export function buyWithReel(profile, account, item, now) {
  if (!canBuyItem(profile, account, item).ok) return false;
  profile.wallet -= item.price;
  return grant(account, item, 'reel', now);
}

export function equipSkin(account, item) {
  if (!item || !ownsSkin(account, item)) return false;
  account.equipped = { ...account.equipped, [item.slot]: item.id };
  return true;
}

// Card checkout. The card is typed into Stripe's own checkout page, never into the game,
// and the price comes from the server's copy of this catalogue (api/checkout.js).
export async function startCheckout(item, account, flags = FLAGS, fetchFn = globalThis.fetch) {
  if (!flags.realMoneyPayments) throw new Error('Card payments are switched off.');
  if (!item || !(item.usd > 0)) throw new Error('This item is not sold for cash.');
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
  const item = itemById(data.item);
  if (!item || data.account !== account.id) return { ok: false, why: 'That payment belongs to another account.' };
  grant(account, item, 'usd', now);
  return { ok: true, item };
}
