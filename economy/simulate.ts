/**
 * Monte Carlo check of the economy. Run: node economy/simulate.ts [castsPerMode=20000000]
 *  1. Engine vs solver: realized RTP, hit rates and feature odds per mode and per Open Sea tide.
 *  2. Jackpot pots: realized return per $ vs the renewal-reward formula.
 *  3. Provably-fair replay and the tide schedule's rules.
 *  4. Player sessions: who walks away up, how far $ goes, turnover per deposit.
 *  5. One month of the flywheel.
 */
import assert from 'node:assert/strict';
import { DERBY, JACKPOTS, TIDES, type ModeKey, type TideKey } from './config.ts';
import { buyFrenzy, cast, fairRng, hashServerSeed, JackpotPool, simRng } from './engine.ts';
import { jackpotRtp, tierAvgPot, tierRtp, tierTurnoverPerHit, type CompiledMode } from './paytable.ts';
import { bundleBonus, compileAll, flywheel, maxAffordableBundleBonus, quoteCasts } from './pricing.ts';
import { publishPaytables, TideSchedule } from './schedule.ts';

const CASTS = Number(process.argv[2] ?? 20_000_000);
const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;
const usd = (x: number) => `$${Math.round(x).toLocaleString('en-US')}`;
const oneIn = (p: number) => (p > 0 ? `1 in ${Math.round(1 / p).toLocaleString('en-US')}` : '—');
const table = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join(
    '\n',
  );

const modes = compileAll();
const tables = publishPaytables();
const jp = jackpotRtp();

// 1. Engine vs solver ------------------------------------------------------------------------------------------
function runMode(mode: CompiledMode, casts: number, seed: number, chum = false) {
  const rng = simRng(seed);
  let total = 0;
  let squares = 0;
  let cost = 0;
  let hits = 0;
  let profit = 0;
  let x10 = 0;
  let x100 = 0;
  let x1000 = 0;
  let capped = 0;
  let max = 0;
  let frenzies = 0;
  let chests = 0;
  for (let n = 0; n < casts; n++) {
    const r = cast(mode, 1, rng, undefined, { chum });
    const x = r.winX;
    total += x;
    squares += x * x;
    cost += r.cost;
    capped += r.cappedX;
    if (r.outcome !== 'nothing') hits++;
    if (r.outcome === 'frenzy') frenzies++;
    else if (r.outcome === 'chest') chests++;
    if (x > 1) profit++;
    if (x >= 10) x10++;
    if (x >= 100) x100++;
    if (x >= 1000) x1000++;
    if (x > max) max = x;
  }
  // Jackpots ride on the base stake and are checked separately in section 2, so their share is added analytically.
  const rtp = (total + jp * casts) / cost;
  const mean = total / casts;
  const se = Math.sqrt(squares / casts - mean * mean) / Math.sqrt(casts) / (cost / casts);
  return {
    rtp,
    z: (rtp - mode.rtp) / se,
    ci: 1.96 * se,
    hit: hits / casts,
    profit: profit / casts,
    x10: x10 / casts,
    x100: x100 / casts,
    x1000: x1000 / casts,
    max,
    capped: capped / casts,
    frenzy: frenzies / casts,
    chest: chests / casts,
  };
}

console.log(`## 1. Engine vs solver (${CASTS.toLocaleString('en-US')} casts per paytable, $1 stake)\n`);
const sea = modes.openSea;
const runs = [
  ...Object.values(modes).map((m, i) => ({ m, r: runMode(m, CASTS, 1000 + i) })),
  {
    m: { ...sea, name: 'Open Sea + Chum', pFrenzy: 2 * sea.pFrenzy, stats: { ...sea.stats, hitRate: sea.stats.hitRate + sea.pFrenzy } },
    r: runMode(sea, CASTS, 1500, true),
  },
  ...(Object.keys(TIDES) as TideKey[])
    .filter((t) => t !== 'normal')
    .map((t, i) => ({ m: tables.openSea[t], r: runMode(tables.openSea[t], CASTS, 2000 + i) })),
];
console.log(
  table(
    ['Mode', 'Target RTP', 'Simulated RTP (95% CI)', 'z', 'Catch rate sim / math', 'Frenzy sim / math', 'Chest sim / math', 'Lost to cap'],
    runs.map(({ m, r }) => [
      m.name,
      pct(m.rtp),
      `${pct(r.rtp)} ± ${pct(r.ci)}`,
      r.z.toFixed(2),
      `${pct(r.hit)} / ${pct(m.stats.hitRate)}`,
      `${oneIn(r.frenzy)} / ${oneIn(m.pFrenzy)}`,
      `${oneIn(r.chest)} / ${oneIn(m.pChest)}`,
      pct(r.capped, 4),
    ]),
  ),
);
console.log('\nHow wins feel:\n');
console.log(
  table(
    ['Mode', 'Win > stake', '≥ 10×', '≥ 100×', '≥ 1,000×', 'Biggest seen'],
    runs.map(({ m, r }) => [m.name, pct(r.profit, 1), oneIn(r.x10), oneIn(r.x100), oneIn(r.x1000), `${Math.round(r.max).toLocaleString('en-US')}×`]),
  ),
);

