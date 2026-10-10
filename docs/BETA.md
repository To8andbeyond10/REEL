# Phase 1 beta

Memefishing's Phase 1 beta runs on play money. It's for working out features and seeing whether people enjoy the game enough that it can earn from item sales. The full design is in the project's `monetization/phase1-beta.md`.

## What's in the game now

- **Beta notice** on the title screen: everything is play money, REEL points have no cash value and can't be bought, withdrawn or traded, and progress may be reset while store items stay.
- **Angler account** (`src/sim/account.js`): an id, a display name and the list of store items unlocked. It's saved apart from the game save, so resetting progress never takes items away. For now it lives in the browser; signing in on a server comes later.
- **Store** (`src/sim/store.js`, U in game): float and rod looks priced in REEL points. Equipping one recolours the float or rod in the world.
- **Founding Angler badge**: given free to everyone who accepts the beta notice, and shown on the account. It's never sold.
- **Two modes.** Sim mode is the fishing game itself. **Cash Waters** (`src/sim/cashwaters.js`, C in game) is the paytable game from `economy/`, on a play balance.
- **Beta stats** (`src/sim/telemetry.js`): sessions, days played, play time, Sim and Cash Waters casts, Quick Cast share, panels opened and store purchases. They stay in the browser; the player can see, download or delete them from the Store. Nothing is sent anywhere.

## Clean view

Press **V** (or the Clean view button) to hide everything you don't need while fishing: the price ticker, news, alerts, derby standings, weather and spot details, wallet details, the gear list and the menu bar, which folds into one Menu button. The clock, wallet, drag, reel speed, depth, fish finder, cast and fight meters stay. Each corner panel also has a – button to fold just that one. The choice is remembered (`src/game/hudview.js`).

## Cash Waters on play money

- Each water plays one of the economy's modes: Genesis Lake uses Shallows, the swamp and river use Open Sea, and the cold water uses Abyss.
- The panel shows the mode's RTP, hit rate, max win, the paytable hash and the full odds table. Chum shows its extra cost and that RTP stays the same; Frenzy Buy shows its cost and RTP.
- Bait sets the stake (0.10 to 5.00). **Quick Cast** reveals the result in 2.5 seconds; a full cast takes 8 seconds. The result is rolled and saved when the cast starts, so closing the panel or reloading can't re-roll it.
- The balance starts at 100 and is play money: it can't be bought, withdrawn or traded, and it's separate from the REEL points used in the store. When it can't cover the smallest bait, the player can top it back up to 100 for free.
- Gear, skill and store items never change Cash Waters odds. There are no hidden boosts.
- Rolls use the browser's random number generator for now. Provably fair rolls (`fairRng` in `economy/engine.ts`) need a server and stay off in the browser: the `node:crypto` shim in `src/shims/crypto.js` hashes paytables but refuses HMAC.

The economy tools run on Node 22.18 or newer: `npm run economy:report` prints the pricing and RTP report, and `npm run economy:sim` runs the simulation.

## Store rules

These are checked by `test/store.test.js` (and `test/cashwaters.test.js`, `test/beta.test.js` for Cash Waters, the badge and stats):

1. **Looks only.** Store items never change bites, fights, prices or any odds, and each card says so.
2. **Nothing random.** Every item is exactly what the card shows. No loot boxes, crates or mystery rewards.
3. **Locked to the account.** There's no gifting, trading, reselling or selling back.
4. **No pressure.** No countdown timers or "only a few left" messages.

## Card payments

Store items and gear can be paid for by card through Stripe Checkout. The player taps **Pay $x by card**, the game asks `api/checkout.js` for a checkout page, and the card is typed into Stripe's own page, never into the game. The server looks up the price itself, so a player can't change what they pay. When Stripe sends the player back, `api/checkout-status.js` confirms the payment and the item is unlocked on that account.

Card payments are built but switched off until the deployment turns them on. To switch them on in Vercel (Project settings, Environment Variables), add:

- `VITE_REAL_MONEY_PAYMENTS` = `true`
- `STRIPE_SECRET_KEY` = the secret key from the Stripe dashboard (use a `sk_test_` key first to try it with Stripe's test cards)
- optionally `PUBLIC_URL`, the site address Stripe sends players back to (defaults to the request's host)

Then redeploy. With either one missing, the buttons don't show and the server refuses.

Card payments cover store looks and gear. In the Tackle shop, rods, reels, lines, lures and the fish finder can be bought by card (prices in `GEAR_USD`, `src/sim/checkout.js`). A card buy unlocks the gear straight away, even before the player reaches its level; the same gear can always be earned with REEL. Card-bought gear is saved on the angler account, so a progress reset doesn't take it away. Gear only changes Sim mode; it never changes Cash Waters odds. The Cash Waters balance is play money and can't be bought.

## Waiting on the lawyer

None of this is built. It stays off until a securities and gambling lawyer has reviewed it, and the licence and certification it needs are in place:

- Stablecoin (USDC/USDT) checkout and the paid Founder pack.
- Real-money Cash Waters stakes, payouts, withdrawals and the gaming licence they need.
- Provably fair rolls on a server, with RNG certification.
- Beta terms, privacy notice and refund policy.
- Any token, its pool and creator-fee handling.

## Still to do

- Server sign-in and a server copy of the account, purchases and Cash Waters balance. Until then a card purchase is unlocked in the browser the player paid from; a Stripe webhook should also record purchases on the server.
- Sending beta stats to a server, once players have agreed to it in the beta terms.
- An animated in-world Cash Waters cast and fight, instead of the panel reveal.
- More store categories once they exist in the game: boats, outfits and convenience items.
