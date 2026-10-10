/**
 * Resolves casts. Every outcome is a pure function of (mode, stake, RNG stream): no player history, pool
 * balance or bankroll ever changes the odds. The bankroll only limits how big a stake is accepted (see pricing.ts).
 */
import { createHash, createHmac } from 'node:crypto';
import { JACKPOTS, type SpeciesId } from './config.ts';
import type { CompiledMode } from './paytable.ts';

/** Uniform float in [0, 1). */
export type Rng = () => number;

/**
 * Provably-fair stream: HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${round}`), 6 bytes (48 bits) per float.
 * Show sha256(serverSeed) before play and reveal serverSeed when it rotates; anyone can then replay every cast.
 */
export function fairRng(serverSeed: string, clientSeed: string, nonce: number): Rng {
  let round = 0;
  let buf: Buffer = Buffer.alloc(0);
  let pos = 0;
  return () => {
    if (pos + 6 > buf.length) {
      buf = createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:${round++}`).digest();
      pos = 0;
    }
    const v = buf.readUIntBE(pos, 6) / 2 ** 48;
    pos += 6;
    return v;
  };
}

export const hashServerSeed = (serverSeed: string) => createHash('sha256').update(serverSeed).digest('hex');

/** Fast seeded generator (sfc32, 53-bit floats) for simulations. Not for real-money outcomes. */
export function simRng(seed: number): Rng {
  let a = 0x9e3779b9;
  let b = 0x243f6a88;
  let c = 0xb7e15162;
  let d = seed | 0;
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 16; i++) next();
  return () => ((next() >>> 5) * 67108864 + (next() >>> 6)) / 9007199254740992;
}

export type JackpotWin = { id: string; amount: number };

/** Shared progressive pots. Each stake feeds every tier; see JackpotTier for how a tier decides a hit. */
export class JackpotPool {
  pots: Record<string, number>;

  constructor(pots?: Record<string, number>) {
    this.pots = pots ?? Object.fromEntries(JACKPOTS.map((j) => [j.id, j.seed]));
  }

  /** Always consumes one RNG draw per tier so fair replays stay aligned. Returns the tiers hit. */
  play(stake: number, rng: Rng): JackpotWin[] {
    const wins: JackpotWin[] = [];
    for (const j of JACKPOTS) {
      const added = stake * j.contribution;
      const before = this.pots[j.id];
      this.pots[j.id] = before + added;
      const u = rng();
      // Must-drop: the drop point is uniform under the cap, so given it hasn't dropped yet, the chance it
      // lies inside this cast's contribution is added / (cap − before); at the cap that reaches 1.
      const hit = 'hitEvery' in j ? u < stake / j.hitEvery : u < added / Math.max(j.mustDropBy - before, added);
      if (hit) {
        wins.push({ id: j.id, amount: this.pots[j.id] });
        this.pots[j.id] = j.seed;
      }
    }
    return wins;
  }
}

export type FrenzyCatch = { species: SpeciesId; size: number; multiplier: number; x: number };

export type CastResult = {
  /** Base stake; wins are multiples of it. */
  stake: number;
  /** What the player paid: the stake, × chumCostX with Chum on, × frenzyBuyX for a Frenzy Buy. */
  cost: number;
  /** Which published paytable resolved this cast (e.g. "openSea/goldenHour") and its hash. */
  paytable: string;
  paytableHash: string;
  outcome: 'nothing' | 'catch' | 'frenzy' | 'chest';
  /** Revealed before the cast resolves, whether or not that species bites. */
  hotSpot: { species: SpeciesId; x: number } | null;
  catch: { species: SpeciesId; size: number; x: number } | null;
  frenzy: FrenzyCatch[] | null;
  chestX: number | null;
  /** Win in × stake after the max-win cap, jackpots excluded. */
  winX: number;
  /** What the cap removed (× stake). */
  cappedX: number;
  payout: number;
  jackpots: JackpotWin[];
};

const pick = (cdf: number[], u: number) => {
  for (let i = 0; i < cdf.length; i++) if (u < cdf[i]) return i;
  return cdf.length - 1;
};

const sizeRoll = (spread: number, rng: Rng) => 1 - spread + 2 * spread * rng();

export function playFrenzy(mode: CompiledMode, rng: Rng): FrenzyCatch[] {
  const { casts, biteRate, multStep, species, mults, cdf } = mode.frenzy;
  const catches: FrenzyCatch[] = [];
  let multiplier = 1;
  for (let t = 0; t < casts; t++) {
    if (rng() >= biteRate) continue;
    const i = pick(cdf, rng());
    const size = sizeRoll(mode.sizeSpread, rng);
    catches.push({ species: species[i], size, multiplier, x: mults[i] * size * multiplier });
    multiplier += multStep;
  }
  return catches;
}

/**
 * One cast. RNG draw order is fixed (jackpot tiers, hot spot, outcome, details) so a revealed seed replays it.
 * Pass the live JackpotPool in production; simulations of base RTP can omit it.
 * Chum costs chumCostX × stake and doubles the Frenzy odds, which leaves RTP unchanged. Jackpots see the base stake.
 */
export function cast(
  mode: CompiledMode,
  stake: number,
  rng: Rng,
  pool?: JackpotPool,
  { chum = false }: { chum?: boolean } = {},
): CastResult {
  const jackpots = pool ? pool.play(stake, rng) : (JACKPOTS.forEach(() => rng()), []);
  const cdf = chum ? mode.chumCdf : mode.cdf;

  let hotSpot: CastResult['hotSpot'] = null;
  if (rng() < mode.hot.chance) {
    const species = mode.hot.species[Math.floor(rng() * mode.hot.species.length)];
    hotSpot = { species, x: mode.hot.mults[pick(mode.hot.cdf, rng())] };
  }

  const u = rng();
  const nCatch = mode.catches.length;
  let i = nCatch + 2;
  for (let k = 0; k < cdf.length; k++) {
    if (u < cdf[k]) {
      i = k;
      break;
    }
  }

  let outcome: CastResult['outcome'] = 'nothing';
  let catchResult: CastResult['catch'] = null;
  let frenzy: FrenzyCatch[] | null = null;
  let chestX: number | null = null;
  let rawX = 0;

  if (i < nCatch) {
    const row = mode.catches[i];
    const size = sizeRoll(mode.sizeSpread, rng);
    const boost = hotSpot && hotSpot.species === row.id ? hotSpot.x : 1;
    rawX = row.mult * size * boost;
    outcome = 'catch';
    catchResult = { species: row.id, size, x: rawX };
  } else if (i === nCatch) {
    outcome = 'frenzy';
    frenzy = playFrenzy(mode, rng);
    for (const f of frenzy) rawX += f.x;
  } else if (i === nCatch + 1) {
    outcome = 'chest';
    chestX = mode.chest.prizes[Math.floor(rng() * mode.chest.prizes.length)];
    rawX = chestX;
  }

  const winX = Math.min(rawX, mode.maxWinX);
  return {
    stake,
    cost: chum ? stake * mode.stats.chumCostX : stake,
    paytable: mode.id,
    paytableHash: mode.hash,
    outcome,
    hotSpot,
    catch: catchResult,
    frenzy,
    chestX,
    winX,
    cappedX: rawX - winX,
    payout: stake * winX,
    jackpots,
  };
}

/** Frenzy Buy: pay frenzyBuyX × stake to start a Feeding Frenzy straight away. It isn't a cast, so no jackpots. */
export function buyFrenzy(mode: CompiledMode, stake: number, rng: Rng): CastResult {
  const frenzy = playFrenzy(mode, rng);
  const rawX = frenzy.reduce((sum, f) => sum + f.x, 0);
  const winX = Math.min(rawX, mode.maxWinX);
  return {
    stake,
    cost: stake * mode.stats.frenzyBuyX,
    paytable: mode.id,
    paytableHash: mode.hash,
    outcome: 'frenzy',
    hotSpot: null,
    catch: null,
    frenzy,
    chestX: null,
    winX,
    cappedX: rawX - winX,
    payout: stake * winX,
    jackpots: [],
  };
}
