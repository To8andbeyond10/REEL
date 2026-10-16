// HUD and menus (plain DOM over the 3D canvas).
import { LINES, LURES, REELS, RODS, SPECIES, byId, speciesById } from '../sim/data.js';
import { ALL_GEAR, BAG_SIZE, canBridge, canBuy, canTravel, levelOf, repairCost, xpForLevel } from '../sim/profile.js';
import { SENTIMENT, changeOf, quote } from '../sim/market.js';
import { WATERS, speciesIn } from '../sim/waters.js';
import { WEATHER, clockLabel, dayOf, forecastIn } from '../sim/world.js';
import { hotspots } from '../sim/events.js';
import { missionLabel } from '../sim/missions.js';
import { FORMATS, derbyActive, formatScore, prizePool, standings, upcomingDerbies } from '../sim/derby.js';
import { EFFECT_TEXT, SKIN_SLOTS, canBuyItem, equippedSkin, itemsFor, ownsSkin } from '../sim/store.js';
import { FLAGS } from '../sim/flags.js';
import { gearUsd } from '../sim/checkout.js';
import { BADGES } from '../sim/account.js';
import { BAITS, CATCH_LOOK, canTopUp, castCost, frenzyCost, modeFor, stakeOf } from '../sim/cashwaters.js';
import { summary, track } from '../sim/telemetry.js';
import { hudClasses, loadHudView, saveHudView, toggleClean, toggleFold } from './hudview.js';

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
const hhmm = (minute) => {
  const m = Math.floor(minute % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const duration = (min) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(Math.floor(min % 60)).padStart(2, '0')}m` : `${Math.max(1, Math.round(min))}m`);
const ordinal = (n) => ['1st', '2nd', '3rd'][n - 1] || `${n}th`;

const TIME_LABEL = { day: 'Daytime', morning: 'Mornings', dawnDusk: 'Dawn and dusk', night: 'Night' };
const EVENT_LABEL = { boils: 'Whale alert', birds: 'Birds diving', frenzy: 'Feeding frenzy', sulk: 'Rugged, fish sulking', front: 'Storm front' };

export class Ui {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of [
      'hud', 'clock', 'day', 'weather', 'temp', 'forecast', 'spot-name', 'ff-row', 'ticker', 'wallet', 'level', 'bag', 'xp-fill', 'sentiment', 'news',
      'events', 'derby', 'sonar', 'prompt', 'toast', 'cast-meter', 'cast-fill', 'fight-panel', 'tension-text', 'tension-fill', 'drag-mark', 'rod-text', 'rod-fill',
      'line-out', 'fish-dist', 'fight-state', 'g-rod', 'g-reel', 'g-line', 'g-lure', 'g-drag', 'g-speed', 'g-depth', 'g-depth-label',
      'g-dist', 'title', 'modal', 'modal-title', 'modal-body', 'catch', 'catch-card', 'fade', 'touch', 'ff-button', 'mute-button', 'coach'
    ]) {
      this.el[id] = $(id);
    }
    this.panel = null;
    this.tab = 'rod';
    this.storeTab = 'float';
    this.cashResult = null;
    this.helpTab = 'start';
    this.toastTimer = 0;
    this.lastNews = null;
    this.tickerAt = -1;

    this.view = loadHudView(game.storage);
    this.applyView();
    document.querySelectorAll('[data-fold]').forEach((b) => b.addEventListener('click', () => this.setView(toggleFold(this.view, b.dataset.fold))));
    $('clean-button').addEventListener('click', () => this.toggleCleanView());
    $('menu-toggle').addEventListener('click', () => this.el.hud.classList.toggle('menu-open'));
    // Picking something from the folded menu closes it again.
    document.querySelector('.menu-bar').addEventListener('click', (e) => {
      if (e.target.closest('button') && !e.target.closest('#menu-toggle')) this.el.hud.classList.remove('menu-open');
    });
    document.querySelectorAll('[data-panel]').forEach((b) => b.addEventListener('click', () => this.open(b.dataset.panel)));
    $('modal-close').addEventListener('click', () => this.close());
    this.el['modal-body'].addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (t) this.game.action(t.dataset.action, t.dataset);
    });
    this.el['modal-body'].addEventListener('input', (e) => {
      if (e.target.id === 'float-depth') this.game.action('float-depth', { value: e.target.value });
    });
    this.el.coach.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      t.blur(); // so Space casts instead of pressing the button again
      this.game.action(t.dataset.action, t.dataset);
    });
    this.el['catch-card'].addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (t) this.game.action(t.dataset.action, t.dataset);
    });
  }

  applyView() {
    const hud = this.el.hud;
    for (const c of [...hud.classList]) if (c === 'clean' || c.startsWith('fold-')) hud.classList.remove(c);
    hud.classList.add(...hudClasses(this.view));
    $('clean-button').classList.toggle('on', this.view.clean);
  }

  setView(view) {
    this.view = view;
    saveHudView(this.game.storage, view);
    this.applyView();
  }

  toggleCleanView() {
    this.setView(toggleClean(this.view));
    this.el.hud.classList.remove('menu-open');
    this.toast(this.view.clean ? 'Clean view on. Press V to bring everything back.' : 'Clean view off');
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

  // A line in the news feed under the ticker: events, missions, derbies.
  notice(text, tone = 'good') {
    const div = document.createElement('div');
    div.className = `${tone} notice`;
    div.textContent = text;
    this.el.news.prepend(div);
    while (this.el.news.children.length > 4) this.el.news.lastChild.remove();
    setTimeout(() => div.remove(), 7000);
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
    e.forecast.textContent = world.next !== world.weather ? `${WEATHER[world.next].label} in ${duration(forecastIn(world))}` : '';
    e['spot-name'].textContent = `${g.water.name} · ${g.spot.name}`;
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
      this.notice(top.text, top.tone);
    }
    this.hudEvents();
    this.hudDerby();
  }

  // Live events that matter on this water, with time left.
  hudEvents() {
    const g = this.game;
    const here = speciesIn(g.water);
    const minute = g.world.minute;
    const list = g.events.list.filter((ev) => (ev.water ? ev.water === g.water.id : !ev.species || ev.species.some((id) => here.includes(id))));
    const html = list
      .map((ev) => {
        const what = ev.kind === 'frenzy' || ev.kind === 'sulk' ? ` $${speciesById(ev.species[0]).ticker}` : '';
        return `<span class="chip ${ev.tone}">${EVENT_LABEL[ev.kind]}${what} · ${duration(ev.until - minute)}</span>`;
      })
      .join('');
    if (this.el.events.innerHTML !== html) this.el.events.innerHTML = html;
  }

  hudDerby() {
    const g = this.game;
    const d = g.profile.derby;
    const box = this.el.derby;
    if (!d || d.settled) {
      box.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden');
    const minute = g.world.minute;
    const where = d.water !== g.water.id ? ` (at ${WATERS.find((w) => w.id === d.water).name})` : '';
    if (minute < d.start) {
      box.innerHTML = `<div class="label">Derby${where}</div><strong>${FORMATS[d.format].label}</strong><div class="muted">Starts ${hhmm(d.start)} · in ${duration(d.start - minute)}</div>`;
      return;
    }
    const table = standings(d);
    const rank = table.findIndex((r) => r.you) + 1;
    const rows = table
      .slice(0, 3)
      .map((r, i) => `<div class="row ${r.you ? 'you' : ''}"><span>${i + 1}. ${r.name}</span><span>${formatScore(d, r.score)}</span></div>`)
      .join('');
    const mine = rank > 3 ? `<div class="row you"><span>${rank}. You</span><span>${formatScore(d, table[rank - 1].score)}</span></div>` : '';
    box.innerHTML = `<div class="label">Derby${where} · ${duration(d.end - minute)} left</div><strong>${FORMATS[d.format].label} · You're ${ordinal(rank)}</strong>${rows}${mine}`;
  }

  // The fish finder: bottom, fish arcs and your lure along the cast line.
  sonar(reading) {
    const c = this.el.sonar;
    if (!reading) {
      c.classList.add('hidden');
      return;
    }
    c.classList.remove('hidden');
    const ctx = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    const maxDepth = Math.max(4, ...reading.bottom.map((b) => b.depth)) * 1.1;
    const top = 16;
    const x = (dist) => (dist / reading.reach) * W;
    const y = (depth) => top + (depth / maxDepth) * (H - top - 4);
    ctx.fillStyle = '#071a2a';
    ctx.fillRect(0, 0, W, H);
    // Water column fades darker with depth.
    const grd = ctx.createLinearGradient(0, top, 0, H);
    grd.addColorStop(0, '#0b3550');
    grd.addColorStop(1, '#061524');
    ctx.fillStyle = grd;
    ctx.fillRect(0, top, W, H - top);
    ctx.fillStyle = '#c98b3a';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (const b of reading.bottom) ctx.lineTo(x(b.dist), y(b.depth));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffd36b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    reading.bottom.forEach((b, i) => (i ? ctx.lineTo(x(b.dist), y(b.depth)) : ctx.moveTo(x(b.dist), y(b.depth))));
    ctx.stroke();
    for (const f of reading.fish) {
      const r = 3 + f.size * 2.2;
      ctx.strokeStyle = f.legendary ? '#ff5d52' : '#7fffb0';
      ctx.lineWidth = f.legendary ? 3 : 2;
      ctx.beginPath();
      ctx.arc(x(f.dist), y(f.depth) + r * 0.6, r, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    if (reading.lure) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x(reading.lure.dist), y(reading.lure.depth), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 11px system-ui, sans-serif';
    const under = reading.lure ? reading.bottom.reduce((best, b) => (Math.abs(b.dist - reading.lure.dist) < Math.abs(best.dist - reading.lure.dist) ? b : best)) : reading.bottom[0];
    ctx.fillText(`SONAR  ${under.depth.toFixed(1)} m  ${reading.temp.toFixed(0)}°C water  ${reading.fish.length} arcs`, 6, 12);
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
    const st = this.game.state;
    if (name !== 'photo' && (st === 'fight' || st === 'bite' || st === 'catch')) return;
    this.panel = name;
    if (name !== 'photo') track(this.game.stats, 'panel', { name });
    this.el.modal.classList.remove('hidden');
    this.el.coach.classList.add('behind');
    this.render();
    this.game.sound.ui();
    this.game.tutorialEvent(`panel:${name}`);
  }

  close() {
    const wasPhoto = this.panel === 'photo';
    this.panel = null;
    this.el.modal.classList.add('hidden');
    this.el.coach.classList.remove('behind');
    if (wasPhoto && this.game.state === 'catch') this.el.catch.classList.remove('hidden');
  }

  render() {
    if (!this.panel) return;
    const titles = { cash: 'Cash Waters', beta: 'Your beta data', store: 'Store', tackle: 'Tackle shop', market: 'Fish market', map: this.game.water.name, journal: 'Fish journal', missions: 'Missions and derbies', help: 'How to play', photo: 'Photo' };
    this.el['modal-title'].textContent = titles[this.panel];
    const body = this.el['modal-body'];
    if (this.panel === 'photo') return;
    body.innerHTML = this[this.panel]();
    if (this.panel === 'market') this.drawSparks();
    if (this.panel === 'map') this.drawMap();
  }

  showPhoto(url, title) {
    this.panel = 'photo';
    this.el.modal.classList.remove('hidden');
    this.el['modal-title'].textContent = 'Photo';
    const name = `memefishing-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
    this.el['modal-body'].innerHTML = `<img class="photo-shot" src="${url}" alt="${title}"><div class="rest" style="margin-top:10px"><a class="button primary" href="${url}" download="${name}">Save photo</a><span class="note">On a phone, press and hold the picture to save or share it.</span></div>`;
  }

  tackle() {
    const { profile } = this.game;
    const tabs = [['rod', 'Rods'], ['reel', 'Reels'], ['line', 'Lines'], ['lure', 'Lures and rigs'], ['electronics', 'Electronics'], ['boat', 'Boats']];
    const items = ALL_GEAR.filter((i) => i.slot === this.tab);
    const stat = (k, v) => `<span>${k} <b>${v}</b></span>`;
    const stats = (i) => {
      if (i.slot === 'rod') return stat('Max load', `${i.maxLoad} kg`) + stat('Action', i.action > 0.7 ? 'Soft' : i.action > 0.45 ? 'Medium' : 'Fast') + stat('Cast', `${i.cast} m`);
      if (i.slot === 'reel') return stat('Max drag', `${i.maxDrag} kg`) + stat('Retrieve', `${i.speed} m/s`) + stat('Spool', `${i.capacity} m`);
      if (i.slot === 'line') return stat('Breaks at', `${i.strength} kg`) + stat('Stretch', `${Math.round(i.stretch * 100)}%`) + stat('Visibility', i.visibility > 0.5 ? 'High' : i.visibility > 0.2 ? 'Medium' : 'Low');
      if (i.slot === 'electronics') return stat('Toggle', 'K');
      if (i.slot === 'boat') return stat('Top speed', `${Math.round(i.speed * 3.6)} km/h`) + stat('Range', `${i.range} m from your spot`) + stat('Launch', 'G');
      const kind = i.kind === 'float' ? 'Float' : i.kind === 'bottom' ? 'Bottom' : i.topwater ? 'Topwater' : `Runs ${i.dive} m`;
      return stat('Type', kind) + (i.idealSpeed ? stat('Best speed', `${i.idealSpeed} m/s`) : '');
    };
    const card = (i) => {
      const owned = profile.owned.includes(i.id);
      const equipped = i.slot === 'electronics' ? owned : profile.loadout[i.slot] === i.id;
      const check = canBuy(profile, i);
      const btn = equipped
        ? `<button disabled>${i.slot === 'electronics' ? 'Installed' : 'Equipped'}</button>`
        : owned
          ? `<button data-action="equip" data-id="${i.id}" data-slot="${i.slot}">Equip</button>`
          : `<button class="primary" data-action="buy" data-id="${i.id}" ${check.ok ? '' : 'disabled'}>${check.ok ? 'Buy' : check.why}</button>`;
      // Card buys unlock now, before the level is reached.
      const usd = !owned && FLAGS.realMoneyPayments ? gearUsd(i.id) : 0;
      const locked = levelOf(profile.xp) < i.level;
      const payBtn = usd ? `<button data-action="store-card" data-id="${i.id}">${locked ? 'Unlock now' : 'Pay'} $${usd.toFixed(2)} by card</button>` : '';
      return `<div class="item ${equipped ? 'equipped' : ''}"><h3>${i.name}</h3><div class="stats">${stats(i)}</div><div class="note">${i.blurb}</div><div class="foot"><span class="price">${owned ? 'Owned' : `${fmt(i.price)} REEL · Lv ${i.level}`}</span>${btn}${payBtn}</div></div>`;
    };
    const rod = byId(RODS, profile.loadout.rod);
    const repair = this.game.rodBroken
      ? `<div class="item"><h3>Your rod is broken</h3><div class="note">${rod.name} snapped under load. Repair it before your next cast.</div><button class="primary" data-action="repair">Repair for ${repairCost(rod)} REEL</button></div>`
      : '';
    const floatRow = `<div class="slider"><span class="label">Float depth</span><input id="float-depth" type="range" min="0.3" max="12" step="0.1" value="${profile.floatDepth}"><strong>${profile.floatDepth.toFixed(1)} m</strong></div>`;
    return `${repair}<div class="tabs">${tabs.map(([k, l]) => `<button data-action="tab" data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${this.tab === 'lure' ? floatRow : ''}
      <div class="grid">${items.map(card).join('')}</div>
      <p class="note">Tip: the drag should sit well under your line's break strength. Shakes and surges spike the tension above it.</p>`;
  }

  store() {
    const { profile, account } = this.game;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const swatch = (i) =>
      i.slot === 'float'
        ? `<span class="swatch float"><i style="background:${i.look.antenna}"></i><i style="background:${i.look.cap}"></i><i style="background:${i.look.body}"></i></span>`
        : `<span class="swatch rod" style="background:${i.look.blank}"></span>`;
    const card = (i) => {
      const owned = ownsSkin(account, i);
      const equipped = equippedSkin(account, i.slot).id === i.id;
      const check = canBuyItem(profile, account, i);
      const btn = equipped
        ? '<button disabled>Equipped</button>'
        : owned
          ? `<button data-action="store-equip" data-id="${i.id}">Equip</button>`
          : `<button class="primary" data-action="store-buy" data-id="${i.id}" ${check.ok ? '' : 'disabled'}>${check.ok ? 'Buy' : `Need ${check.why}`}</button>${FLAGS.realMoneyPayments && i.usd > 0 ? `<button data-action="store-card" data-id="${i.id}">Pay $${i.usd.toFixed(2)} by card</button>` : ''}`;
      const price = owned ? (i.price ? 'Owned' : 'Free') : `${fmt(i.price)} REEL${FLAGS.realMoneyPayments ? ` or $${i.usd.toFixed(2)}` : ''}`;
      return `<div class="item ${equipped ? 'equipped' : ''}"><h3>${swatch(i)}${i.name}</h3><div class="stats"><span>Effect <b>${EFFECT_TEXT}</b></span></div><div class="note">${i.blurb}</div><div class="foot"><span class="price">${price}</span>${btn}</div></div>`;
    };
    const tabs = Object.entries(SKIN_SLOTS)
      .map(([k, s]) => `<button data-action="store-tab" data-tab="${k}" class="${this.storeTab === k ? 'on' : ''}">${s.label}</button>`)
      .join('');
    const badges = (account.badges || []).map((b) => BADGES[b] && `<span class="badge" title="${BADGES[b].blurb}">${BADGES[b].name}</span>`).filter(Boolean).join('');
    return `<div class="account-row"><span class="label">Angler name</span><input id="account-name" type="text" maxlength="20" value="${esc(account.name)}" autocomplete="off"><button data-action="rename">Save</button>${badges}<button class="ghost" data-action="open-beta">Your beta data</button><span class="note">Your items are saved to this account in this browser and can't be traded or sold.</span></div>
      <div class="tabs">${tabs}</div>
      <div class="grid">${itemsFor(this.storeTab).map(card).join('')}</div>
      <p class="note">${FLAGS.realMoneyPayments ? 'Pay with REEL points from fishing, or by card through Stripe. Card details go to Stripe, never to the game.' : 'Store items cost REEL points from fishing.'} Every item shows exactly what you get, and nothing is random.</p>`;
  }

  // Cash Waters: the paytable game, on play money for the beta. Odds and RTP are shown, never hidden.
  cash() {
    const { cash, cashPending, profile } = this.game;
    const mode = modeFor(profile.water);
    const busy = !!cashPending;
    const money = (n) => fmt(n, 2);
    const stake = stakeOf(cash);
    const cost = castCost(cash, mode);
    const fcost = frenzyCost(cash, mode);
    const baits = BAITS.map((b, i) => `<button data-action="cash-bait" data-i="${i}" class="${cash.bait === i ? 'on' : ''}" ${busy ? 'disabled' : ''}>${b.name} ${money(b.stake)}</button>`).join('');
    const toggle = (key, label) => `<button data-action="cash-toggle" data-key="${key}" class="${cash[key] ? 'on' : ''}" ${busy ? 'disabled' : ''}>${label}: ${cash[key] ? 'On' : 'Off'}</button>`;
    let reveal = '<div class="cash-reveal idle">Pick a bait and cast.</div>';
    if (busy) {
      reveal = `<div class="cash-reveal"><div>Casting…</div><div class="cash-bar"><i style="animation-duration:${cashPending.ms}ms"></i></div></div>`;
    } else if (this.cashResult) {
      const r = this.cashResult;
      let what = 'Nothing bit.';
      if (r.outcome === 'catch') what = `${CATCH_LOOK[r.catch.species]?.name ?? r.catch.species} (${fmt(r.catch.x, 2)}×)`;
      else if (r.outcome === 'frenzy') what = `Feeding frenzy: ${r.frenzy.length} fish`;
      else if (r.outcome === 'chest') what = `Sunken chest (${fmt(r.chestX, 2)}×)`;
      const jp = r.jackpots.length ? ` Jackpot: ${r.jackpots.map((j) => `${j.id} ${money(j.amount)}`).join(', ')}.` : '';
      reveal = `<div class="cash-reveal ${r.won > 0 ? 'win' : ''}"><div class="what">${what}</div><div>Paid ${money(r.cost)} · Won <b>${money(r.won)}</b>${jp}</div></div>`;
    }
    const canCast = !busy && cash.balance >= cost;
    const canFrenzy = !busy && cash.balance >= fcost;
    const top = canTopUp(cash) ? '<button class="primary" data-action="cash-topup">Top up to 100 (free)</button>' : '';
    const history = cash.history
      .slice(0, 8)
      .map((h) => `<span class="${h.won > 0 ? 'up' : ''}">${h.outcome === 'catch' ? CATCH_LOOK[h.catch]?.name ?? h.catch : h.outcome} ${h.won > 0 ? `+${money(h.won)}` : `-${money(h.cost)}`}</span>`)
      .join('');
    const rows = mode.catches
      .map((c) => `<tr><td>${CATCH_LOOK[c.id]?.name ?? c.name}</td><td>${fmt(c.mult, c.mult < 1 ? 1 : 0)}×</td><td>${c.prob >= 0.001 ? `${fmt(c.prob * 100, 2)}%` : `1 in ${fmt(Math.round(1 / c.prob))}`}</td></tr>`)
      .join('');
    const t = cash.totals;
    return `<div class="cash-head"><div><span class="label">${this.game.water.name} plays the</span><h3>${mode.name} paytable</h3><span class="note">Return to player ${fmt(mode.rtp * 100, 1)}% · hit rate ${fmt(mode.stats.hitRate * 100, 0)}% · max win ${fmt(mode.maxWinX)}×</span></div>
        <div class="cash-balance"><span class="label">Play balance</span><strong>${money(busy ? cash.balance - cashPending.result.won : cash.balance)}</strong><span class="note">Play money. No cash value.</span></div></div>
      <div class="label">Bait (stake)</div><div class="tabs">${baits}</div>
      <div class="tabs">${toggle('quick', 'Quick Cast')}${toggle('chum', `Chum ×${fmt(mode.stats.chumCostX, 2)} cost, same RTP`)}</div>
      ${reveal}
      <div class="rest cash-actions"><button class="primary" data-action="cash-cast" ${canCast ? '' : 'disabled'}>Cast for ${money(cost)}</button>
        <button data-action="cash-frenzy" ${canFrenzy ? '' : 'disabled'}>Frenzy Buy ${money(fcost)} · RTP ${fmt(mode.stats.frenzyBuyRtp * 100, 1)}%</button>${top}</div>
      <div class="cash-history">${history || '<span class="note">No casts yet.</span>'}</div>
      <p class="note">Session: ${t.casts} casts, staked ${money(t.staked)}, won ${money(t.won)}. Each cast rolls from the published paytable below. Gear, skill and store items never change these odds. Paytable ${mode.hash.slice(0, 12)}.</p>
      <details><summary>Odds for one ${money(stake)} cast</summary><table class="odds"><tr><th>Catch</th><th>Pays</th><th>Chance</th></tr>${rows}
        <tr><td>Feeding frenzy</td><td>bonus</td><td>${fmt(mode.pFrenzy * 100, 2)}%</td></tr><tr><td>Sunken chest</td><td>bonus</td><td>${fmt(mode.pChest * 100, 2)}%</td></tr><tr><td>Nothing</td><td>0×</td><td>${fmt(mode.pNothing * 100, 1)}%</td></tr></table></details>`;
  }

  beta() {
    const s = summary(this.game.stats);
    const json = encodeURIComponent(JSON.stringify(this.game.stats, null, 2));
    const row = (k, v) => `<span>${k} <b>${v}</b></span>`;
    return `<p class="note">The beta keeps these numbers in this browser so we can see whether the game holds up. Nothing is sent anywhere.</p>
      <div class="stats beta-stats">${row('Sessions', s.sessions)}${row('Days played', s.daysPlayed)}${row('Play time', duration(s.playMinutes))}${row('Sim casts', s.simCasts)}${row('Cash Waters casts', s.cashCasts)}${row('Quick Cast share', `${Math.round(s.quickShare * 100)}%`)}${row('Frenzy Buys', s.frenzyBuys)}${row('Store purchases', s.purchases)}</div>
      <div class="rest" style="margin-top:12px"><a class="button" href="data:application/json,${json}" download="memefishing-beta-data.json">Download</a><button data-action="stats-clear">Delete</button></div>`;
  }

  market() {
    const { market, profile, water } = this.game;
    const here = speciesIn(water);
    const rows = SPECIES.map((s) => {
      const ch = changeOf(market, s.id);
      return `<tr class="${here.includes(s.id) ? '' : 'faded'}"><td>${s.name}</td><td>$${s.ticker}</td><td class="num">${fmt(quote(market, s.id), 1)}</td><td class="num ${ch >= 0 ? 'up' : 'down'}">${pct(ch)}</td><td><canvas class="spark" data-id="${s.id}" width="220" height="52"></canvas></td></tr>`;
    }).join('');
    const bag = profile.bag.length
      ? `<table><tr><th>Fish</th><th>Weight</th><th>Bagged at</th><th>Now</th><th></th></tr>${profile.bag
          .map((f, i) => {
            const s = speciesById(f.species);
            const now = f.weight * quote(market, s.id);
            const cls = now >= f.value ? 'up' : 'down';
            return `<tr><td>${s.name}</td><td class="num">${f.weight.toFixed(2)} kg</td><td class="num">${fmt(f.value)}</td><td class="num ${cls}">${fmt(now)}</td><td><button data-action="sell" data-index="${i}">Sell</button></td></tr>`;
          })
          .join('')}</table><div class="rest" style="margin-top:8px"><button class="primary" data-action="sell-all">Sell whole bag</button></div>`
      : '<p class="note">Your bag is empty. Catch something and bag it to sell here.</p>';
    const news = market.news.length ? market.news.map((n) => `<div class="${n.tone === 'bad' ? 'down' : 'up'}">${n.text}</div>`).join('') : '<div class="note">Quiet market.</div>';
    return `<p class="note">Prices are REEL per kg and move every game minute. Sell into a pump, hold through a dip. A pump sends that fish into a feeding frenzy; a rug pull puts it off the bite. ${SENTIMENT[market.sentiment].label}${market.sentiment === 'bull' ? ': fish are hungrier.' : market.sentiment === 'bear' ? ': fish are sluggish.' : '.'} Faded rows don't live in ${water.name}.</p>
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
    const { profile, water } = this.game;
    const spots = water.spots.map((s) => {
      const here = profile.spot === s.id;
      const check = canTravel(profile, s);
      const owned = profile.spots.includes(s.id);
      const btn = here
        ? '<button disabled>You are here</button>'
        : `<button class="primary" data-action="travel" data-id="${s.id}" ${check.ok ? '' : 'disabled'}>${check.ok ? (owned || !s.price ? 'Walk here' : `Unlock for ${s.price} REEL`) : check.why}</button>`;
      return `<div class="spot ${here ? 'here' : ''}"><strong>${s.name}</strong><span class="note" style="margin:0">${s.blurb}</span>${btn}</div>`;
    }).join('');
    const waters = WATERS.map((w) => {
      const here = profile.water === w.id;
      const check = canBridge(profile, w.id);
      const fish = speciesIn(w).map((id) => speciesById(id)).filter((s) => s.rarity === 'legendary').map((s) => s.name).join(', ');
      const btn = here ? '<button disabled>You are here</button>' : `<button class="primary" data-action="bridge" data-id="${w.id}" ${check.ok ? '' : 'disabled'}>${check.ok ? (w.gas ? `Bridge · ${w.gas} REEL gas` : 'Go home · free') : check.why}</button>`;
      return `<div class="spot water-card ${here ? 'here' : ''}"><strong>${w.name} <span class="badge">${w.chain}</span> <span class="badge">Lv ${w.level}</span></strong><span class="note" style="margin:0">${w.blurb}${fish ? ` Legend: ${fish}.` : ''}</span>${btn}</div>`;
    }).join('');
    return `<div class="map-wrap"><canvas id="lake-map" width="400" height="400"></canvas><div>${spots}
      <div class="section"><h3>Rest until</h3><div class="rest">
        <button data-action="rest" data-hour="5.5">Dawn</button><button data-action="rest" data-hour="12">Noon</button>
        <button data-action="rest" data-hour="18.5">Dusk</button><button data-action="rest" data-hour="22">Night</button></div>
        <p class="note">Walking to another spot takes 20 minutes. Resting skips ahead; the market keeps moving while you sleep.</p></div></div></div>
      <div class="section"><h3>Other waters</h3><p class="note">Each water is its own chain with its own scenery, weather and fish. Bridging costs a gas fee and about 30 minutes.</p><div class="grid">${waters}</div></div>`;
  }

  drawMap() {
    const c = $('lake-map');
    if (!c) return;
    const { water, profile, events } = this.game;
    const ctx = c.getContext('2d');
    const span = water.mapSpan;
    const scale = c.width / span;
    const shape = water.shape;
    const img = ctx.createImageData(c.width, c.height);
    const depths = new Float32Array(c.width * c.height);
    for (let y = 0; y < c.height; y += 1) {
      for (let x = 0; x < c.width; x += 1) {
        depths[y * c.width + x] = shape.depthAt((x - c.width / 2) / scale, (y - c.height / 2) / scale);
      }
    }
    const land = water.palette.snow ? [200, 206, 212] : shape.kind === 'river' ? [120, 108, 90] : [52, 82, 40];
    const levels = [2, 5, 9, 14];
    const band = (d) => levels.filter((l) => d >= l).length;
    for (let y = 0; y < c.height; y += 1) {
      for (let x = 0; x < c.width; x += 1) {
        const k = y * c.width + x;
        const d = depths[k];
        const i = k * 4;
        if (d > 0) {
          const t = Math.min(1, d / 16);
          let r = 40 - t * 30;
          let gg = 120 - t * 70;
          let b = 170 - t * 60;
          const edge = (x + 1 < c.width && band(depths[k + 1]) !== band(d)) || (y + 1 < c.height && band(depths[k + c.width]) !== band(d));
          if (edge) {
            r += 60;
            gg += 60;
            b += 60;
          }
          img.data[i] = r;
          img.data[i + 1] = gg;
          img.data[i + 2] = b;
        } else {
          img.data[i] = land[0];
          img.data[i + 1] = land[1];
          img.data[i + 2] = land[2];
        }
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const px = (p) => [c.width / 2 + p.x * scale, c.height / 2 + p.z * scale];
    // Live hotspots.
    for (const h of hotspots(events, water.id)) {
      const [hx, hy] = px(h);
      ctx.fillStyle = h.kind === 'boils' ? 'rgba(255,93,82,0.35)' : 'rgba(245,197,66,0.35)';
      ctx.beginPath();
      ctx.arc(hx, hy, h.radius * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 12px system-ui';
      ctx.fillText(h.kind === 'boils' ? 'Boils!' : 'Birds', hx - 16, hy + 4);
    }
    if (shape.kind === 'river') {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '600 12px system-ui';
      ctx.fillText('Current →', 10, c.height - 10);
    }
    ctx.font = '600 13px system-ui';
    for (const s of water.spots) {
      const [sx, sy] = px(water.poses[s.id]);
      ctx.fillStyle = profile.spot === s.id ? '#f5c542' : '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fill();
      const w = ctx.measureText(s.name).width;
      ctx.fillText(s.name, sx + 9 + w > c.width ? sx - 9 - w : sx + 9, sy + 4);
    }
  }

  missions() {
    const g = this.game;
    const { profile, world, water } = g;
    const mine = profile.missions.filter((m) => m.water === water.id);
    const missionCards = mine
      .map((m) => {
        const frac = m.kind === 'sell' ? 0 : m.progress / m.target;
        return `<div class="item ${m.legendary ? 'legend' : ''}"><h3>${m.text}</h3><div class="bar"><div style="width:${frac * 100}%"></div></div><div class="foot"><span class="note" style="margin:0">${missionLabel(m)}</span><span class="price">+${fmt(m.reward.meme)} REEL · ${m.reward.xp} XP</span></div></div>`;
      })
      .join('');
    const here = speciesIn(water);
    const live = g.events.list.filter((ev) => (ev.water ? ev.water === water.id : !ev.species || ev.species.some((id) => here.includes(id))));
    const eventRows = live.length
      ? live.map((ev) => `<div class="spot"><strong>${EVENT_LABEL[ev.kind]}</strong><span class="note" style="margin:0">${ev.text}. Ends ${hhmm(ev.until)}.</span></div>`).join('')
      : '<p class="note">Nothing happening right now. Watch the news feed: whale alerts, diving birds, pumps and storm fronts all change where and what bites.</p>';

    const d = profile.derby;
    let derbyHtml = '';
    if (d && !d.settled) {
      const table = standings(d);
      const status = derbyActive(d, world.minute) ? `Running · ends ${hhmm(d.end)}` : `Starts ${hhmm(d.start)}`;
      derbyHtml = `<div class="item"><h3>Your derby: ${FORMATS[d.format].label} on ${WATERS.find((w) => w.id === d.water).name}</h3><div class="note" style="margin:0">${status} · Prize pool ${fmt(prizePool(d))} REEL (50/30/20)</div>
        <table>${table.map((r, i) => `<tr class="${r.you ? 'you' : ''}"><td>${i + 1}</td><td>${r.name}</td><td class="num">${formatScore(d, r.score)}</td></tr>`).join('')}</table></div>`;
    } else {
      const list = upcomingDerbies(water.id, world.minute, 3);
      derbyHtml = `<div class="grid">${list
        .map((x) => {
          const running = world.minute >= x.start;
          const ok = profile.wallet >= x.fee;
          return `<div class="item"><h3>${FORMATS[x.format].label}</h3><div class="stats"><span>Day <b>${Math.floor(x.start / 1440) + 1}</b></span><span>${running ? 'Running until' : 'Starts'} <b>${hhmm(running ? x.end : x.start)}</b></span><span>Pool <b>${fmt(prizePool(x))} REEL</b></span></div><div class="foot"><span class="price">Entry ${x.fee} REEL</span><button class="primary" data-action="derby-enter" data-id="${x.id}" ${ok ? '' : 'disabled'}>${ok ? (running ? 'Join late' : 'Enter') : 'Not enough REEL'}</button></div></div>`;
        })
        .join('')}</div>`;
    }
    return `<div class="section" style="margin-top:0"><h3>Contracts on ${water.name}</h3><div class="grid">${missionCards}</div></div>
      <div class="section"><h3>Live on the water</h3>${eventRows}</div>
      <div class="section"><h3>Derbies</h3><p class="note">Four-hour competitions against seven rival anglers. Only fish landed on this water during the derby count. Top three split the pool.</p>${derbyHtml}</div>`;
  }

  journal() {
    const { profile } = this.game;
    const cards = SPECIES.map((s) => {
      const j = profile.journal[s.id];
      const where = WATERS.filter((w) => speciesIn(w).includes(s.id)).map((w) => w.name).join(', ');
      if (!j) return `<div class="item"><h3>???</h3><div class="note">Not caught yet. Rumoured to be a ${s.rarity} catch in ${where}.</div></div>`;
      const lures = Object.entries(s.lures).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => byId(LURES, id).name).join(', ');
      return `<div class="item"><h3>${s.name} <span class="badge ${s.rarity}">${s.rarity}</span></h3>
        <div class="stats"><span>Caught <b>${j.count}</b></span><span>Best <b>${j.best.toFixed(2)} kg</b></span><span>Real fish <b>${s.real}</b></span></div>
        <div class="note">Feeds: ${TIME_LABEL[s.time]} · ${s.depth[0]}–${s.depth[1]} m · Best on ${lures} · Lives in ${where}</div></div>`;
    }).join('');
    const st = profile.stats;
    const found = Object.keys(profile.journal).length;
    return `<p class="note">${found}/${SPECIES.length} species · Caught ${st.caught} · Released ${st.released} · Sold ${st.sold} for ${fmt(st.earned)} REEL · Missions ${st.missions} · Derbies ${st.derbies} (${st.derbyWins} won)</p><div class="grid">${cards}</div>`;
  }

  // How to play: the whole game in one place, for new players and for anyone reviewing it.
  help() {
    const card = (title, text) => `<div class="item"><h3>${title}</h3><div class="note" style="margin:0">${text}</div></div>`;
    const keys = (rows) => `<table class="keys">${rows.map(([what, desk, touch]) => `<tr><td>${what}</td><td>${desk}</td><td>${touch}</td></tr>`).join('')}</table>`;
    const pages = {
      start: {
        label: 'Start here',
        html: `<p class="note" style="margin-top:0">Memefishing is a first-person fishing sim. You stand on the bank, rig your gear, cast, hook and fight fish, then sell them on a market where every species trades like a memecoin. Selling earns REEL, the in-game coin, which buys better gear and opens new waters.</p>
          <div class="grid">
            ${card('1. Catch', 'Cast, wait for a bite, strike, and play the fish to the bank without snapping the line.')}
            ${card('2. Sell', 'Bag fish and sell them at the Fish Market (B) when the price is up, or release them for more XP.')}
            ${card('3. Upgrade', 'Spend REEL on rods, reels, lines and lures in Tackle (T). Levels unlock better gear.')}
            ${card('4. Explore', 'Move to new spots and bridge to new waters from the Map (M). Take on missions and derbies (O).')}
          </div>
          <div class="section"><h3>Tutorial</h3><p class="note">A coached walk through your first catch. It runs the first time you play and you can replay it any time.</p><button class="primary" data-action="tutorial">Replay tutorial</button></div>`
      },
      fishing: {
        label: 'Catching a fish',
        html: `<div class="grid">
            ${card('Cast', 'Hold left click or Space to build power and release to cast. The meter swings back and forth, so let go near the top. Aim with the mouse.')}
            ${card('Float rigs', 'A worm or minnow hangs under a float. Set the depth with Q and E (or in Tackle) to where fish feed, then wait. A nibble makes the float bob; a bite pulls it under.')}
            ${card('Lures', 'Spinners, jigs, poppers and crankbaits must be retrieved. Hold to reel, W and S change reel speed (each lure has a best speed). Right click hops the lure; pausing lets it sink.')}
            ${card('Bottom rigs', 'Sit on the bottom. Watch the rod tip. Good at night for catfish.')}
            ${card('Strike', 'Right click or F when the float goes under or the rod thumps. Too early spooks the fish; too late and it steals the bait. Lures often hook fish by themselves if you keep reeling through the take.')}
            ${card('Fight', 'Watch the tension bar. Reel when the fish rests. Stop when it runs or shakes its head. Hold right click to lift the rod and tire it. Keep the line tight or the hook pulls out.')}
            ${card('Drag', 'The mouse wheel or [ and ] set the drag. Below your line strength the reel gives line instead of snapping. Too loose and the fish runs off all your line.')}
            ${card('Landing', 'Bag it (6 fish fit in the bag), sell it straight away at a 20% discount, or release it for extra XP. Trophy photo saves a picture with the weight on it.')}
            ${card('Read the water', 'Each species feeds at certain times and depths and likes certain baits. The Fish Journal (J) lists what you have learned. Weather and time of day change what bites.')}
          </div>`
      },
      gear: {
        label: 'Gear',
        html: `<p class="note" style="margin-top:0">Your setup is a rod, a reel, a line and a rig or lure on the end. Each one changes what bites and whether you land it. Buy and swap gear in Tackle (T); better gear unlocks as you level up.</p>
          <div class="grid">
            ${card('Rod', 'Cast distance, and max load: how hard the rod can pull before it snaps. Lifting the rod (right click) loads it more. A soft rod bends and cushions head shakes; a fast, stiff rod passes them straight to the line.')}
            ${card('Reel', 'Max drag is the hardest it can hold back a running fish. Retrieve is how fast it winds in. Power decides whether it can wind against a heavy fish or stalls. The spool holds your line: if a fish takes it all, you are spooled.')}
            ${card('Line', 'Breaks at its strength in kg, so set the drag below that. Stretch cushions shakes and lunges. Visibility matters: wary fish bite less on line they can see.')}
            ${card('Rig or lure', 'Decides how you fish and which fish bite. Each species has favourites (below, and in the Journal).')}
            ${card('Drag', 'The setting that ties it together. Mouse wheel or [ ]. It starts at half your line strength. Lower it for big fish so the reel gives line instead of snapping; raise it so you can gain line on a tired fish.')}
            ${card('Broken rod', 'Over-load the rod and it breaks. Repair it in Tackle (a quarter of its price, at least 20 REEL) before your next cast.')}
            ${card('Fish finder', 'Electronics in Tackle. Sonar on your HUD shows the bottom, your lure and fish along your cast line. K turns it on and off.')}
            ${card('Boats', 'Buy one in Tackle (Boats). Press G to launch from your spot, W and S for throttle, A and D to steer, and G again to get back on the bank. The boat goes as far as its range from where you launched. You fish over the nearest spot’s fish, so you can reach deep water the bank can’t. Stop to cast; the boat holds still while your line is out.')}
          </div>
          <div class="section"><h3>Rigs and lures</h3><table class="keys">${LURES.map((l) => {
            const how = l.kind === 'float' ? 'Hangs bait under a float at the depth you set. Wait for the dip, then strike.' : l.kind === 'bottom' ? 'Sits on the bottom. Watch the rod tip.' : l.topwater ? `Works on the surface. Pop it and pause; best around ${l.idealSpeed} m/s.` : `Must be retrieved. Runs about ${l.dive} m deep; best at ${l.idealSpeed} m/s${l.pauseAppeal >= 0.6 ? ', and fish hit it on the pause' : ''}.`;
            const best = SPECIES.filter((sp) => (sp.lures[l.id] || 0) >= 0.8).map((sp) => sp.name).join(', ') || 'A bit of everything';
            return `<tr><td><b>${l.name}</b><br>Level ${l.level}</td><td>${how}</td><td>Best for: ${best}</td></tr>`;
          }).join('')}</table></div>
          <div class="section"><h3>Lines</h3><table class="keys">${LINES.map((l) => `<tr><td><b>${l.name}</b><br>Level ${l.level}</td><td>Breaks at ${l.strength} kg · ${Math.round(l.stretch * 100)}% stretch · ${l.visibility > 0.5 ? 'easy' : l.visibility > 0.2 ? 'fairly easy' : 'hard'} for fish to see</td><td>${l.blurb}</td></tr>`).join('')}</table></div>
          <div class="section"><h3>Rods and reels</h3><table class="keys">${RODS.map((r) => `<tr><td><b>${r.name}</b><br>Level ${r.level}</td><td>Max load ${r.maxLoad} kg · casts ${r.cast} m</td><td>${r.blurb}</td></tr>`).join('')}${REELS.map((r) => `<tr><td><b>${r.name}</b><br>Level ${r.level}</td><td>Max drag ${r.maxDrag} kg · ${r.speed} m/s · ${r.capacity} m spool</td><td>${r.blurb}</td></tr>`).join('')}</table></div>`
      },
      waters: {
        label: 'Waters and events',
        html: `<div class="grid">
            ${card('Genesis Lake', 'Your home water. Pines, reeds and an old dock. Every technique works here.')}
            ${card('Shitcoin Swamp', 'Level 2, 30 REEL gas to bridge. Murky water, fog and frogs.')}
            ${card('Bull Run River', 'Level 3, 60 REEL gas. A current carries floats downstream: let them drift.')}
            ${card('Cold Wallet Lake', 'Level 4, 90 REEL gas. Cold, deep and clear.')}
            ${card('Spots', 'Each water has several spots. Move between them from the Map (M); new ones cost REEL and a level to unlock.')}
            ${card('Legendaries', 'Each water has its own legendary fish. They need the right gear, place and time.')}
            ${card('Live events', 'Whale alerts mean a legendary is boiling nearby. Diving birds mark bait. Pumps start feeding frenzies; rugs make fish sulk. Storm fronts make fish feed hard before they hit.')}
            ${card('Time and weather', 'A clock runs all day and night, with sun, cloud, rain, storms, fog and snow. Z runs time ×20 while you wait. Rest from the Map to skip ahead.')}
          </div>`
      },
      money: {
        label: 'REEL and the market',
        html: `<div class="grid">
            ${card('REEL', 'The in-game coin. Your wallet is at the top right. You earn it by selling fish, finishing missions and placing in derbies.')}
            ${card('Fish market', 'Every species has a ticker and a price that moves all day. Prices are per kg. Sell when the chart is up (B).')}
            ${card('Market mood', 'The market flips between bull runs, crabbing and bear markets. Fish bite more in a bull run.')}
            ${card('Spending', 'Tackle and gear, unlocking spots, gas to bridge to other waters, rod repairs, derby entry fees and Store looks.')}
            ${card('Missions', 'Contracts on each water: catch a species, beat a weight, fish a lure, fish at night, release fish or sell well. Each water also has a legendary contract. Rewards are REEL and XP (O).')}
            ${card('Cash Waters', 'Press C. Each water plays a published paytable on a play balance: pick a bait, then cast (Quick Cast shows the result in 2.5 seconds). The odds and return are shown in the panel, and gear never changes them. The play balance has no cash value and tops up free when it runs out.')}
            ${card('Derbies', 'Four-hour competitions against seven rival anglers: heaviest fish, best 3-fish bag or most fish. Pay the entry, and the top three split the pool.')}
          </div>`
      },
      store: {
        label: 'Store',
        html: `<div class="grid">
            ${card('What it sells', 'New looks for your float and rod. Open it with U.')}
            ${card('Looks only', "Store items never change bites, fights, prices or odds. Each card says what you get, and nothing is random.")}
            ${card('Your account', 'Items are saved to your angler account and stay even if beta progress is reset. They can’t be traded or sold. Set your angler name in the Store.')}
            ${card('Paying', FLAGS.realMoneyPayments ? 'Pay with REEL from fishing, or by card. Card details go to Stripe’s checkout page, never to the game. In Tackle, gear can be unlocked by card before you reach its level; it can always be earned with REEL too.' : 'Store items cost REEL from fishing.')}
          </div>`
      },
      controls: {
        label: 'Controls',
        html: `${keys([
          ['<b>Action</b>', '<b>Keyboard and mouse</b>', '<b>Phone</b>'],
          ['Aim', 'Mouse, A / D', 'Drag the screen'],
          ['Cast', 'Hold left click or Space, release', 'Hold Cast / Reel, release'],
          ['Reel / retrieve', 'Hold left click or Space', 'Hold Cast / Reel'],
          ['Strike, lift rod, hop lure', 'Right click or F', 'Strike / Lift'],
          ['Drag', 'Mouse wheel or [ ]', 'Drag − / +'],
          ['Reel speed', 'W / S', 'Speed − / +'],
          ['Float depth', 'Q / E', 'Tackle menu'],
          ['Tackle, Store, Market', 'T / U / B', 'Menu bar'],
          ['Cash Waters', 'C', 'Menu bar'],
          ['Clean view (hide everything not needed to fish)', 'V', 'Menu bar'],
          ['Map, Missions, Journal', 'M / O / J', 'Menu bar'],
          ['How to play', 'H', 'Menu bar'],
          ['Time ×20', 'Z', 'Menu bar'],
          ['Photo mode', 'P, then click or Space to snap', 'Menu bar'],
          ['Fish finder on/off', 'K', ''],
          ['Launch or dock a boat', 'G', 'Boat'],
          ['Drive a boat', 'W / S throttle, A / D steer', 'Arrow pad'],
          ['Close a menu', 'Esc', 'Close']
        ])}<p class="note">Graphics (Low, Medium, High) and Sound are on the menu bar.</p>`
      }
    };
    const tab = pages[this.helpTab] ? this.helpTab : 'start';
    const tabs = Object.entries(pages)
      .map(([k, p]) => `<button data-action="help-tab" data-tab="${k}" class="${tab === k ? 'on' : ''}">${p.label}</button>`)
      .join('');
    return `<div class="tabs">${tabs}</div>${pages[tab].html}`;
  }

  // The tutorial coach card. step is null when the tutorial isn't running.
  coach(step, index, total, note, touch = false) {
    const el = this.el.coach;
    el.classList.toggle('hidden', !step);
    if (!step) return;
    const buttons = step.next ? `<button class="primary" data-action="tutorial-next">${step.last ? 'Start fishing' : 'Next'}</button>` : '';
    el.innerHTML = `<div class="coach-head"><span class="label">Tutorial ${index + 1}/${total}</span>${step.last ? '' : '<button class="ghost" data-action="tutorial-skip">Skip tutorial</button>'}</div>
      <h3>${step.title}</h3>${note ? `<p class="coach-note">${note}</p>` : ''}<p>${(touch && step.touch) || step.text}</p>${buttons ? `<div class="coach-foot">${buttons}</div>` : ''}`;
  }

  catchCard(info) {
    const { species: s, weight, length, trophy, price, xpKeep, xpRelease, bagFull } = info;
    const value = weight * price;
    this.el['catch-card'].innerHTML = `
      <div class="label">You landed</div>
      <h2>${s.name} <span class="ticker-tag">$${s.ticker}</span><span class="badge ${s.rarity}">${s.rarity}</span>${trophy ? `<span class="badge trophy">${trophy}</span>` : ''}</h2>
      <div class="facts"><div><span class="label">Weight</span><strong>${weight.toFixed(2)} kg</strong></div><div><span class="label">Length</span><strong>${length} cm</strong></div><div><span class="label">Market value</span><strong class="price">${fmt(value)} REEL</strong></div></div>
      <p class="caption">"${s.caption}" Real-world cousin: ${s.real}.</p>
      <div class="actions">
        <button class="primary" data-action="keep" ${bagFull ? 'disabled' : ''}>${bagFull ? 'Bag full' : `Bag it (+${xpKeep} XP)`}</button>
        <button data-action="dump">Market sell now (−20% slippage)</button>
        <button data-action="release">Release (+${xpRelease} XP)</button>
        <button data-action="trophy-photo">Trophy photo</button>
      </div>`;
    this.el.catch.classList.remove('hidden');
  }

  hideCatch() {
    this.el.catch.classList.add('hidden');
  }
}
