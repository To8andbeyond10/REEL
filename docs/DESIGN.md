# Memefishing redesign: a real fishing sim with a crypto twist

Written 2026-10-09. Reference game: Fishing Planet (Fishing Planet LLC). We copy how it *plays* and the *kind* of look it has, never its names, art, maps or assets.

## The one-line pitch

A first-person, realistic freshwater fishing sim where every fish is a memecoin. You read the water, pick the right rod, reel, line and lure, fight the fish with drag and line tension, then decide whether to sell it on a live, swinging fish market or release it for XP.

## Why the old prototype is being replaced

REEL today is a 2D side view with a 90 second arcade timer and one "hold to reel" button. Holding the button always won, which is the "hack to get a fish every time" Robby called out. Nothing in that loop resembles a fishing sim, so the rebuild starts over from the systems below rather than patching it. PlayCanvas in the browser stays as the engine (Robby chose "Stay on web").

## Decisions taken by default (Robby can overturn any of these)

| Decision | Default | Why |
|---|---|---|
| Crypto layer | Purely an in-game economy. No real blockchain, wallet, token or real money. | Real tokens bring legal, app store and security baggage, and none of it is needed to make the twist fun. Easy to revisit later. |
| Engine | PlayCanvas, browser, desktop first with touch controls | Robby's pick. Builds and tests here, playable link for anyone. |
| Camera | First person from the bank or dock, like Fishing Planet | It is what makes it feel like a sim rather than an arcade game. |
| Session | Open-ended days at a lake, no 90 second timer | Sims are about patience and conditions, not a countdown. |

## Fishing Planet's core systems, and how Memefishing does each

### 1. Waters and locations
**Fishing Planet:** many large, realistic waterways (lakes, rivers, ponds) based on real regions. Each has fishing spots, its own species mix, depths, structure (weeds, drop-offs, snags) and a fishing license. You travel between waterways and pay to stay there by the day.

**Memefishing:** "Chains" instead of states. Each water is a themed chain/ecosystem.
- Slice: **Genesis Lake**, one lake with 3 spots (Dock, Reed Bay, Deep Point). Each spot has a depth profile and species density.
- Later: Shitcoin Swamp (murky, catfish types), Bull Run River (current, trout types), the Deep Liquidity Pool (offshore, big game).
- Travel costs in-game coin and unlocks by level. A "chain fee" replaces the license.

### 2. Gear: rod, reel, line, terminal tackle, lures and bait
**Fishing Planet:** rods (spinning, casting, float/match, bottom) with power, action, length and max load. Reels with gear ratio, drag max and line capacity. Lines (mono, fluorocarbon, braid) with test strength and stretch. Hooks, floats, sinkers, leaders. Lures (spinners, spoons, crankbaits, jigs, soft plastics, topwater) and baits (worms, corn, minnows). Everything wears and can break.

**Memefishing (slice):**
- **Rod:** max load (kg), action (how much it cushions head shakes), cast distance bonus.
- **Reel:** max drag (kg), retrieve speed (m/s), line capacity (m).
- **Line:** break strength (kg), stretch (shock absorption), visibility (lowers bites from wary fish).
- **Lure/bait:** type (float + worm, spinner, crankbait, soft jig, topwater popper), running depth, best retrieve speed. Float rigs have a depth setting.
- Meme flavor in names and descriptions ("Diamond Hands Spinning Rod", "HODL 12 lb Braid", "Rug Pull Popper"). Stats are realistic.
- Later: wear and repair, leaders, hooks, sinkers, rod pods for bottom fishing, boats.

### 3. Fish behavior and bites
**Fishing Planet:** each species has habitat (depth, structure), feeding times, preferred baits and retrieves, and reacts to weather, pressure and temperature. Bites show as float dips or rod tip taps, and you must strike in time. Fish weight is drawn from a realistic range with trophies and unique fish being rare.

**Memefishing:** each species is a memecoin with a real fish's habits underneath.

| Species (coin) | Real behavior it copies | Likes | Fight |
|---|---|---|---|
| Doge Gill | bluegill / sunfish | worms on a float, shallow, all day | short darts, easy |
| Bonk Perch | yellow perch | small spinners, mid depth, daytime | steady, a few shakes |
| Pepe Bass | largemouth bass | soft jigs and poppers near weeds, dawn and dusk | hard runs, jumps, head shakes |
| Shiba Trout | rainbow trout | spinners, cool and overcast | fast runs, lots of shakes |
| Stonks Cat | channel catfish | bait on the bottom, deep, night | long heavy pulls, dives |
| Whale of Gains | muskie (legendary) | big crankbaits, deep, rare | brutal runs, big shakes |

- **Bite rate** per second for each species = spot density × lure match × depth match × time-of-day curve × weather × retrieve-speed match × line visibility.
- **Bite cues:** float bobs then dips under; on lures the rod tip taps and the line jumps. You must **strike** in a short window. Too early or too late and it spits the hook.
- **Weight** is drawn per species (log-normal), so trophies are genuinely rare.

### 4. The fight (the heart of the game)
**Fishing Planet:** line tension indicator, rod and reel load. Drag lets line slip when the fish pulls harder than the drag setting. Too tight a drag or too much pressure snaps the line or breaks the rod. Too loose and the fish strips line or gets off. Lifting the rod puts pressure on and tires the fish. Fish run, shake their heads, dive and jump.

