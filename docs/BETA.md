# Phase 1 beta

Memefishing's Phase 1 beta runs on play money. It's for working out features and seeing whether people enjoy the game enough that it can earn from item sales. The full design is in the project's `monetization/phase1-beta.md`.

## What's in the game now

- **Beta notice** on the title screen: everything is play money, REEL points have no cash value and can't be bought, withdrawn or traded, and progress may be reset while store items stay.
- **Angler account** (`src/sim/account.js`): an id, a display name and the list of store items unlocked. It's saved apart from the game save, so resetting progress never takes items away. For now it lives in the browser; signing in on a server comes later.
- **Store** (`src/sim/store.js`, U in game): float and rod looks priced in REEL points. Equipping one recolours the float or rod in the world.

## Store rules

These are checked by `test/store.test.js`:

1. **Looks only.** Store items never change bites, fights, prices or any odds, and each card says so.
2. **Nothing random.** Every item is exactly what the card shows. No loot boxes, crates or mystery rewards.
3. **Locked to the account.** There's no gifting, trading, reselling or selling back.
4. **No pressure.** No countdown timers or "only a few left" messages.

## Real-money payments

`src/sim/flags.js` has `realMoneyPayments: false`. While it's off, prices show in REEL only and `startCheckout()` refuses before doing anything. No payment provider is connected. The flag stays off until the beta terms, refund policy and payment setup have had a legal review.

## Still to do

- Server sign-in and a server copy of the account and purchases.
- Analytics for retention, session length and what players try (see the design doc).
- More store categories once they exist in the game: boats, outfits and convenience items.
