// The fish market: every species trades like a memecoin. Prices are per kg in REEL,
// an in-game currency only. Moves once per game minute.
import { SPECIES } from './data.js';
import { clamp, gaussian, range } from './random.js';

export const SENTIMENT = {
  bull: { label: 'Bull run', drift: 0.0009, bite: 1.15 },
  crab: { label: 'Crabbing', drift: 0, bite: 1 },
  bear: { label: 'Bear market', drift: -0.0009, bite: 0.9 }
};

export function createMarket(rng) {
  const coins = {};
  for (const s of SPECIES) {
    coins[s.id] = { mult: 1, history: [1], pump: 0 };
  }
  return { coins, sentiment: 'crab', nextSentimentAt: 240, minutes: 0, news: [], newsSeq: 0, rng };
}

export function changeOf(market, speciesId) {
  const h = market.coins[speciesId].history;
  const then = h[Math.max(0, h.length - 60)];
  return h[h.length - 1] / then - 1;
}

function pushNews(market, text, tone, extra = {}) {
  market.newsSeq += 1;
  market.news.unshift({ id: market.newsSeq, text, tone, at: market.minutes, ...extra });
  market.news.length = Math.min(market.news.length, 8);
}

export function stepMarket(market, minutes = 1) {
  const { rng } = market;
  for (let i = 0; i < minutes; i += 1) {
    market.minutes += 1;
    if (market.minutes >= market.nextSentimentAt) {
      const keys = Object.keys(SENTIMENT).filter((k) => k !== market.sentiment);
      market.sentiment = keys[Math.floor(rng() * keys.length)];
      market.nextSentimentAt = market.minutes + range(rng, 180, 420);
      pushNews(market, `Market flips to ${SENTIMENT[market.sentiment].label.toLowerCase()}`, market.sentiment === 'bear' ? 'bad' : 'good', { kind: 'sentiment' });
    }
    const drift = SENTIMENT[market.sentiment].drift;
    for (const s of SPECIES) {
      const coin = market.coins[s.id];
      const vol = s.rarity === 'legendary' ? 0.02 : 0.012;
      // Log random walk, gently pulled back toward 1 so prices never wander off forever.
      let log = Math.log(coin.mult);
      log += drift + vol * gaussian(rng) - 0.004 * log;
      // Pumps and rug pulls decay away.
      coin.pump *= 0.985;
      coin.mult = clamp(Math.exp(log), 0.25, 4);
      coin.history.push(coin.mult * (1 + coin.pump));
      if (coin.history.length > 240) coin.history.shift();
    }
    if (rng() < 1 / 150) {
      const s = SPECIES[Math.floor(rng() * SPECIES.length)];
      const coin = market.coins[s.id];
      if (rng() < 0.6) {
        coin.pump = range(rng, 0.8, 1.6);
        pushNews(market, `$${s.ticker} pumps. ${s.name} buyers everywhere`, 'good', { kind: 'pump', species: s.id });
      } else {
        coin.pump = -range(rng, 0.45, 0.65);
        pushNews(market, `Rug pull on $${s.ticker}. ${s.name} prices crater`, 'bad', { kind: 'rug', species: s.id });
      }
    }
  }
}

// Effective multiplier including any pump or rug in progress.
export function multOf(market, speciesId) {
  const coin = market.coins[speciesId];
  return coin.mult * (1 + coin.pump);
}

export function quote(market, speciesId) {
  const s = SPECIES.find((sp) => sp.id === speciesId);
  return s.price * multOf(market, speciesId);
}
