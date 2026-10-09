// HUD and menus (plain DOM over the 3D canvas).
import { LURES, RODS, SPECIES, SPOTS, byId } from '../sim/data.js';
import { ALL_GEAR, BAG_SIZE, canBuy, canTravel, levelOf, repairCost, xpForLevel } from '../sim/profile.js';
import { SENTIMENT, changeOf, quote } from '../sim/market.js';
import { LAKE, SPOT_POSES, depthAt, shoreRadius } from '../sim/lake.js';
import { WEATHER, clockLabel, dayOf } from '../sim/world.js';

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

const TIME_LABEL = { day: 'Daytime', morning: 'Mornings', dawnDusk: 'Dawn and dusk', night: 'Night' };

export class Ui {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of [
      'hud', 'clock', 'day', 'weather', 'temp', 'spot-name', 'ff-row', 'ticker', 'wallet', 'level', 'bag', 'xp-fill', 'sentiment', 'news',
      'prompt', 'toast', 'cast-meter', 'cast-fill', 'fight-panel', 'tension-text', 'tension-fill', 'drag-mark', 'rod-text', 'rod-fill',
      'line-out', 'fish-dist', 'fight-state', 'g-rod', 'g-reel', 'g-line', 'g-lure', 'g-drag', 'g-speed', 'g-depth', 'g-depth-label',
      'g-dist', 'title', 'modal', 'modal-title', 'modal-body', 'catch', 'catch-card', 'fade', 'touch', 'ff-button', 'mute-button'
    ]) {
      this.el[id] = $(id);
    }
    this.panel = null;
    this.tab = 'rod';
    this.toastTimer = 0;
    this.lastNews = null;
    this.tickerAt = -1;

    document.querySelectorAll('[data-panel]').forEach((b) => b.addEventListener('click', () => this.open(b.dataset.panel)));
    $('modal-close').addEventListener('click', () => this.close());
    this.el['modal-body'].addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (t) this.game.action(t.dataset.action, t.dataset);
    });
    this.el['modal-body'].addEventListener('input', (e) => {
      if (e.target.id === 'float-depth') this.game.action('float-depth', { value: e.target.value });
    });
    this.el['catch-card'].addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (t) this.game.action(t.dataset.action, t.dataset);
    });
  }

  get modalOpen() {
    return !!this.panel;
  }

  showHud() {
    this.el.title.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  }

  prompt(text, strike = false) {
    if (this.el.prompt.textContent !== text) this.el.prompt.textContent = text;
    this.el.prompt.classList.toggle('strike', strike);
  }

  toast(text, tone = '') {
    const t = this.el.toast;
    t.textContent = text;
    t.className = `toast show ${tone}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  fade(on) {
    this.el.fade.classList.toggle('on', on);
  }

  // Called a few times a second.
  hud() {
    const g = this.game;
    const { profile, world, market, gear } = g;
    const e = this.el;
    e.clock.textContent = clockLabel(world);
    e.day.textContent = `Day ${dayOf(world)}`;
    e.weather.textContent = WEATHER[world.weather].label;
    e.temp.textContent = `${Math.round(world.airTemp)}°C`;
    e['spot-name'].textContent = `${LAKE.name} · ${byId(SPOTS, profile.spot).name}`;
    e.wallet.textContent = fmt(profile.wallet);
    const lvl = levelOf(profile.xp);
    e.level.textContent = `Lv ${lvl} · ${fmt(profile.xp)} XP`;
    const a = xpForLevel(lvl);
    const b = xpForLevel(lvl + 1);
    e['xp-fill'].style.width = `${((profile.xp - a) / (b - a)) * 100}%`;
    e.bag.textContent = `Bag ${profile.bag.length}/${BAG_SIZE}`;
    e.sentiment.innerHTML = `Market: <span class="${market.sentiment === 'bear' ? 'down' : market.sentiment === 'bull' ? 'up' : ''}">${SENTIMENT[market.sentiment].label}</span>`;
    e['ff-button'].classList.toggle('on', g.fastForward);
    e['ff-row'].textContent = g.fastForward ? 'Time ×20' : '';

    e['g-rod'].textContent = g.rodBroken ? `${gear.rod.name} (broken)` : gear.rod.name;
    e['g-reel'].textContent = gear.reel.name;
    e['g-line'].textContent = gear.line.name;
    e['g-lure'].textContent = gear.lure.name;
    e['g-drag'].textContent = `${g.drag.toFixed(1)} kg`;
    e['g-speed'].textContent = `${g.reelGear}/5`;
    if (gear.lure.kind === 'float') {
      e['g-depth-label'].textContent = 'Float depth';
      e['g-depth'].textContent = `${profile.floatDepth.toFixed(1)} m`;
    } else {
      e['g-depth-label'].textContent = 'Lure depth';
      e['g-depth'].textContent = g.lure.active ? `${g.lure.depth.toFixed(1)} m` : '–';
    }
    e['g-dist'].textContent = g.lure.active ? `${g.lure.dist.toFixed(0)} m` : '–';

    if (market.minutes !== this.tickerAt) {
      this.tickerAt = market.minutes;
      if (market.minutes % 5 === 0 || !e.ticker.innerHTML) {
        const items = SPECIES.map((s) => {
          const ch = changeOf(market, s.id);
          return `<span><b>$${s.ticker}</b>${fmt(quote(market, s.id), 1)} <span class="${ch >= 0 ? 'up' : 'down'}">${pct(ch)}</span></span>`;
        }).join('');
        e.ticker.innerHTML = items + items;
      }
    }
    const top = market.news[0];
    if (top && top !== this.lastNews) {
      this.lastNews = top;
      const div = document.createElement('div');
      div.className = top.tone;
      div.textContent = top.text;
      e.news.prepend(div);
      setTimeout(() => div.remove(), 6000);
    }
  }

  fight(readout, f, dragKg) {
    const e = this.el;
    const frac = Math.min(1.1, readout.tensionFrac);
    e['tension-fill'].style.width = `${(frac / 1.1) * 100}%`;
    e['tension-fill'].style.background = frac > 0.85 ? 'var(--bad)' : frac > 0.6 ? 'var(--warn)' : 'var(--good)';
    e['drag-mark'].style.left = `${(Math.min(1.1, dragKg / f.line.strength) / 1.1) * 100}%`;
    e['tension-text'].textContent = `${f.peak.toFixed(1)} / ${f.line.strength.toFixed(1)} kg`;
    const rod = Math.min(1.2, readout.rodLoad);
    e['rod-fill'].style.width = `${(rod / 1.2) * 100}%`;
    e['rod-fill'].style.background = rod > 0.9 ? 'var(--bad)' : 'var(--blue)';
    e['rod-text'].textContent = `${Math.round(readout.rodLoad * 100)}%`;
    e['line-out'].textContent = `${readout.lineOut.toFixed(0)} m`;
    e['fish-dist'].textContent = `${readout.distance.toFixed(0)} m`;
    let state = '';
    if (f.dragSlipping) state = 'Drag slipping';
    else if (f.reelStall) state = 'Reel stalling';
    else if (f.mode === 'shake') state = 'Head shake!';
    else if (f.mode === 'jump') state = 'Jump!';
    else if (f.mode === 'toward') state = 'Swimming at you';
    else if (f.mode === 'tired') state = 'Tiring';
    else if (f.slack > 0.6) state = 'Slack line!';
    e['fight-state'].textContent = state;
  }

  showFight(on) {
    this.el['fight-panel'].classList.toggle('hidden', !on);
  }

  castMeter(power) {
    this.el['cast-meter'].classList.toggle('hidden', power === null);
    if (power !== null) this.el['cast-fill'].style.width = `${power * 100}%`;
  }

  open(name) {
    if (this.game.state === 'fight' || this.game.state === 'bite' || this.game.state === 'catch') return;
    this.panel = name;
    this.el.modal.classList.remove('hidden');
    this.render();
    this.game.sound.ui();
  }

  close() {
    this.panel = null;
    this.el.modal.classList.add('hidden');
  }

  render() {
    if (!this.panel) return;
    const map = { tackle: 'Tackle shop', market: 'Fish market', map: LAKE.name, journal: 'Fish journal', help: 'How to fish' };
    this.el['modal-title'].textContent = map[this.panel];
    const body = this.el['modal-body'];
    body.innerHTML = this[this.panel]();
    if (this.panel === 'market') this.drawSparks();
    if (this.panel === 'map') this.drawMap();
  }

  tackle() {
    const { profile } = this.game;
    const tabs = [['rod', 'Rods'], ['reel', 'Reels'], ['line', 'Lines'], ['lure', 'Lures and rigs']];
    const items = ALL_GEAR.filter((i) => i.slot === this.tab);
    const stat = (k, v) => `<span>${k} <b>${v}</b></span>`;
    const stats = (i) => {
      if (i.slot === 'rod') return stat('Max load', `${i.maxLoad} kg`) + stat('Action', i.action > 0.7 ? 'Soft' : i.action > 0.45 ? 'Medium' : 'Fast') + stat('Cast', `${i.cast} m`);
      if (i.slot === 'reel') return stat('Max drag', `${i.maxDrag} kg`) + stat('Retrieve', `${i.speed} m/s`) + stat('Spool', `${i.capacity} m`);
      if (i.slot === 'line') return stat('Breaks at', `${i.strength} kg`) + stat('Stretch', `${Math.round(i.stretch * 100)}%`) + stat('Visibility', i.visibility > 0.5 ? 'High' : i.visibility > 0.2 ? 'Medium' : 'Low');
      const kind = i.kind === 'float' ? 'Float' : i.kind === 'bottom' ? 'Bottom' : i.topwater ? 'Topwater' : `Runs ${i.dive} m`;
      return stat('Type', kind) + (i.idealSpeed ? stat('Best speed', `${i.idealSpeed} m/s`) : '');
    };
    const card = (i) => {
      const owned = profile.owned.includes(i.id);
      const equipped = profile.loadout[i.slot] === i.id;
      const check = canBuy(profile, i);
      const btn = equipped
        ? '<button disabled>Equipped</button>'
        : owned
          ? `<button data-action="equip" data-id="${i.id}" data-slot="${i.slot}">Equip</button>`
          : `<button class="primary" data-action="buy" data-id="${i.id}" ${check.ok ? '' : 'disabled'}>${check.ok ? 'Buy' : check.why}</button>`;
      return `<div class="item ${equipped ? 'equipped' : ''}"><h3>${i.name}</h3><div class="stats">${stats(i)}</div><div class="note">${i.blurb}</div><div class="foot"><span class="price">${owned ? 'Owned' : `${fmt(i.price)} MEME · Lv ${i.level}`}</span>${btn}</div></div>`;
    };
    const rod = byId(RODS, profile.loadout.rod);
    const repair = this.game.rodBroken
      ? `<div class="item"><h3>Your rod is broken</h3><div class="note">${rod.name} snapped under load. Repair it before your next cast.</div><button class="primary" data-action="repair">Repair for ${repairCost(rod)} MEME</button></div>`
      : '';
    const floatRow = `<div class="slider"><span class="label">Float depth</span><input id="float-depth" type="range" min="0.3" max="6" step="0.1" value="${profile.floatDepth}"><strong>${profile.floatDepth.toFixed(1)} m</strong></div>`;
    return `${repair}<div class="tabs">${tabs.map(([k, l]) => `<button data-action="tab" data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${this.tab === 'lure' ? floatRow : ''}
      <div class="grid">${items.map(card).join('')}</div>
      <p class="note">Tip: the drag should sit well under your line's break strength. Shakes and surges spike the tension above it.</p>`;
  }

  market() {
    const { market, profile } = this.game;
    const rows = SPECIES.map((s) => {
      const ch = changeOf(market, s.id);
      return `<tr><td>${s.name}</td><td>$${s.ticker}</td><td class="num">${fmt(quote(market, s.id), 1)}</td><td class="num ${ch >= 0 ? 'up' : 'down'}">${pct(ch)}</td><td><canvas class="spark" data-id="${s.id}" width="220" height="52"></canvas></td></tr>`;
    }).join('');
    const bag = profile.bag.length
      ? `<table><tr><th>Fish</th><th>Weight</th><th>Bagged at</th><th>Now</th><th></th></tr>${profile.bag
          .map((f, i) => {
            const s = byId(SPECIES, f.species);
            const now = f.weight * quote(market, s.id);
            const cls = now >= f.value ? 'up' : 'down';
            return `<tr><td>${s.name}</td><td class="num">${f.weight.toFixed(2)} kg</td><td class="num">${fmt(f.value)}</td><td class="num ${cls}">${fmt(now)}</td><td><button data-action="sell" data-index="${i}">Sell</button></td></tr>`;
          })
          .join('')}</table><div class="rest" style="margin-top:8px"><button class="primary" data-action="sell-all">Sell whole bag</button></div>`
      : '<p class="note">Your bag is empty. Catch something and bag it to sell here.</p>';
    const news = market.news.length ? market.news.map((n) => `<div class="${n.tone === 'bad' ? 'down' : 'up'}">${n.text}</div>`).join('') : '<div class="note">Quiet market.</div>';
    return `<p class="note">Prices are MEME per kg and move every game minute. Sell into a pump, hold through a dip. ${SENTIMENT[market.sentiment].label}${market.sentiment === 'bull' ? ': fish are hungrier.' : market.sentiment === 'bear' ? ': fish are sluggish.' : '.'}</p>
      <table><tr><th>Species</th><th>Ticker</th><th>Price/kg</th><th>1h</th><th>Chart</th></tr>${rows}</table>
      <div class="section"><h3>Your bag (${profile.bag.length}/${BAG_SIZE})</h3>${bag}</div>
      <div class="section"><h3>News</h3>${news}</div>`;
  }

  drawSparks() {
    const { market } = this.game;
    document.querySelectorAll('canvas.spark').forEach((c) => {
      const h = market.coins[c.dataset.id].history.slice(-120);
      const ctx = c.getContext('2d');
      const min = Math.min(...h);
      const max = Math.max(...h);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.strokeStyle = h[h.length - 1] >= h[0] ? '#5fd38d' : '#ff5d52';
      ctx.lineWidth = 2;
      ctx.beginPath();
      h.forEach((v, i) => {
        const x = (i / Math.max(1, h.length - 1)) * c.width;
        const y = c.height - 4 - ((v - min) / Math.max(1e-6, max - min)) * (c.height - 8);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }

  map() {
    const { profile } = this.game;
    const spots = SPOTS.map((s) => {
      const here = profile.spot === s.id;
      const check = canTravel(profile, s);
      const owned = profile.spots.includes(s.id);
      const btn = here ? '<button disabled>You are here</button>' : `<button class="primary" data-action="travel" data-id="${s.id}" ${check.ok ? '' : 'disabled'}>${check.ok ? (owned ? 'Walk here' : `Unlock for ${s.price} MEME`) : check.why}</button>`;
      return `<div class="spot ${here ? 'here' : ''}"><strong>${s.name}</strong><span class="note" style="margin:0">${s.blurb}</span>${btn}</div>`;
    }).join('');
    return `<div class="map-wrap"><canvas id="lake-map" width="400" height="400"></canvas><div>${spots}
      <div class="section"><h3>Rest until</h3><div class="rest">
        <button data-action="rest" data-hour="5.5">Dawn</button><button data-action="rest" data-hour="12">Noon</button>
        <button data-action="rest" data-hour="18.5">Dusk</button><button data-action="rest" data-hour="22">Night</button></div>
        <p class="note">Walking to another spot takes 20 minutes. Resting skips ahead; the market keeps moving while you sleep.</p></div>
      <div class="section"><h3>Other waters</h3><p class="note">Shitcoin Swamp, Bull Run River and the Deep Liquidity Pool are coming in later builds.</p></div></div></div>`;
  }

  drawMap() {
    const c = $('lake-map');
    if (!c) return;
    const ctx = c.getContext('2d');
    const scale = c.width / 190;
    const img = ctx.createImageData(c.width, c.height);
    for (let y = 0; y < c.height; y += 1) {
      for (let x = 0; x < c.width; x += 1) {
        const wx = (x - c.width / 2) / scale;
        const wz = (y - c.height / 2) / scale;
        const d = depthAt(wx, wz);
        const i = (y * c.width + x) * 4;
        if (d > 0) {
          const t = Math.min(1, d / 14);
          img.data[i] = 40 - t * 30;
          img.data[i + 1] = 120 - t * 70;
          img.data[i + 2] = 170 - t * 60;
        } else {
          img.data[i] = 52;
          img.data[i + 1] = 82;
          img.data[i + 2] = 40;
        }
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    for (const level of [2, 5, 9]) {
      ctx.beginPath();
      let pen = false;
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.02) {
        let r = shoreRadius(a);
        while (r > 1 && depthAt(Math.cos(a) * r, Math.sin(a) * r) < level) r -= 0.5;
        if (r <= 1) {
          pen = false;
          continue;
        }
        const px = c.width / 2 + Math.cos(a) * r * scale;
        const py = c.height / 2 + Math.sin(a) * r * scale;
        if (pen) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        pen = true;
      }
      ctx.stroke();
    }
    ctx.font = '600 13px system-ui';
    for (const s of SPOTS) {
      const p = SPOT_POSES[s.id];
      const px = c.width / 2 + p.x * scale;
      const py = c.height / 2 + p.z * scale;
      ctx.fillStyle = this.game.profile.spot === s.id ? '#f5c542' : '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(s.name, px + 9, py + 4);
    }
  }

  journal() {
    const { profile } = this.game;
    const cards = SPECIES.map((s) => {
      const j = profile.journal[s.id];
      if (!j) return `<div class="item"><h3>???</h3><div class="note">Not caught yet. Rumoured to be a ${s.rarity} catch.</div></div>`;
      const lures = Object.entries(s.lures).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => byId(LURES, id).name).join(', ');
      return `<div class="item"><h3>${s.name} <span class="badge ${s.rarity}">${s.rarity}</span></h3>
        <div class="stats"><span>Caught <b>${j.count}</b></span><span>Best <b>${j.best.toFixed(2)} kg</b></span><span>Real fish <b>${s.real}</b></span></div>
        <div class="note">Feeds: ${TIME_LABEL[s.time]} · ${s.depth[0]}–${s.depth[1]} m · Best on ${lures}</div></div>`;
    }).join('');
    const st = profile.stats;
    return `<p class="note">Caught ${st.caught} · Released ${st.released} · Sold ${st.sold} for ${fmt(st.earned)} MEME</p><div class="grid">${cards}</div>`;
  }

  help() {
    return `<div class="grid">
      <div class="item"><h3>1. Rig up</h3><div class="note">Open Tackle. Floats catch gills and perch near the dock. Spinners and jigs need retrieving. Bottom rigs at night find catfish. Set float depth to where fish feed.</div></div>
      <div class="item"><h3>2. Cast</h3><div class="note">Hold left click or Space to build power, release to cast. Aim with the mouse.</div></div>
      <div class="item"><h3>3. Fish the lure</h3><div class="note">Hold to retrieve. W and S change reel speed; each lure has a best speed. Right click hops a jig. Pause to let it sink.</div></div>
      <div class="item"><h3>4. Strike</h3><div class="note">Float rigs nibble first. Strike (right click or F) when the float goes under. Lures thump the rod tip: strike fast.</div></div>
      <div class="item"><h3>5. Fight</h3><div class="note">Set the drag (mouse wheel) below your line's limit. Reel when the fish rests, stop on head shakes and runs, lift the rod (hold right click) to tire it. Keep the line tight or it throws the hook.</div></div>
      <div class="item"><h3>6. Bag or release</h3><div class="note">Bag fish and sell them at the Fish Market when the price is right, or release them for more XP. Levels unlock gear and spots.</div></div>
    </div>`;
  }

  catchCard(info) {
    const { species: s, weight, length, trophy, price, xpKeep, xpRelease, bagFull } = info;
    const value = weight * price;
    this.el['catch-card'].innerHTML = `
      <div class="label">You landed</div>
      <h2>${s.name} <span class="ticker-tag">$${s.ticker}</span><span class="badge ${s.rarity}">${s.rarity}</span>${trophy ? `<span class="badge trophy">${trophy}</span>` : ''}</h2>
      <div class="facts"><div><span class="label">Weight</span><strong>${weight.toFixed(2)} kg</strong></div><div><span class="label">Length</span><strong>${length} cm</strong></div><div><span class="label">Market value</span><strong class="price">${fmt(value)} MEME</strong></div></div>
      <p class="caption">"${s.caption}" Real-world cousin: ${s.real}.</p>
      <div class="actions">
        <button class="primary" data-action="keep" ${bagFull ? 'disabled' : ''}>${bagFull ? 'Bag full' : `Bag it (+${xpKeep} XP)`}</button>
        <button data-action="dump">Market sell now (−20% slippage)</button>
        <button data-action="release">Release (+${xpRelease} XP)</button>
      </div>`;
    this.el.catch.classList.remove('hidden');
  }

  hideCatch() {
    this.el.catch.classList.add('hidden');
  }
}