console.log('\nFeeding Frenzy, bought directly (2,000,000 Frenzy Buys each):\n');
const frenzyRows = Object.values(modes).map((m, i) => {
  const rng = simRng(3000 + i);
  const n = 2_000_000;
  let s = 0;
  let s2 = 0;
  let cost = 0;
  for (let k = 0; k < n; k++) {
    const r = buyFrenzy(m, 1, rng);
    s += r.winX;
    s2 += r.winX * r.winX;
    cost += r.cost;
  }
  const mean = s / n;
  const sd = Math.sqrt(s2 / n - mean * mean);
  return [
    m.name,
    `${mean.toFixed(2)}× / ${m.frenzy.ev.toFixed(2)}×`,
    `${sd.toFixed(1)} / ${m.frenzy.sd.toFixed(1)}`,
    ((mean - m.frenzy.ev) / (m.frenzy.sd / Math.sqrt(n))).toFixed(2),
    `${pct(s / cost)} / ${pct(m.stats.frenzyBuyRtp)}`,
  ];
});
console.log(table(['Mode', 'Mean payout sim / math', 'SD sim / math', 'z', 'Frenzy Buy RTP sim / math'], frenzyRows));

// 2. Jackpots --------------------------------------------------------------------------------------------------
{
  const stake = 100;
  const casts = 50_000_000;
  const pool = new JackpotPool();
  const rng = simRng(4000);
  const hits: Record<string, number> = {};
  const paid: Record<string, number> = {};
  const biggest: Record<string, number> = {};
  for (let n = 0; n < casts; n++) {
    for (const w of pool.play(stake, rng)) {
      hits[w.id] = (hits[w.id] ?? 0) + 1;
      paid[w.id] = (paid[w.id] ?? 0) + w.amount;
      biggest[w.id] = Math.max(biggest[w.id] ?? 0, w.amount);
    }
  }
  const turnover = stake * casts;
  console.log(`\n## 2. Jackpots (${usd(turnover)} wagered at $${stake} a cast)\n`);
  console.log(
    table(
      ['Tier', 'Payouts sim / expected', 'Avg pot when won sim / math', 'Biggest pot won', 'Return per $ sim / math'],
      JACKPOTS.map((j) => {
        const h = hits[j.id] ?? 0;
        // Accrued return counts what's still sitting in the pot, so a pot that hasn't dropped yet isn't "missing".
        const accrued = (paid[j.id] ?? 0) + pool.pots[j.id] - j.seed;
        return [
          j.name,
          `${h.toLocaleString('en-US')} / ${Math.round(turnover / tierTurnoverPerHit(j)).toLocaleString('en-US')}`,
          `${usd(h ? paid[j.id] / h : 0)} / ${usd(tierAvgPot(j))}`,
          usd(biggest[j.id] ?? 0) + ('mustDropBy' in j ? ` (cap ${usd(j.mustDropBy)})` : ''),
          `${pct(accrued / turnover, 3)} / ${pct(tierRtp(j), 3)}`,
        ];
      }),
    ),
  );
}

