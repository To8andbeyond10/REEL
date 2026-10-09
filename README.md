# REEL: Memefishing

A first-person fishing sim in the browser, played like a realistic fishing game, with a memecoin twist: every fish is a coin and the fish market never sleeps. Built with PlayCanvas and Vite.

The design is in [docs/DESIGN.md](docs/DESIGN.md).

## What's in this build

- **Genesis Lake** in 3D: terrain, animated water, forest, reeds, a dock, and three spots (Old Dock, Reed Bay, Deep Point) with their own depths and fish.
- **Gear:** 3 rods, 3 reels, 3 lines and 6 lures and rigs (float, spinner, jig, popper, bottom rig, crankbait), each with real stats.
- **Six species** with real fish habits: depth, favourite lures, retrieve speed, time of day and weather.
- **Bites:** floats nibble then go under; lures thump the rod. Strike on the take.
- **The fight:** line tension, drag that slips, head shakes, runs, dives, jumps, rod load, slack line. Holding reel the whole time loses anything decent.
- **Day and night, weather**, sky and lighting that follow the clock.
- **Fish market:** prices per kg move every game minute, with pumps, rug pulls and bull/bear sentiment. Bag fish and sell when the price is right, or release them for XP.
- XP and levels unlock gear and spots. Fish journal. Procedural sound. Saves in the browser.

MEME is an in-game currency only. There is no blockchain, wallet or real money.

## Run locally

```bash
npm install
npm run dev
npm test   # fight, bite and balance tests (no browser needed)
```

## Controls

| Action | Mouse and keyboard | Touch |
|---|---|---|
| Aim | Move the mouse, or A / D | Drag on the screen |
| Cast | Hold left click or Space, release | Hold Cast / Reel, release |
| Retrieve / reel | Hold left click or Space | Hold Cast / Reel |
| Strike, lift rod, hop a jig | Right click or F | Strike / Lift |
| Drag | Mouse wheel or [ and ] | Drag − / + |
| Reel speed | W / S | Speed − / + |
| Float depth | Q / E (or in Tackle) | Tackle |
| Menus | T tackle, B market, M map, J journal, H help | Buttons |
| Time ×20 | Z | Button |

## Code layout

- `src/sim/` is the game rules, with no rendering: fight physics, bite model, lake depth map, world clock and weather, market, player profile. Tested with `node --test`.
- `src/game/` is the PlayCanvas scene, rod and effects, procedural audio and the HUD and menus.
- `src/main.js` wires the two together and runs the fishing loop.
