# REEL cast economy

Robby's cast economy: paytables, the cast engine, tides, jackpots and the pricing model. In the Phase 1 beta it runs on play money only (see [docs/BETA.md](../docs/BETA.md)). Run `npm run economy:report` for the tables and `npm run economy:sim` to verify them.

A complete, verified math model for selling casts, paying catches at about 96% RTP, varying RTP by mode, event and derby, and keeping the flywheel funded. You can tune it, but you can't use it to cheat players.

- **Every number lives in [config.ts](config.ts).** `node economy/report.ts` prints the resulting tables instantly.
- `node economy/simulate.ts` replays tens of millions of casts to prove the engine pays what the math says. At 30M casts per paytable, every mode, tide and Chum lands inside its 95% confidence interval, and the jackpots match their formulas.
- Numbers below are from those two scripts with the shipped config.

## 1. How the live-casino studios hit 96%

Evolution and Pragmatic don't manage a pool of player money to land on 96%. **RTP is a property of the paytable.** Each game, and each bet spot within it, is a fixed table of outcomes and odds whose expected return is exactly X%. The law of large numbers delivers that return across millions of rounds. On top of that:

- operators pick from several certified RTP versions of the same game (for example ~96.5 / 95.5 / 94.5%);
- big wins are bounded by a max-win cap;
- the bankroll is protected with bet limits, never by changing the odds.

This model copies that structure:

