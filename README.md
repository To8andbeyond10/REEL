# REEL
Memecoin Fishing Game

## Prototype source

This repository now contains a small PlayCanvas fishing prototype with:

- a start screen and 90 second session loop
- cast, bite, hook, reel, catch, and fail states
- score, streak, and local coin persistence
- touch and keyboard controls

## Run locally

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

The fishing rules live in `src/fishing.js` with no rendering code, so `test/fishing.test.js` can simulate thousands of fights to check the balance.

## Controls

- **Cast:** button or `Space`
- **Hook:** button or `Space` during a bite
- **Reel:** hold the reel button or hold `Space`. Reel while the fish rests and let go when the bobber twitches: holding through a surge snaps the line.
- **Pause:** button or `P`
