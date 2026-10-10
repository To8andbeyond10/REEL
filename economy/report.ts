/**
 * Prints the analytic economy tables (instant). Run: node economy/report.ts
 * Everything here comes straight from config.ts through the solver; simulate.ts checks it by Monte Carlo.
 */
import { DERBY, JACKPOTS, MODES, PRICING, TIDES, type ModeKey, type TideKey } from './config.ts';
import { jackpotRtp, tierAvgPot, tierRtp, tierTurnoverPerHit } from './paytable.ts';
import {
  blendedRtp,
  castsPerHour,
  castsToProfitConfidence,
  compileAll,
  derbyPayouts,
  hourlyCost,
  maxStake,
  openDerby,
  quoteCasts,
} from './pricing.ts';
import { publishPaytables } from './schedule.ts';

const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;
const usd = (x: number) =>
  x >= 100 || Number.isInteger(x) ? `$${Math.round(x).toLocaleString('en-US')}` : `$${x.toFixed(2)}`;
const oneIn = (p: number) => `1 in ${Math.round(1 / p).toLocaleString('en-US')}`;
const fmtX = (x: number) => `${x >= 100 ? Math.round(x).toLocaleString('en-US') : +x.toFixed(2)}×`;
const table = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join(
    '\n',
  );
const volLabel = (sd: number) => (sd < 4 ? 'Low' : sd < 10 ? 'Medium' : 'High');

const modes = compileAll();
const tables = publishPaytables();
const keys = Object.keys(MODES) as ModeKey[];
const tideKeys = Object.keys(TIDES) as TideKey[];

console.log('## Casts per deposit (bonus casts included)\n');
const baits = PRICING.baits.filter((b) => [1, 5, 10, 50].includes(b.x));
console.log(
  table(
    ['Deposit', 'Bonus', ...baits.map((b) => `${b.name} (${usd(b.x * PRICING.baseCast)})`)],
    [5, 10, 25, 50, 100, 500].map((d) => [
      usd(d),
      quoteCasts(d, 1).bonus ? `+${+(quoteCasts(d, 1).bonus * 100).toFixed(1)}%` : '—',
      ...baits.map((b) => quoteCasts(d, b.x).casts.toLocaleString('en-US')),
    ]),
  ),
);

console.log('\n## Modes\n');
console.log(
  table(
    ['', ...keys.map((k) => modes[k].name)],
    [
      ['Game RTP', ...keys.map((k) => pct(modes[k].rtp, 1))],
      ['… plain catches', ...keys.map((k) => pct(modes[k].stats.rtpCatch))],
      ['… Feeding Frenzy', ...keys.map((k) => pct(modes[k].stats.rtpFrenzy))],
      ['… Treasure Chest', ...keys.map((k) => pct(modes[k].stats.rtpChest))],
      ['… jackpots', ...keys.map((k) => pct(modes[k].stats.rtpJackpot))],
      ['Casts that catch something', ...keys.map((k) => pct(modes[k].stats.hitRate, 1))],
      ['Casts with a catch or a Hot Spot banner', ...keys.map((k) => pct(1 - (1 - modes[k].hot.chance) * modes[k].pNothing, 1))],
      ['Volatility (SD per cast)', ...keys.map((k) => `${volLabel(modes[k].stats.sd)} (${modes[k].stats.sd.toFixed(1)})`)],
      ['Feeding Frenzy', ...keys.map((k) => `${oneIn(modes[k].pFrenzy)}, avg ${fmtX(modes[k].frenzy.ev)}`)],
      ['Treasure Chest', ...keys.map((k) => `${oneIn(modes[k].pChest)}, avg ${fmtX(modes[k].chest.ev)}`)],
      ['Max win', ...keys.map((k) => fmtX(modes[k].maxWinX))],
      ['Chum (2× Frenzy odds, same RTP)', ...keys.map((k) => `+${pct(modes[k].stats.chumCostX - 1, 1)} per cast`)],
      [
        'Frenzy Buy',
        ...keys.map((k) => `${fmtX(modes[k].stats.frenzyBuyX)} stake → ${pct(modes[k].stats.frenzyBuyRtp)} RTP`),
      ],
      [`Avg cost per hour (${castsPerHour()} casts) @ $0.10`, ...keys.map((k) => usd(hourlyCost(modes[k], 0.1)))],
      ['Avg cost per hour @ $1', ...keys.map((k) => usd(hourlyCost(modes[k], 1)))],
    ],
  ),
);

