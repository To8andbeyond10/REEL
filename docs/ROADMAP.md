# Memefishing: top-tier feature roadmap

What a top-tier fishing game needs to keep players coming back, what this build already has, and what to build next, in order. Fishing Planet is the reference for how the game should play and feel; nothing here copies its names, art or assets. MEME stays an in-game currency with no blockchain, wallet or real money.

## Shipped in this build

**Variety: four waters, each its own "chain"**

| Water | Feel | Signature fish | How it plays differently |
|---|---|---|---|
| Genesis Lake (home) | Pines, reeds, an old dock | Whale of Gains | The tutorial lake; every technique works |
| Shitcoin Swamp (Lv 2, 30 gas) | Cypress, Spanish moss, lily pads, fireflies, a lantern-lit boardwalk | Rugpull Gar | Shallow and murky, thick fog, frogs and bats at night, bony-mouthed gar throw hooks |
| Bull Run River (Lv 3, 60 gas) | A sandstone canyon, boulders, white water | Satoshi Sturgeon | The current drifts your float downstream and adds pull to every fight |
| Cold Wallet Lake (Lv 4, 90 gas) | Snowy peaks, ice floes, snow showers | Diamond Char | Deep and clear; stand on the ice shelf or a cliff ledge over a 20 m hole |

**Situations that change the session**

- Whale alerts: a legendary boils at the surface somewhere you can reach, with a big bite boost for an hour.
- Diving birds: gulls work a bait ball and every fish under them feeds hard.
- Feeding frenzies and sulks: when a fish's coin pumps it feeds harder, and after a rug pull it goes quiet.
- Storm fronts: pressure drops before a thunderstorm and everything bites. Then comes lightning, thunder and heavy rain.
- Weather per water: sun, overcast, rain, thunderstorms, morning fog and snow, with a forecast on the HUD.

**Goals**

- Missions: three contracts per water, such as catch counts, weight targets, night fishing, release streaks, selling into a pump and a legendary bounty.
- Derbies: four-hour competitions three times a day on every water against seven rival anglers, with heaviest-fish, best-bag and most-fish formats and a 50/30/20 prize pool.

**Feel**

- Fish finder: a sonar strip along your cast line that shows the bottom, your lure and the fish arcs. It reads the same numbers the bite model uses, so it tells the truth.
- Wildlife: gulls, bats, fireflies, frogs, fish rising, foam drifting downstream and boils you can see.
- Photo mode and trophy photos: hold up your catch and save a captioned shot.
- Big-game tier: a surf rod, a 26 kg drag reel and 65 lb braid for sturgeon and gar.

## Next up, in priority order

1. **Boats.** Rent a boat or kayak per water and fish open water. Boats reach water you can't cast to from the bank, and they add trolling, which is how you fish for lakers and char.
2. **Art pass.** This is the largest single jump in perceived quality:
   - glTF fish with skeletal swimming and a close-up underwater hook-up camera;
   - a proper water shader with reflection, refraction, depth fog and shoreline foam;
   - wind in the foliage, bloom, ambient occlusion and a physical sky.
3. **Seasons and ice fishing.** A season clock that moves water temperature and fish depth, with a winter mode on Cold Wallet Lake: drill a hole and jig through the ice.
4. **Smarter fish.** Individual fish and schools that roam, react to your lure and spook from noise. The sonar would then show real fish instead of sampled arcs.
5. **Tackle depth:**
   - leaders (wire for pike and gar teeth, fluoro for wary trout);
   - hook sizes, line wear and knot strength;
   - bait you catch yourself, so small fish become live bait.
6. **Trophy room.** Mount your best fish, keep a record book per species and water, and add achievements and a keepnet aquarium.
7. **Multiplayer and clubs.** Shared waters, real leaderboards, live derbies against real players and fishing clubs. Derbies need server authority first (see below).
8. **Live-ops loop.** Daily and weekly challenges, a seasonal pass with cosmetic rewards (rod skins, float colours, outfits) and rotating "chain events", all in MEME.
9. **Controls and access.** Gamepad with rumble on bites and drag slip, remappable keys, a colourblind-safe tension meter and subtitles for audio cues.
10. **Audio.** Recorded ambience per water, a real reel click and drag scream, and adaptive music for fights and derbies.

## Crypto layer ideas (all in-game)

- Prediction market: stake MEME on which coin pumps next or who wins a derby.
- Liquidity pools: lock MEME for a day for a share of derby fees.
- Rare catches move the market. Landing a legendary pumps its coin for everyone on the server.
- "Proof of catch" certificates in the trophy room: in-game only, with no tokens.

## Foundations these depend on

- Accounts and cloud saves, so progress follows you between devices.
- Server-authoritative derbies and catches, so leaderboards can't be faked.
- CI that runs `npm test` and a headless smoke test on every PR.
- Mobile performance: tree instancing, LODs and adaptive resolution.