**Memefishing:** a real-time physics model (in `src/sim/fight.js`, tested without a browser).
- The line is a spring between the reel and the fish. Tension comes from stretch, scaled by line stretch and rod action.
- The fish has stamina and a behavior state machine: **run, hold, shake, dive, jump, tired**. Each species sets how often and how hard each happens.
- **Drag:** whenever tension passes the drag setting, line slips out. Run out of spool and the line is gone.
- **Reel:** hold to retrieve. Reeling against a heavy fish raises tension; the reel stalls past its max load.
- **Lift rod:** adds pressure, tires the fish faster, but raises tension.
- **Shocks:** head shakes add tension spikes. Drag cannot react to them instantly, so a stiff rod plus low-stretch line can snap on a shake even with sensible drag.
- **Slack:** a loose line for too long lets the fish throw the hook.
- **Failure states:** line snapped, rod broken, fish unhooked, spool emptied.
- Holding reel the whole time with max drag loses big fish. Never reeling loses them too. Playing the drag and the fish's moods is how you win.

### 5. Environment: time of day, weather, conditions
**Fishing Planet:** full day/night cycle, weather forecast, air and water temperature, wind and pressure, all changing bite rates.

**Memefishing:** in-game clock (1 real second = 1 game minute), sky color, sun angle, fog and light all follow it. Weather rolls per few hours: Sunny, Cloudy, Rain, plus a "market sentiment" state (see crypto layer) shown like a forecast. Each species has a time-of-day curve and a weather preference.

### 6. Catch handling, keepnet and selling
**Fishing Planet:** after landing you see species, weight and length, then keep it in a keepnet (with capacity) or release it. Fish sell at the end of a stay. Releasing earns XP.

**Memefishing:** a catch card with species, weight, length, rarity and a meme caption. Choose **Bag it** (into the keepnet / "bag") or **Release** (XP bonus). Bag holds a few fish; you sell them at the **Fish Market** at the current price.

### 7. Progression and economy
**Fishing Planet:** XP and levels unlock gear and waters. Two currencies (one earned, one premium). Missions and competitions.

**Memefishing:** the crypto twist lives here.
- **Wallet:** your coin balance, shown like a wallet with a portfolio of bagged fish. Purely in-game.
- **Live fish market:** each species has a price per kg that moves over time (random walk with a trend). Sell into a pump, hold through a dip. Market sentiment (bull/bear) moves all prices together and slightly changes bites ("bull run: fish are hungry").
- **Market events:** a "pump" spikes one species' price for a short time; a "rug pull" crashes one. Announced in a ticker across the top.
- **XP and levels:** catches and releases give XP. Levels unlock gear in the Tackle Shop and new waters.
- **Fish journal:** every species with caught/not caught, personal best weight, count.
- Later: missions ("bag 3 Pepe Bass before dawn"), tournaments ("most kg in an hour"), trophy fish and unique named whales, an NFT-style trophy wall (in-game only).

### 8. Graphics and presentation
**Fishing Planet:** realistic 3D waters, terrain, vegetation, lighting that shifts through the day, detailed rods that bend under load, a visible line, floats and lures, splashes and fish jumps.

**Memefishing (slice, browser):**
- First-person 3D: terrain with shore and hills, animated water surface, forest of trees, reeds, a wooden dock, fog and a sky that changes with time.
- A rod in view that bends with tension, a line drawn from the tip that sags when slack and pulls straight when tight.
- Float bobbing, splash on cast and on jumps, ripples, the fish breaching on jumps and when landed.
- HUD modeled on sim fishing: tension bar with the line's limit marked, drag and reel speed, line out, depth, clock, weather, wallet and price ticker.
- Built from code-generated meshes, no imported assets yet. Real models, textures and sound are the next big lift, and that is where "AAA" money and time go. The browser can get far (PlayCanvas supports PBR, real-time shadows and post effects), but it will not match a native Unity/Unreal game at full scale.

### 9. Controls
| Action | Mouse/keyboard | Touch |
|---|---|---|
| Aim | Move mouse / A, D | Drag on screen |
| Cast | Hold left click or Space, release at the power you want | Hold and release Cast |
| Reel / retrieve | Hold left click or Space | Hold Reel |
| Reel speed | W / S | + / - |
| Drag | Mouse wheel or [ and ] | Drag + / - |
| Strike / lift rod | Right click or F | Strike |
| Float depth | Q / E | in Tackle |
| Menus | T tackle, M map, J journal, B market | buttons |

## What the vertical slice includes

One lake (Genesis Lake) with 3 spots, 6 species, 3 rods, 3 reels, 3 lines, 5 lures/baits, a Tackle Shop, the fight model, bite cues and strikes, day/night and weather, keepnet and a live fish market, XP and levels, a fish journal, saving to the browser. Plus automated balance tests for the fight and bite math.

## Not in the slice (next steps, in order)

1. Real art: modeled fish, rod, reel, vegetation, PBR water. Sound (reel clicks, drag scream, splashes, ambient birds).
2. Second water and travel, boats.
3. Missions and tournaments.
4. Gear wear and repair, more terminal tackle.
5. Online leaderboards.
