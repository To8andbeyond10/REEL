import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../src/sim/flags.js';
import { ACCOUNT_KEY, cleanName, loadAccount, newAccount, ownsItem, rename, saveAccount } from '../src/sim/account.js';
import * as store from '../src/sim/store.js';
import { STORE_ITEMS, SKIN_SLOTS, buyWithReel, canBuyItem, completeCheckout, equipSkin, equippedSkin, itemById, startCheckout } from '../src/sim/store.js';
import checkoutHandler from '../api/checkout.js';
import statusHandler from '../api/checkout-status.js';
import { newProfile } from '../src/sim/profile.js';
import { createRng } from '../src/sim/random.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test('card payments are off unless the deployment switches them on', async () => {
  assert.equal(FLAGS.realMoneyPayments, false);
  assert.ok(Object.isFrozen(FLAGS));
  const account = newAccount(createRng(9), 0);
  await assert.rejects(startCheckout(itemById('float-gold'), account), /switched off/);
});

const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });

test('card checkout sends only the item and account, and opens the Stripe page', async () => {
  const account = newAccount(createRng(10), 0);
  let sent;
  const url = await startCheckout(itemById('float-gold'), account, { realMoneyPayments: true }, async (path, init) => {
    sent = { path, body: JSON.parse(init.body) };
    return reply(200, { url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  });
  assert.equal(url, 'https://checkout.stripe.com/c/pay/cs_test_1');
  assert.deepEqual(sent, { path: '/api/checkout', body: { item: 'float-gold', account: account.id } });
  await assert.rejects(startCheckout(itemById('float-classic'), account, { realMoneyPayments: true }, async () => reply(200, {})), /not sold/);
});

test('a confirmed card payment unlocks the item on the paying account only', async () => {
  const account = newAccount(createRng(11), 0);
  const paid = (acct) => async () => reply(200, { paid: true, item: 'rod-gold', account: acct });
  assert.equal((await completeCheckout(account, 'cs_x', async () => reply(200, { paid: false }))).ok, false);
  assert.equal((await completeCheckout(account, 'cs_x', paid('acct_someoneelse0'))).ok, false);
  assert.equal(ownsItem(account, 'rod-gold'), false);
  const r = await completeCheckout(account, 'cs_x', paid(account.id), 7);
  assert.equal(r.ok, true);
  assert.deepEqual(account.entitlements, [{ item: 'rod-gold', paidWith: 'usd', price: 3.99, at: 7 }]);
  // Coming back to the same page again doesn't add it twice.
  await completeCheckout(account, 'cs_x', paid(account.id), 8);
  assert.equal(account.entitlements.length, 1);
});

const fakeRes = () => {
  const r = { code: 0, body: null };
  r.status = (c) => ((r.code = c), r);
  r.json = (b) => ((r.body = b), r);
  return r;
};

test('the checkout server prices items itself and refuses while switched off', async () => {
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  try {
    delete process.env.VITE_REAL_MONEY_PAYMENTS;
    let res = fakeRes();
    await checkoutHandler({ method: 'POST', body: { item: 'float-gold', account: 'acct_abcdefghijkl' }, headers: {} }, res);
    assert.equal(res.code, 503);
    res = fakeRes();
    await statusHandler({ query: { session_id: 'cs_test_1' } }, res);
    assert.equal(res.code, 503);

    process.env.VITE_REAL_MONEY_PAYMENTS = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    let form;
    globalThis.fetch = async (url, init) => {
      if (init?.method === 'POST') form = new URLSearchParams(init.body);
      return reply(200, { url: 'https://checkout.stripe.com/x', payment_status: 'paid', metadata: { item: 'float-gold', account: 'acct_abcdefghijkl' } });
    };
    res = fakeRes();
    await checkoutHandler({ method: 'POST', body: { item: 'float-gold', account: 'acct_abcdefghijkl', usd: 0.01 }, headers: { host: 'reel.test' } }, res);
    assert.equal(res.code, 200);
    assert.equal(form.get('line_items[0][price_data][unit_amount]'), '199');
    assert.equal(form.get('metadata[account]'), 'acct_abcdefghijkl');
    assert.equal(form.get('success_url'), 'https://reel.test/?checkout={CHECKOUT_SESSION_ID}');
    res = fakeRes();
    await checkoutHandler({ method: 'POST', body: { item: 'float-classic', account: 'acct_abcdefghijkl' }, headers: {} }, res);
    assert.equal(res.code, 400);
    res = fakeRes();
    await statusHandler({ query: { session_id: 'cs_test_1' } }, res);
    assert.deepEqual(res.body, { paid: true, item: 'float-gold', account: 'acct_abcdefghijkl' });
  } finally {
    process.env = env;
    globalThis.fetch = realFetch;
  }
});

test('every store item is fixed, priced and looks only', () => {
  const ids = new Set();
  for (const i of STORE_ITEMS) {
    assert.ok(!ids.has(i.id), `duplicate id ${i.id}`);
    ids.add(i.id);
    assert.ok(SKIN_SLOTS[i.slot], `${i.id} has a known slot`);
    assert.ok(Number.isInteger(i.price) && i.price >= 0, `${i.id} has a REEL price`);
    assert.ok(typeof i.usd === 'number' && i.usd >= 0, `${i.id} has a dollar price`);
    // Looks only: no gameplay stats and nothing random.
    for (const key of ['maxLoad', 'maxDrag', 'strength', 'cast', 'speed', 'bite', 'odds', 'rtp', 'drops', 'chance', 'random']) {
      assert.ok(!(key in i), `${i.id} must not carry ${key}`);
    }
  }
  for (const slot of Object.keys(SKIN_SLOTS)) assert.equal(itemById(SKIN_SLOTS[slot].default).price, 0);
});

test('the store has no way to give, trade or sell back items', () => {
  for (const name of Object.keys(store)) assert.ok(!/gift|trade|transfer|resell|sell|refund/i.test(name), `unexpected export ${name}`);
});

test('buying with REEL takes the price and locks the item to the account', () => {
  const profile = newProfile();
  profile.wallet = 1000;
  const account = newAccount(createRng(1), 0);
  const gold = itemById('float-gold');
  assert.equal(canBuyItem(profile, account, gold).ok, true);
  assert.equal(buyWithReel(profile, account, gold, 5), true);
  assert.equal(profile.wallet, 100);
  assert.ok(ownsItem(account, 'float-gold'));
  assert.deepEqual(account.entitlements, [{ item: 'float-gold', paidWith: 'reel', price: 900, at: 5 }]);
  // No double charge.
  assert.equal(buyWithReel(profile, account, gold), false);
  assert.equal(profile.wallet, 100);
  // Not enough REEL.
  assert.equal(buyWithReel(profile, account, itemById('rod-gold')), false);
  assert.equal(profile.wallet, 100);
});

test('only owned skins can be equipped; the default is used otherwise', () => {
  const account = newAccount(createRng(2), 0);
  assert.equal(equippedSkin(account, 'rod').id, 'rod-graphite');
  assert.equal(equipSkin(account, itemById('rod-chrome')), false);
  account.equipped.rod = 'rod-chrome'; // tampered save
  assert.equal(equippedSkin(account, 'rod').id, 'rod-graphite');
  const profile = newProfile();
  profile.wallet = 500;
  buyWithReel(profile, account, itemById('rod-chrome'));
  assert.equal(equipSkin(account, itemById('rod-chrome')), true);
  assert.equal(equippedSkin(account, 'rod').id, 'rod-chrome');
});

test('the account is saved apart from the game save and survives a progress reset', () => {
  const storage = memoryStorage();
  const account = newAccount(createRng(3), 0);
  const profile = newProfile();
  profile.wallet = 400;
  buyWithReel(profile, account, itemById('float-neon'));
  saveAccount(storage, account);
  storage.setItem('memefishing-save-v2', 'reset');
  const back = loadAccount(storage, createRng(4), 1);
  assert.equal(back.id, account.id);
  assert.ok(ownsItem(back, 'float-neon'));
  assert.ok(storage.getItem(ACCOUNT_KEY));
  // A broken save starts a fresh account instead of crashing.
  storage.setItem(ACCOUNT_KEY, '{oops');
  assert.match(loadAccount(storage, createRng(5), 2).id, /^acct_/);
});

test('angler names are cleaned', () => {
  const account = newAccount(createRng(6), 0);
  assert.equal(cleanName('  <b>Reel Deal</b>  '), 'bReel Dealb');
  assert.equal(rename(account, 'xy'), false);
  assert.equal(rename(account, 'Pepe Hunter 69'), true);
  assert.equal(account.name, 'Pepe Hunter 69');
  assert.equal(cleanName('a'.repeat(40)).length, 20);
});