| Studio mechanic | REEL equivalent |
|---|---|
| Bet spots with different RTP (Crazy Time's run roughly 94–96%) | Three waters: Shallows 96.5%, Open Sea 96%, Abyss 95.5% |
| Top Slot multiplier revealed before the spin | **Hot Spot**: a species is boosted ×2–×100 before the cast |
| Bonus games (Cash Hunt, Coin Flip…) | **Treasure Chest** (pick-one) and **Feeding Frenzy** (free casts with a climbing multiplier) |
| Ante bet / bonus buy | **Chum** (2× Frenzy odds, priced so RTP is unchanged) and **Frenzy Buy** (returns 0.2–0.8% more than the mode) |
| Several certified RTP versions | **Tides**: pre-published paytables the owner schedules publicly |
| Network jackpots, Drops & Wins | Golden Minnow / Silver Marlin (must-drop) / Kraken jackpots, Golden Hour, derbies |
| Certified RNG | Provably-fair HMAC-SHA256 seeds; every cast replayable by the player |

## 2. The formulas

| # | What | Formula |
|---|---|---|
| 1 | **Casts for $** | `casts = ⌊ D · (1 + b(D)) / (c₀ · bait) ⌋`. Base cast c₀ = $0.10; bait multiplies the stake (1×–1,000×). `b(D)` is the deposit bonus, applied to fresh deposits only and never to recast winnings. |
| 2 | **RTP as a budget** | `RTP = jackpots + catches + frenzy + chest`. The non-jackpot part `R = RTP − jackpots` is split by `split` in config. |
| 3 | **Odds from RTP** | Each component's frequency is `p_k = R · share_k / E[payout_k]`. Plain catches use one scale factor `λ = R · share_catch / Σ wᵢ·multᵢ·hotᵢ` with `pᵢ = λ·wᵢ`. Whatever probability is left is an empty cast. Change the RTP and every bite rate rescales; the shape stays. |
| 4 | **Hot Spot factor** | An eligible species' expected boost is `1 + (h / n)·(E[X] − 1)`, where h is the Hot Spot chance, n the number of eligible species and X the boost multiplier. |
| 5 | **Feeding Frenzy value** | `E = bite · E[fish] · (F + step · bite · F(F−1)/2)`, where F is the number of free casts and the multiplier rises by `step` per catch. SD is computed exactly by recursion. |
| 6 | **Feature prices** | Chum cost = `1 + p_frenzy · E_frenzy / RTP`. Frenzy Buy = `E_frenzy / (RTP + bonus)`. |
| 7 | **Jackpot RTP** | Random tier: `contribution + seed / hitEvery`, hit chance = `stake / hitEvery`. Must-drop tier: `contribution · (cap + seed) / (cap − seed)`. |
| 8 | **Hourly cost to a player** | `casts/hour × stake × (1 − RTP)`. At 900 casts/h and $0.10 a cast, Open Sea costs $3.60 an hour. |
| 9 | **Max stake from bankroll B** | `min( 2% · B / maxWin , 2 · edge · B / (SD² · ln(1/ruin)) )`. Limits rise with the bankroll; odds never do. |
| 10 | **Flywheel** | `GGR = deposits · τ · (1 − RTP) + derby fees · rake`. τ is turnover per deposited dollar (players recasting winnings). |
| 11 | **Bonus budget** | Average deposit bonus ≤ `share_bonus · (1 − RTP) · τ / RTP`. |
| 12 | **Derby prizes** | `pool = entrants · fee · (1 − rake)`, `prize_k = floor + (pool − paid·floor) · k^−a / Σ j^−a`. |

## 3. Casts per dollar

| Deposit | Bonus | Worm ($0.10) | Shrimp ($0.50) | Squid ($1) | Eel ($5) |
|---|---|---|---|---|---|
| $5 | — | 50 | 10 | 5 | 1 |
| $10 | — | 100 | 20 | 10 | 2 |
| $25 | +0.5% | 251 | 50 | 25 | 5 |
| $50 | +1% | 505 | 101 | 50 | 10 |
| $100 | +2% | 1,020 | 204 | 102 | 20 |
| $500 | +3% | 5,150 | 1,030 | 515 | 103 |

Casts are bought; catches are cashed. Catches land in a withdrawable balance. Converting that balance back into casts ("recast") happens at the base price with no bonus. That keeps bonuses from compounding over every recast.

## 4. Modes

|  | Shallows | Open Sea | Abyss |
|---|---|---|---|
| Game RTP | 96.5% | 96.0% | 95.5% |
| … plain catches / Frenzy / Chest / jackpots | 80.1 / 10.5 / 4.8 / 1.2% | 70.2 / 17.1 / 7.6 / 1.2% | 64.1 / 20.7 / 9.4 / 1.2% |
| Casts that catch something | 62.0% | 42.9% | 27.7% |
| Casts with a catch or a Hot Spot banner | 71.5% | 54.3% | 38.5% |
| Volatility (SD per cast) | Low (2.4) | Medium (7.1) | High (14.0) |
| Feeding Frenzy | 1 in 220, avg 23× | 1 in 369, avg 63× | 1 in 523, avg 109× |
| Treasure Chest | 1 in 139, avg 6.6× | 1 in 630, avg 48× | 1 in 1,975, avg 186× |
| Max win per cast | 500× | 5,000× | 25,000× |
| Chum (2× Frenzy odds, same RTP) | +10.9% per cast | +17.8% per cast | +21.7% per cast |
| Frenzy Buy | 23.8× stake (96.8%) | 65.4× stake (96.3%) | 113× stake (95.8%) |
| Avg cost per hour @ $0.10 / @ $1 | $3.15 / $31.50 | $3.60 / $36 | $4.05 / $40.50 |

The table below is Open Sea, the default water. Each catch's value is its base × a size roll of ±25%, which also gives derbies a "heaviest fish".

| Catch | Pays | Odds per cast | Share of RTP |
|---|---|---|---|
| Old Boot ¹ | 0.15×–0.25× | 1 in 14 | 1.5% |
| Minnow ¹ | 0.38×–0.63× | 1 in 11 | 4.7% |
| Perch | 0.75×–1.25× | 1 in 7 | 15.1% |
| Bass | 1.5×–2.5× | 1 in 14 | 16.1% |
| Trout | 2.25×–3.75× | 1 in 29 | 11.4% |
| Salmon | 3.75×–6.25× | 1 in 66 | 8.5% |
| Pike | 7.5×–12.5× | 1 in 203 | 5.5% |
| Catfish | 15×–25× | 1 in 557 | 4.0% |
| Bluefin Tuna | 37.5×–62.5× | 1 in 2,026 | 2.8% |
| Swordfish | 75×–125× | 1 in 6,190 | 1.8% |
| Marlin ¹ | 188×–313× | 1 in 24,762 | 1.1% |
| Great White ¹ | 750×–1,250× | 1 in 159,184 | 0.7% |
| Feeding Frenzy | avg 63× | 1 in 369 | 17.8% |
| Treasure Chest | 5×–250× | 1 in 630 | 7.9% |
| Jackpots | see §7 | — | 1.3% |
| Nothing | 0× | 57.1% | — |

¹ Not eligible for Hot Spot boosts. `node economy/report.ts` prints the Shallows and Abyss tables too.

## 5. The "hot machine" feel

The aim is constant small action with a real shot at something huge. Per hour of play (900 casts), from the simulation:

| | Shallows | Open Sea | Abyss |
|---|---|---|---|
| Catches | ~560 | ~390 | ~250 |
| Hot Spot banners (anticipation before the cast) | ~225 | ~180 | ~135 |
| Casts that pay more than the stake | ~240 | ~180 | ~180 |
| Catches ≥ 10× | ~10 | ~9 | ~7 |
| Feeding Frenzies | ~4 | ~2.4 | ~1.7 |
| Catches ≥ 100× | one per ~90 h | one per ~1.6 h | about one per hour |
| Catches ≥ 1,000× | — | one per ~200 h | one per ~21 h |

When a player gets really lucky:

- **Kraken jackpot**: averages $55,000 and has no cap (the biggest in a $5B simulation was $463,648). It's paid from the pot, not the bankroll.
- **Golden Whale**: 5,000× is $2,500 on a 50¢ cast.
- **Abyss cap**: a single cast can pay up to 25,000×.
- **Derbies**: 1st place pays ~160× the entry fee.

**Two mechanics carry the "hot" feeling.** The Hot Spot banner fires before 15–25% of casts, so players constantly see "Swordfish ×25 this cast!". The Feeding Frenzy meter climbs with every catch.

Keep it honest so it stays licensable:

- don't celebrate catches worth less than the stake (UK rules ban this outright);
- don't stage "it almost bit" moments more often than chance;
- the live feed of other players' big catches should only show real catches.

## 6. Changing RTP, and why the owner can't cheat

You get real levers, all applied the same way to everyone and announced in advance.

**Tides** are pre-published variants of every mode. Each is compiled once and gets a SHA-256 hash, which is recorded on every cast it resolves.

| Tide | What changes | Open Sea example |
|---|---|---|
| Normal | — | 96.0% RTP, 42.9% catch rate, SD 7.1 |
| Feeding Time | More, smaller bites; Hot Spot ×1.5. **Same RTP** | 96.0%, 49.9% catch, SD 6.2 |
| Storm | Fewer bites, bigger fish (50×+ fish 1.75× as common). **Same RTP** | 96.0%, 32.2% catch, SD 9.2 |
| Golden Hour | +1% RTP, paid from the promo budget | 97.0% |
| Low Tide | −1% RTP. Capped at 4 h per mode per day | 95.0% |

**Schedule rules** are enforced in [schedule.ts](schedule.ts) and checked by the simulator:

- nothing outside 94–98.5% RTP can even be compiled;
- each window must be announced at least 15 minutes ahead;
- a window lasts at most 12 h, with no overlaps and at most 6 windows per mode per day;
- windows apply to every player in that mode, never to one player;
- the schedule is append-only and hash-chained, so editing a past entry breaks `verify()`. Post the chain head publicly, or in an on-chain memo, daily.

The other levers raise *effective* RTP without touching any paytable:

- rakeback and bonus casts;
- open derbies (+0.5% at volume);
- buy-in derby rake (95% RTP; a guaranteed prize pool pushes it higher);
- the Frenzy Buy bonus.

Blended across a typical mix (30% Shallows, 50% Open Sea, 10% Abyss, 10% derbies) the game RTP is **96.00%**.

**Why you can't cheat even as owner:**

- outcomes are `HMAC-SHA256(serverSeed, clientSeed:nonce)`; you commit to `sha256(serverSeed)` before play, and the player chooses the client seed;
- the paytable comes from the public schedule at cast time and is stamped on the result;
- the must-drop jackpot is decided by each cast's own fair roll, so not even you know when it will drop;
- the bankroll changes bet limits only, never odds.

## 7. Jackpots (shared by all modes, 1.21% of RTP)

| Tier | Type | Seed | Fed by | Pays out every | Avg pot when won |
|---|---|---|---|---|---|
| Golden Minnow | random, 1 in 5,000 per $1 cast | $5 | 0.25% of stake | $5,000 wagered | $17.50 |
| Silver Marlin | must drop before $2,500 | $250 | 0.25% of stake | $450,000 wagered | $1,375 |
| Kraken | random, 1 in 10,000,000 per $1 cast | $5,000 | 0.50% of stake | $10,000,000 wagered | $55,000 |

Hit chance scales with stake, so every dollar has the same jackpot odds at any bait. Set `hitEvery` from your real volume so that Mini drops hourly, Major a few times a week and Kraken every month or two.

## 8. Derbies

- **Buy-in derby** (pari-mutuel). RTP = 1 − rake = **95%**, and the house can't lose. With 1,000 × $5 entries the pool is $4,750 and the rake $250. 1st wins $809, 2nd $381, 3rd $247, and 150 places are paid (minimum 1.5× the entry).
- **Open derby** on normal casts, ranked by best single-catch × so small stakes can win. The pool is max($250 guarantee, 0.5% of derby turnover), which adds 0.5% RTP at volume and more when the event is quiet.

## 9. What players experience

This simulates 20,000 sessions per player type. A session stops at bust, at the cash-out target, or after 900 casts (about an hour). Jackpots are included.

| Player | Setup | Walk away up | Bust | Had a ≥10× catch | Had a ≥100× catch | Up after 20 sessions | House keeps per session |
|---|---|---|---|---|---|---|---|
| Casual | $10 at 10¢, Shallows, cash out at 2× | 27.1% | 32.3% | 98.3% | 1.0% | 2.9% | $3.07 |
| Regular | $50 at 20¢, Open Sea, cash out at 3× | 32.8% | 16.2% | 99.6% | 44.5% | 19.1% | $7.59 |
| Degen | $100 at 50¢, Abyss, cash out at 10× | 25.5% | 53.3% | 95.7% | 49.3% | 27.5% | $12.18 |

- **A quarter to a third of sessions end ahead**, and it's different people each night. That's what keeps a casino floor full.
- **Nearly every session has a ≥10× moment**, and about half of Open Sea and Abyss sessions land a ≥100× catch.
- **Over 20 sessions most players are behind**; that's the edge working. Volatility decides how many stay ahead longer: about 3% of Shallows grinders versus 28% of Abyss degens. High volatility makes the big-winner stories that spread the game. Low volatility gives long, gentle sessions.

## 10. The flywheel

One month with 10,000 players playing 8 sessions each, split 70% casual / 25% regular / 5% degen as in §9, with 15% of players entering a $5 derby every week:

| Line | Amount |
|---|---|
| Deposits | $1,960,000 |
| Cast turnover (players recast winnings: τ = 4.67 per deposited $) | $9,155,115 |
| Derby buy-ins | $30,000 |
| Blended game RTP | 96.16% |
| **GGR** (edge earned + derby rake), 18% of deposits | **$353,488** |
| → rakeback (12%) | $42,419 |
| → bundle bonuses (8%; $17,240 actually used) | $28,279 |
| → promos: Golden Hours, open derbies (10%) | $35,349 |
| → referrals (10%) | $35,349 |
| → REEL buyback or holder rewards (15%) | $53,023 |
| → bankroll reserve (15%) | $53,023 |
| → operations (30%) | $106,046 |
| Effective RTP to players incl. perks | 97.31% |

The loop works like this:

- turnover earns the edge (GGR);
- rakeback, bonus casts and promo pools bring players back;
- referral rev-share brings new ones;
- the reserve share grows the bankroll, which unlocks bigger baits and the Abyss;
- bigger bets and visible jackpots produce bigger headline wins, which bring more players.

**Bankroll ladder** (max stake accepted; the biggest possible single win stays ≤ 2% of the bankroll):

| Bankroll | Shallows | Open Sea | Abyss |
|---|---|---|---|
| $25,000 | $1 | $0.10 | closed |
| $100,000 | $2 | $0.20 | closed |
| $250,000 | $10 | $1 | $0.20 |
| $1,000,000 | $25 | $2 | $0.50 |
| $5,000,000 | $100 | $10 | $2 |

**Early stage.** The house needs ~26k (Shallows), ~173k (Open Sea) and ~526k (Abyss) casts before it is 99% sure to be ahead, so the bankroll has to absorb early swings. Lead with Shallows, Open Sea and buy-in derbies, which carry zero risk. Open the Abyss once the reserve allows.

## 11. Before real money

- **Licensing.** Paid casts with a chance of withdrawable prizes are gambling almost everywhere. You need a licence for each market you accept (crypto casinos usually go through Curaçao, Anjouan, Malta or Isle of Man). Geo-block the rest, which includes most US states. US "sweepstakes" models are being banned state by state.
- **Certification.** Get the RNG and these paytables certified (GLI, iTech Labs or BMM), on top of provably-fair. Publish the RTP of every mode and tide in the game.
- **Responsible gambling.** Deposit and loss limits, session reminders, cool-off, self-exclusion, age checks and KYC are required by every licence. They also protect the flywheel from chargebacks and regulators.
- **The REEL token.** If REEL is a token, tying its value to house revenue (buybacks, rev-share) can make it a security. Get counsel before wiring `FLYWHEEL.buyback` to it.

## Files

| File | Purpose |
|---|---|
| [config.ts](config.ts) | All tunable numbers: species, modes, tides, jackpots, pricing, flywheel split, risk, derbies, schedule rules |
| [paytable.ts](paytable.ts) | RTP solver: config + tide → exact per-cast odds, stats and paytable hash |
| [engine.ts](engine.ts) | Cast resolution (with Chum), Frenzy Buy, jackpot pots, provably-fair and simulation RNGs |
| [schedule.ts](schedule.ts) | Tide schedule with notice, limits and a hash chain |
| [pricing.ts](pricing.ts) | $ → casts, hourly cost, bankroll limits, derby payouts, flywheel split, blended RTP |
| [report.ts](report.ts) | Prints every analytic table |
| [simulate.ts](simulate.ts) | Monte Carlo verification, player sessions and a month of the flywheel |

```bash
npm run economy:report
```

```bash
npm run economy:sim -- 30000000
```

Requires Node 22.18+, which runs the TypeScript directly.