// 3. Provably fair ---------------------------------------------------------------------------------------------
{
  const serverSeed = 'example-server-seed-rotate-me';
  const replay = (nonce: number) => cast(modes.openSea, 1, fairRng(serverSeed, 'player-chosen-seed', nonce), new JackpotPool());
  for (let nonce = 0; nonce < 1000; nonce++) assert.deepEqual(replay(nonce), replay(nonce));
  let s = 0;
  const n = 200_000;
  for (let nonce = 0; nonce < n / 5; nonce++) {
    const rng = fairRng(serverSeed, 'uniformity', nonce);
    for (let k = 0; k < 5; k++) s += rng();
  }
  console.log(
    `\n## 3. Provably fair + owner controls\n\nCommitment shown before play: sha256(serverSeed) = ${hashServerSeed(serverSeed).slice(0, 16)}…` +
      `\n1,000 casts replayed from (serverSeed, clientSeed, nonce): all identical. Mean of ${n.toLocaleString('en-US')} fair floats: ${(s / n).toFixed(4)}\n`,
  );

  const schedule = new TideSchedule(tables);
  const now = Date.UTC(2026, 9, 10, 12, 0); // noon UTC
  const at = (h: number) => now + h * 3_600_000;
  const clock = (h: number) =>
    `${String((12 + Math.floor(h)) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const attempt = (mode: ModeKey, tide: TideKey, from: number, to: number) => {
    const label = `${tables[mode][tide].name} ${clock(from)}–${clock(to)}`;
    try {
      schedule.announce(mode, tide, at(from), at(to), now);
      return `- ✅ ${label}`;
    } catch (e) {
      return `- ❌ ${label}: ${(e as Error).message}`;
    }
  };
  console.log(`Announced at ${clock(0)} UTC:`);
  console.log(
    [
      attempt('openSea', 'goldenHour', 8, 9),
      attempt('abyss', 'storm', 2, 4),
      attempt('openSea', 'lowTide', 5 / 60, 2),
      attempt('openSea', 'storm', 8.5, 10),
      attempt('openSea', 'lowTide', 1, 4),
      attempt('openSea', 'lowTide', 5, 7),
      attempt('shallows', 'feedingTime', 0.5, 14.5),
    ].join('\n'),
  );
  const live = schedule.paytableAt('openSea', at(8.5));
  const castThen = cast(live, 1, fairRng(serverSeed, 'player-chosen-seed', 7));
  const forged = new TideSchedule(tables);
  forged.entries.push(...schedule.entries.map((e) => ({ ...e })));
  forged.entries[0].tide = 'lowTide';
  console.log(
    `\nA cast at ${clock(8.5)} on Open Sea uses \`${castThen.paytable}\` (hash ${castThen.paytableHash.slice(0, 12)}…), ` +
      `matching the announced window: ${castThen.paytableHash === schedule.entries[0].paytableHash}. ` +
      `At ${clock(7)} it uses \`${schedule.paytableAt('openSea', at(7)).id}\`.` +
      `\nSchedule chain verifies: ${schedule.verify()}. After secretly turning that Golden Hour into Low Tide: ${forged.verify()}.`,
  );
}

// 4. Player sessions -------------------------------------------------------------------------------------------
const PLAYERS = [
  { name: 'Casual', mode: 'shallows', deposit: 10, baitX: 1, cashOutAtX: 2, maxCasts: 900, share: 0.7 },
  { name: 'Regular', mode: 'openSea', deposit: 50, baitX: 2, cashOutAtX: 3, maxCasts: 900, share: 0.25 },
  { name: 'Degen', mode: 'abyss', deposit: 100, baitX: 5, cashOutAtX: 10, maxCasts: 900, share: 0.05 },
] as const satisfies readonly { mode: ModeKey }[];

type Session = { final: number; casts: number; turnover: number; best: number; reason: 'bust' | 'target' | 'time' };

function playSessions(p: (typeof PLAYERS)[number], n: number, seed: number) {
  const rng = simRng(seed);
  // Pots start at their long-run average size, like a live game that's been running a while.
  const pool = new JackpotPool(Object.fromEntries(JACKPOTS.map((j) => [j.id, tierAvgPot(j)])));
  const mode = modes[p.mode];
  const out: Session[] = [];
  for (let i = 0; i < n; i++) {
    const q = quoteCasts(p.deposit, p.baitX);
    let balance = q.credits;
    let casts = 0;
    let best = 0;
    while (casts < p.maxCasts && balance >= q.stake - 1e-9 && balance < p.deposit * p.cashOutAtX) {
      const r = cast(mode, q.stake, rng, pool);
      balance += r.payout - q.stake + r.jackpots.reduce((a, j) => a + j.amount, 0);
      best = Math.max(best, r.winX);
      casts++;
    }
    const reason = balance < q.stake - 1e-9 ? 'bust' : balance >= p.deposit * p.cashOutAtX ? 'target' : 'time';
    out.push({ final: balance, casts, turnover: casts * q.stake, best, reason });
  }
  return out;
}