for (const k of keys) {
  const m = modes[k];
  console.log(`\n### ${m.name} catch table (${pct(m.rtp, 1)} RTP)\n`);
  console.log(
    table(
      ['Catch', 'Pays', 'Odds per cast', 'Share of RTP'],
      [
        ...m.catches.map((c) => [
          c.name + (c.hotEligible ? '' : ' ¹'),
          `${fmtX(c.mult * (1 - m.sizeSpread))}–${fmtX(c.mult * (1 + m.sizeSpread))}`,
          oneIn(c.prob),
          pct(c.rtp / m.rtp, 1),
        ]),
        ['Feeding Frenzy', `avg ${fmtX(m.frenzy.ev)}`, oneIn(m.pFrenzy), pct(m.stats.rtpFrenzy / m.rtp, 1)],
        ['Treasure Chest', `${fmtX(Math.min(...m.chest.prizes))}–${fmtX(Math.max(...m.chest.prizes))}`, oneIn(m.pChest), pct(m.stats.rtpChest / m.rtp, 1)],
        ['Jackpots', 'see below', '—', pct(m.stats.rtpJackpot / m.rtp, 1)],
        ['Nothing', '0×', pct(m.pNothing, 1), '—'],
      ],
    ),
  );
}
console.log('\n¹ not eligible for Hot Spot boosts');

console.log('\n## Tides (pre-published variants the owner can schedule)\n');
const bigFish = (m: (typeof tables)[ModeKey][TideKey]) => m.catches.filter((c) => c.mult >= 50).reduce((s, c) => s + c.prob, 0);
console.log(
  table(
    ['Mode · tide', 'RTP', 'Catch rate', 'Hot Spot', 'SD', '50×+ fish', 'Feeding Frenzy', 'Paytable hash'],
    keys.flatMap((k) =>
      tideKeys.map((t) => {
        const m = tables[k][t];
        return [
          m.name,
          pct(m.rtp, 1),
          pct(m.stats.hitRate, 1),
          pct(m.hot.chance, 1),
          m.stats.sd.toFixed(1),
          bigFish(m) ? oneIn(bigFish(m)) : '—',
          oneIn(m.pFrenzy),
          `\`${m.hash.slice(0, 12)}\``,
        ];
      }),
    ),
  ),
);

console.log('\n## Jackpots (shared by all modes)\n');
console.log(
  table(
    ['Tier', 'Type', 'Seed', 'Fed by', 'Pays out every', 'Avg pot when won', 'RTP'],
    JACKPOTS.map((j) => [
      j.name,
      'hitEvery' in j ? `random, ${oneIn(1 / j.hitEvery)} per $1 cast` : `must drop before ${usd(j.mustDropBy)}`,
      usd(j.seed),
      pct(j.contribution) + ' of stake',
      `${usd(tierTurnoverPerHit(j))} wagered`,
      usd(tierAvgPot(j)),
      pct(tierRtp(j), 3),
    ]),
  ),
);
console.log(`\nTotal jackpot RTP: ${pct(jackpotRtp(), 3)}`);

console.log('\n## Bankroll ladder (max stake accepted)\n');
const bankrolls = [25_000, 100_000, 250_000, 1_000_000, 5_000_000];
console.log(
  table(
    ['Bankroll', ...keys.map((k) => modes[k].name)],
    bankrolls.map((b) => [usd(b), ...keys.map((k) => (maxStake(modes[k], b).stake ? usd(maxStake(modes[k], b).stake) : 'closed'))]),
  ),
);

console.log('\n## House confidence\n');
console.log(
  table(
    ['Mode', 'Casts until the house is 99% sure to be up (normal approx.)'],
    keys.map((k) => [modes[k].name, castsToProfitConfidence(modes[k]).toLocaleString('en-US')]),
  ),
);

console.log('\n## Derbies\n');
for (const [entrants, fee] of [[10, 1], [100, 5], [1_000, 5], [5_000, 20]] as const) {
  const d = derbyPayouts(entrants, fee);
  const places = d.prizes.slice(0, 3).map((p, i) => `${['1st', '2nd', '3rd'][i]} ${usd(p)}`);
  if (d.prizes.length > 3) places.push(`last paid (${d.prizes.length}th) ${usd(d.prizes[d.prizes.length - 1])}`);
  console.log(
    `- ${entrants.toLocaleString('en-US')} × ${usd(fee)} buy-in: pool ${usd(d.pool)}, house rake ${usd(d.rake)}, ` +
      places.join(', '),
  );
}
console.log(`- Buy-in derby RTP: ${pct(1 - DERBY.buyIn.rake, 1)} (pari-mutuel; the house can't lose)`);
for (const t of [20_000, 100_000, 1_000_000]) {
  const o = openDerby(t);
  console.log(`- Open derby on ${usd(t)} turnover: pool ${usd(o.pool)}, adds ${pct(o.rtpBoost)} RTP, 1st ${usd(o.prizes[0])}`);
}

const mix = { shallows: 0.3, openSea: 0.5, abyss: 0.1, derby: 0.1 };
console.log(
  `\nBlended game RTP at turnover mix ${JSON.stringify(mix)}: ${pct(blendedRtp(mix))}` +
    ` (moving 5% of turnover from Open Sea into Golden Hour: ${pct(
      blendedRtp({ ...mix, openSea: 0.45, goldenHour: 0.05 }, { goldenHour: tables.openSea.goldenHour.rtp }),
    )})`,
);
