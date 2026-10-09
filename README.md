# REEL: Memefishing

A first-person fishing sim in the browser, played like a realistic fishing game, with a memecoin twist: every fish is a coin and the fish market never sleeps. Built with PlayCanvas and Vite.

The design is in [docs/DESIGN.md](docs/DESIGN.md) and what comes next is in [docs/ROADMAP.md](docs/ROADMAP.md).

## What's in this build

- **Four waters**, each its own "chain" with its own scenery, weather, fish and legendary. Bridging between them costs a gas fee.
  - **Genesis Lake:** pines, reeds and an old dock.
  - **Shitcoin Swamp:** cypress, moss, lily pads, fog, fireflies and a lantern-lit boardwalk.
  - **Bull Run River:** a sandstone canyon where the current drifts your float and pulls on every fight.
  - **Cold Wallet Lake:** snowy peaks, ice floes, an ice shelf and a cliff ledge over a deep hole.
- **Live events:**
  - whale alerts, where a legendary is boiling nearby;
  - diving birds over bait balls;
  - feeding frenzies when a coin pumps, and sulks after a rug pull;
  - storm fronts with lightning and thunder;
  - fog and snow.
- **Missions:** three contracts per water. **Derbies:** four-hour competitions against rival anglers with prize pools.
- **Gear:** 4 rods, 4 reels, 4 lines, 7 rigs and a fish finder (sonar along your cast line). Big-game gear for sturgeon and gar.
- **13 species** with real fish habits: depth, favourite lures, retrieve speed, time of day and weather.
- **Bites:** floats nibble then go under; lures thump the rod. Strike on the take.
- **The fight:** line tension, drag that slips, head shakes, runs, dives, jumps, rod load and slack line. River current adds pull.
- **Fish market:** prices per kg move every game minute, with pumps, rug pulls and bull/bear sentiment.
- **Wildlife and photos:** gulls, bats, fireflies, frogs and rising fish. Photo mode and captioned trophy photos.
- XP and levels unlock gear, spots and waters. Fish journal. Procedural sound. Saves in the browser.

MEME is an in-game currency only. There is no blockchain, wallet or real money.

## Run locally

```bash
npm install
npm run dev
npm test   # fight, bite, waters, events, missions, derby, sonar and balance tests (no browser needed)
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
| Menus | T tackle, B market, M map and waters, O missions and derbies, J journal, H help | Buttons |
| Fish finder | K | Tackle |
| Photo mode | P, then click or Space to snap | Photo button |
| Time ×20 | Z | Button |

## Code layout

- `src/sim/` is the game rules, with no rendering: fight physics, bite model, the waters (shapes, depth, current, spots), world clock and weather, market, live events, missions, derbies, sonar and the player profile. Tested with `node --test`.
- `src/game/` is the PlayCanvas world builder (terrain, water, trees, props and weather for any water), wildlife, rod and effects, procedural audio and the HUD and menus.
- `src/main.js` wires the two together and runs the fishing loop.