const SESSIONS = 20_000;
const sessionStats = PLAYERS.map((p, i) => {
  const s = playSessions(p, SESSIONS, 5000 + i);
  const finals = s.map((x) => x.final / p.deposit).sort((a, b) => a - b);
  const mean = (f: (x: Session) => number) => s.reduce((a, x) => a + f(x), 0) / s.length;
  const share = (f: (x: Session) => boolean) => s.filter(f).length / s.length;
  // 20 independent sessions per player, resampled from the simulated ones.
  const rng = simRng(6000 + i);
  let lifetimeUp = 0;
  for (let k = 0; k < 20_000; k++) {
    let net = 0;
    for (let j = 0; j < 20; j++) net += s[Math.floor(rng() * s.length)].final - p.deposit;
    if (net > 0) lifetimeUp++;
  }
  return {
    p,
    avgCasts: mean((x) => x.casts),
    bust: share((x) => x.reason === 'bust'),
    target: share((x) => x.reason === 'target'),
    up: share((x) => x.final > p.deposit),
    median: finals[Math.floor(finals.length / 2)],
    meanFinal: mean((x) => x.final) / p.deposit,
    big10: share((x) => x.best >= 10),
    big100: share((x) => x.best >= 100),
    tau: mean((x) => x.turnover) / p.deposit,
    hold: 1 - mean((x) => x.final) / p.deposit,
    lifetimeUp: lifetimeUp / 20_000,
  };
});

console.log(`\n## 4. Player sessions (${SESSIONS.toLocaleString('en-US')} each; stop at bust, cash-out target or 900 casts ≈ 1 hour)\n`);
console.log(
  table(
    ['Player', 'Setup', 'Avg casts', 'Walk away up', 'Hit cash-out target', 'Bust', 'Median end', 'Had a ≥10× catch', 'Had a ≥100× catch', 'Up after 20 sessions'],
    sessionStats.map((s) => [
      s.p.name,
      `$${s.p.deposit} @ $${(s.p.baitX * 0.1).toFixed(2)}, ${modes[s.p.mode].name}, out at ${s.p.cashOutAtX}×`,
      Math.round(s.avgCasts),
      pct(s.up, 1),
      pct(s.target, 1),
      pct(s.bust, 1),
      `${pct(s.median, 0)} of deposit`,
      pct(s.big10, 1),
      pct(s.big100, 1),
      pct(s.lifetimeUp, 1),
    ]),
  ),
);
console.log(
  '\n' +
    table(
      ['Player', 'Turnover per $ deposited (τ)', 'House hold of deposits', 'Avg $ kept by house per session'],
      sessionStats.map((s) => [s.p.name, s.tau.toFixed(2), pct(s.hold, 1), `$${(s.hold * s.p.deposit).toFixed(2)}`]),
    ),
);

// 5. A month of the flywheel -----------------------------------------------------------------------------------
{
  const mau = 10_000;
  const sessionsPerMonth = 8;
  const derbyEntrantsShare = 0.15; // players entering one $5 derby a week
  let deposits = 0;
  let turnover = 0;
  let ggrCasts = 0;
  let bonusCost = 0;
  for (const s of sessionStats) {
    const d = mau * s.p.share * sessionsPerMonth * s.p.deposit;
    deposits += d;
    turnover += d * s.tau;
    ggrCasts += d * s.tau * (1 - modes[s.p.mode].rtp);
    bonusCost += d * bundleBonus(s.p.deposit) * modes[s.p.mode].rtp;
  }
  const derbyFees = mau * derbyEntrantsShare * 4 * 5;
  const gameRtp = 1 - ggrCasts / turnover;
  const fw = flywheel(turnover, gameRtp, derbyFees);
  const tau = turnover / deposits;
  console.log(`\n## 5. One month: ${mau.toLocaleString('en-US')} players × ${sessionsPerMonth} sessions (70% casual / 25% regular / 5% degen)\n`);
  console.log(
    table(
      ['Line', 'Amount'],
      [
        ['Deposits', usd(deposits)],
        ['Cast turnover (deposits × τ)', `${usd(turnover)} (τ = ${tau.toFixed(2)})`],
        ['Derby buy-ins', usd(derbyFees)],
        ['Blended game RTP', pct(gameRtp)],
        ['GGR (house edge earned + derby rake)', usd(fw.ggr)],
        ...Object.entries(fw.split).map(([k, v]) => [`→ ${k}`, usd(v)]),
        ['Effective RTP incl. rakeback, bonuses, promos', pct(fw.effectiveRtp)],
        ['Bundle bonuses actually given vs budget', `${usd(bonusCost)} vs ${usd(fw.split.bundleBonus)}`],
        ['Max average deposit bonus the budget funds', pct(maxAffordableBundleBonus(gameRtp, tau), 1)],
      ],
    ),
  );
}

console.log(`\nDerby check: buy-in derbies return exactly ${pct(1 - DERBY.buyIn.rake, 1)} by construction (pool = fees × (1 − rake)).`);
