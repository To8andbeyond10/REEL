// Memefishing: first-person fishing sim. Wires the sim rules (src/sim) to the 3D world and HUD (src/game).
import * as pc from 'playcanvas';
import { WorldScene } from './game/scene.js';
import { QUALITY, Renderer, saveQuality } from './game/render.js';
import { Life } from './game/life.js';
import { Effects, FloatBobber, Lure, Rod, buildFish, swimFish } from './game/rig.js';
import { Ui } from './game/ui.js';
import { Sound } from './game/audio.js';
import { SPECIES } from './sim/data.js';
import { castLanding, forward, spotById, waterById } from './sim/waters.js';
import { biteCue, biteRates, createBite, lengthCm, rollBite, rollWeight, stepBite, stepLureDepth, strike, trophyRank } from './sim/bite.js';
import { RESULT_TEXT, createFight, fightReadout, stepFight } from './sim/fight.js';
import { SENTIMENT, changeOf, createMarket, quote, stepMarket } from './sim/market.js';
import { WEATHER, clockLabel, createWorld, dayOf, daylight, hourOf, setClimate, stepWorld } from './sim/world.js';
import { ALL_GEAR, BAG_SIZE, bridge, buy, catchXp, gear, levelOf, loadProfile, owns, recordCatch, repairCost, saveProfile, travel } from './sim/profile.js';
import { createEvents, eventMultiplier, hotspots, stepEvents } from './sim/events.js';
import { ensureMissions, missionCatch, missionSell } from './sim/missions.js';
import { derbyCatch, register, settleDerby, stepDerby, upcomingDerbies } from './sim/derby.js';
import { sonar } from './sim/sonar.js';
import { clamp, createRng } from './sim/random.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const LINE_COLORS = {
  'line-mono6': new pc.Color(0.9, 0.92, 0.9, 0.8),
  'line-fluoro10': new pc.Color(0.95, 0.8, 0.85, 0.6),
  'line-braid30': new pc.Color(0.85, 1, 0.2, 0.95),
  'line-ledger65': new pc.Color(1, 0.55, 0.15, 0.95)
};

class Game {
  constructor(canvas) {
    this.rng = createRng(Date.now() & 0xffffffff);
    this.storage = (() => {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    })();
    this.profile = loadProfile(this.storage);
    this.world = createWorld(this.rng, 6 * 60 + 30);
    this.market = createMarket(this.rng);
    stepMarket(this.market, 90); // some price history before the first look
    this.events = createEvents();
    this.events.lastNews = this.market.newsSeq;
    this.events.nextHotspotAt = this.world.minute + 25;
    this.state = 'title';
    this.input = { primary: false, secondary: false, primaryEdge: false, secondaryEdge: false, primaryUp: false };
    this.aim = { yaw: 0, pitch: -0.1, keys: 0 };
    this.reelGear = 3;
    this.drag = 0;
    this.fastForward = false;
    this.minuteAcc = 0;
    this.envMinute = -1;
    this.lure = { active: false, x: 0, z: 0, depth: 0, dist: 0, dir: { x: 0, z: -1 }, settled: 0, hop: 0, flight: null };
    this.castPower = 0;
    this.fish = null;
    this.fishModels = {};
    this.hudTimer = 0;
    this.whip = 0;
    this.photo = false;
    this.snap = null;
    this.finderOn = true;

    this.app = new pc.Application(canvas, {
      mouse: new pc.Mouse(canvas),
      touch: pc.platform.touch ? new pc.TouchDevice(canvas) : undefined,
      graphicsDeviceOptions: { antialias: true }
    });
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.start();

    this.camera = new pc.Entity('camera');
    this.camera.addComponent('camera', { fov: 62, nearClip: 0.05, farClip: 1500, clearColor: new pc.Color(0.5, 0.7, 0.9) });
    this.app.root.addChild(this.camera);

    this.scene = new WorldScene(this.app, this.camera);
    this.renderer = new Renderer(this.app, this.camera);
    this.applyQuality(this.renderer.level);
    this.rod = new Rod(this.camera);
    this.floatModel = new FloatBobber(this.app);
    this.lureModel = new Lure(this.app);
    this.effects = new Effects(this.app);
    this.life = new Life(this.app, this.scene, this.effects);
    for (const s of SPECIES) this.fishModels[s.id] = buildFish(this.app, s);
    this.sound = new Sound();
    this.ui = new Ui(this);
    this.scene.onThunder = (dist) => this.sound.thunder(dist);
    this.life.onSplash = (p, size) => {
      if (p.distance(this.camera.getPosition()) < 45) this.sound.plop(Math.min(1.4, 0.5 + size * 0.5));
    };

    this.loadWater();
    this.resetDrag();
    this.bindInput(canvas);
    window.addEventListener('resize', () => this.app.resizeCanvas());
    this.app.on('update', (dt) => this.update(dt));
    this.app.on('frameend', () => this.takeSnap());
    this.title();
  }

  get gear() {
    return gear(this.profile);
  }
  get water() {
    return waterById(this.profile.water);
  }
  get pose() {
    return this.water.poses[this.profile.spot];
  }
  get spot() {
    return spotById(this.profile.spot);
  }
  get rodBroken() {
    return this.profile.brokenRod === this.profile.loadout.rod;
  }
  get reelSpeed() {
    return (this.gear.reel.speed * this.reelGear) / 5;
  }
  get hasFinder() {
    return owns(this.profile, 'finder');
  }

  // Builds the scenery, weather and missions for the water you're on.
  loadWater() {
    const water = this.water;
    this.scene.build(water);
    this.life.setWater(water);
    setClimate(this.world, water.weather, water.tempBase);
    ensureMissions(this.profile, water.id, this.rng);
    this.aim.yaw = 0;
    this.placeCamera(0);
    this.updateEnvironment(true);
  }

  resetDrag() {
    const { line, reel } = this.gear;
    this.drag = Math.min(reel.maxDrag, Math.round(line.strength * 0.5 * 10) / 10);
  }

  save() {
    saveProfile(this.storage, this.profile);
  }

  title() {
    document.getElementById('start-button').addEventListener('click', () => {
      this.sound.unlock();
      this.ui.showHud();
      this.state = 'idle';
      if (pc.platform.touch) document.getElementById('touch').classList.remove('hidden');
      if (this.profile.stats.caught === 0) this.ui.open('help');
    });
  }

  // ---------- input ----------
  bindInput(canvas) {
    const down = (which) => {
      this.sound.unlock();
      if (!this.input[which]) this.input[`${which}Edge`] = true;
      this.input[which] = true;
    };
    const up = (which) => {
      if (which === 'primary' && this.input.primary) this.input.primaryUp = true;
      this.input[which] = false;
    };
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (this.photo) {
        if (e.pointerType !== 'touch') this.snapPhoto();
        else this.touchLook = { x: e.clientX, y: e.clientY, yaw: this.aim.yaw, pitch: this.aim.pitch };
        return;
      }
      if (this.blocked) return;
      if (e.pointerType === 'touch') {
        this.touchLook = { x: e.clientX, y: e.clientY, yaw: this.aim.yaw, pitch: this.aim.pitch };
        return;
      }
      down(e.button === 2 ? 'secondary' : 'primary');
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') {
        this.touchLook = null;
        return;
      }
      up(e.button === 2 ? 'secondary' : 'primary');
    });
    window.addEventListener('pointermove', (e) => {
      if (this.blocked && !this.photo) return;
      const yawMax = this.photo ? 2.6 : 1;
      if (e.pointerType === 'touch') {
        if (!this.touchLook) return;
        this.aim.yaw = clamp(this.touchLook.yaw - (e.clientX - this.touchLook.x) * 0.004, -yawMax, yawMax);
        this.aim.pitch = clamp(this.touchLook.pitch - (e.clientY - this.touchLook.y) * 0.003, -0.6, this.photo ? 0.7 : 0.2);
        return;
      }
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      this.aim.yaw = clamp(-nx * (this.photo ? 5 : 1.9), -yawMax, yawMax);
      this.aim.pitch = clamp(-ny * (this.photo ? 1.4 : 0.7) - 0.1, -0.6, this.photo ? 0.7 : 0.2);
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.adjustDrag(e.deltaY < 0 ? 0.1 : -0.1);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (this.state === 'title') return;
      const k = e.code;
      if (k === 'Escape') {
        if (this.photo) this.togglePhoto();
        else if (this.ui.modalOpen) this.ui.close();
        return;
      }
      if (k === 'KeyP' && !e.repeat) {
        this.togglePhoto();
        return;
      }
      if (this.photo) {
        if (k === 'Space') {
          e.preventDefault();
          this.snapPhoto();
        }
        return;
      }
      const panels = { KeyT: 'tackle', KeyB: 'market', KeyM: 'map', KeyJ: 'journal', KeyO: 'missions', KeyH: 'help' };
      if (panels[k]) {
        if (this.ui.panel === panels[k]) this.ui.close();
        else this.ui.open(panels[k]);
        return;
      }
      if (this.blocked) return;
      if (e.repeat) return;
      if (k === 'Space') {
        e.preventDefault();
        down('primary');
      } else if (k === 'KeyF') down('secondary');
      else if (k === 'KeyW') this.reelGear = Math.min(5, this.reelGear + 1);
      else if (k === 'KeyS') this.reelGear = Math.max(1, this.reelGear - 1);
      else if (k === 'BracketRight' || k === 'Equal') this.adjustDrag(0.1);
      else if (k === 'BracketLeft' || k === 'Minus') this.adjustDrag(-0.1);
      else if (k === 'KeyE') this.setFloatDepth(this.profile.floatDepth + 0.2);
      else if (k === 'KeyQ') this.setFloatDepth(this.profile.floatDepth - 0.2);
      else if (k === 'KeyZ') this.toggleFastForward();
      else if (k === 'KeyK') this.finderOn = !this.finderOn;
      else if (k === 'KeyA') this.aim.keys = 1;
      else if (k === 'KeyD') this.aim.keys = -1;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') up('primary');
      else if (e.code === 'KeyF') up('secondary');
      else if (e.code === 'KeyA' || e.code === 'KeyD') this.aim.keys = 0;
    });
    // Losing focus releases everything so the reel never sticks on.
    window.addEventListener('blur', () => {
      up('primary');
      up('secondary');
    });

    document.querySelectorAll('[data-touch]').forEach((b) => {
      const t = b.dataset.touch;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (t === 'primary' || t === 'secondary') down(t);
        else if (t === 'drag-up') this.adjustDrag(0.2);
        else if (t === 'drag-down') this.adjustDrag(-0.2);
        else if (t === 'speed-up') this.reelGear = Math.min(5, this.reelGear + 1);
        else if (t === 'speed-down') this.reelGear = Math.max(1, this.reelGear - 1);
      });
      const release = () => {
        if (t === 'primary' || t === 'secondary') up(t);
      };
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      b.addEventListener('pointerleave', release);
    });
    document.getElementById('ff-button').addEventListener('click', () => this.toggleFastForward());
    document.getElementById('photo-button').addEventListener('click', () => this.togglePhoto());
    document.getElementById('photo-snap').addEventListener('click', () => this.snapPhoto());
    document.getElementById('photo-exit').addEventListener('click', () => this.togglePhoto());
    document.getElementById('quality-button').addEventListener('click', () => {
      const levels = Object.keys(QUALITY);
      const next = levels[(levels.indexOf(this.renderer.level) + 1) % levels.length];
      saveQuality(next);
      this.applyQuality(next);
    });
    document.getElementById('mute-button').addEventListener('click', (e) => {
      e.currentTarget.textContent = this.sound.toggle() ? 'Sound off' : 'Sound';
    });
  }

  get blocked() {
    return this.state === 'title' || this.ui.modalOpen || this.state === 'catch' || this.photo;
  }

  adjustDrag(delta) {
    const { reel } = this.gear;
    this.drag = clamp(Math.round((this.drag + delta) * 10) / 10, 0.1, reel.maxDrag);
  }

  setFloatDepth(v) {
    this.profile.floatDepth = clamp(Math.round(v * 10) / 10, 0.3, 12);
    this.save();
  }

  toggleFastForward() {
    if (this.state === 'fight' || this.state === 'bite') return;
    this.fastForward = !this.fastForward;
  }

  consumeEdges() {
    this.input.primaryEdge = false;
    this.input.secondaryEdge = false;
    this.input.primaryUp = false;
  }

  // ---------- photo mode ----------
  togglePhoto() {
    if (this.state === 'title' || this.state === 'fight' || this.state === 'bite') return;
    if (this.ui.modalOpen) this.ui.close();
    this.photo = !this.photo;
    this.fastForward = false;
    document.body.classList.toggle('photo', this.photo);
    if (!this.photo) this.aim.pitch = clamp(this.aim.pitch, -0.5, 0.2);
  }

  photoCaption() {
    const w = this.water;
    return `${w.name} · ${this.spot.name} · Day ${dayOf(this.world)} ${clockLabel(this.world)} · ${WEATHER[this.world.weather].label}`;
  }

  // The capture happens at the end of the next rendered frame, while the canvas still holds it.
  snapPhoto(title = null, caption = this.photoCaption()) {
    this.snap = { title, caption };
  }

  takeSnap() {
    if (!this.snap) return;
    const { title, caption } = this.snap;
    this.snap = null;
    const src = this.app.graphicsDevice.canvas;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const s = out.height / 720;
    const grd = ctx.createLinearGradient(0, out.height * 0.7, 0, out.height);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, out.height * 0.7, out.width, out.height * 0.3);
    ctx.fillStyle = '#f5c542';
    ctx.font = `900 ${26 * s}px system-ui, sans-serif`;
    ctx.fillText('MEMEFISHING', 24 * s, out.height - (title ? 92 : 58) * s);
    ctx.fillStyle = '#ffffff';
    if (title) {
      ctx.font = `800 ${30 * s}px system-ui, sans-serif`;
      ctx.fillText(title, 24 * s, out.height - 52 * s);
    }
    ctx.font = `500 ${17 * s}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(caption, 24 * s, out.height - 22 * s);
    this.lastPhoto = out.toDataURL('image/png');
    this.sound.cash();
    this.ui.showPhoto(this.lastPhoto, title || this.water.name);
  }

  // ---------- menu actions ----------
  action(name, data) {
    const p = this.profile;
    switch (name) {
      case 'tab':
        this.ui.tab = data.tab;
        break;
      case 'buy': {
        const item = ALL_GEAR.find((g) => g.id === data.id);
        if (buy(p, item)) {
          this.sound.cash();
          if (item.slot === 'line' || item.slot === 'reel') this.resetDrag();
        }
        break;
      }
      case 'equip':
        p.loadout[data.slot] = data.id;
        if (data.slot === 'line' || data.slot === 'reel') this.resetDrag();
        this.reelIn();
        break;
      case 'repair': {
        const rod = this.gear.rod;
        p.wallet -= Math.min(p.wallet, repairCost(rod));
        p.brokenRod = null;
        this.sound.cash();
        break;
      }
      case 'float-depth':
        this.setFloatDepth(Number(data.value));
        break;
      case 'sell':
        this.sell([Number(data.index)]);
        break;
      case 'sell-all':
        this.sell(p.bag.map((_, i) => i));
        break;
      case 'travel':
        this.travelTo(data.id);
        return;
      case 'bridge':
        this.bridgeTo(data.id);
        return;
      case 'rest':
        this.restUntil(Number(data.hour));
        break;
      case 'derby-enter': {
        const d = upcomingDerbies(p.water, this.world.minute).find((x) => x.id === data.id);
        if (d && register(p, d)) {
          this.sound.cash();
          this.ui.notice(`Registered for the ${this.water.name} derby. Fee ${d.fee} REEL.`, 'good');
        }
        break;
      }
      case 'trophy-photo': {
        const info = this.catchInfo;
        this.ui.hideCatch();
        this.snapPhoto(`${info.species.name} · ${info.weight.toFixed(2)} kg${info.trophy ? ` · ${info.trophy}` : ''}`, `$${info.species.ticker} · ${info.length} cm · ${this.photoCaption()}`);
        return;
      }
      case 'keep':
      case 'release':
      case 'dump':
        this.finishCatch(name);
        return;
      default:
        return;
    }
    this.save();
    this.ui.render();
    this.ui.hud();
  }

  sell(indices) {
    const p = this.profile;
    let total = 0;
    const changes = [];
    for (const i of [...indices].sort((a, b) => b - a)) {
      const f = p.bag[i];
      if (!f) continue;
      total += f.weight * quote(this.market, f.species);
      changes.push(changeOf(this.market, f.species));
      p.bag.splice(i, 1);
      p.stats.sold += 1;
    }
    total = Math.round(total);
    p.wallet += total;
    p.stats.earned += total;
    if (total > 0) {
      this.sound.cash();
      this.ui.toast(`+${total} REEL`, 'good');
      this.missionsDone(missionSell(p, { water: p.water, total, changes }));
    }
  }

  missionsDone(done) {
    for (const m of done) {
      this.ui.notice(`Mission complete: ${m.text}. +${m.reward.meme} REEL, +${m.reward.xp} XP`, 'good');
      this.sound.landed();
    }
    if (done.length) ensureMissions(this.profile, this.profile.water, this.rng);
  }

  travelTo(id) {
    if (!travel(this.profile, id)) return;
    this.ui.close();
    this.reelIn();
    this.ui.fade(true);
    setTimeout(() => {
      this.advanceMinutes(20);
      this.aim.yaw = 0;
      this.placeCamera(0);
      this.ui.fade(false);
      this.ui.toast(this.spot.name);
    }, 450);
    this.save();
  }

  // Moving to another water: pay the gas, rebuild the world.
  bridgeTo(id) {
    const gas = waterById(id).gas;
    if (!bridge(this.profile, id)) return;
    this.ui.close();
    this.reelIn();
    this.ui.fade(true);
    this.save();
    setTimeout(() => {
      this.loadWater();
      this.advanceMinutes(30);
      this.ui.fade(false);
      this.ui.toast(this.water.name);
      this.ui.notice(gas ? `Bridged to ${this.water.name}. Gas: ${gas} REEL` : `Back home on ${this.water.name}`, 'good');
    }, 450);
  }

  restUntil(hour) {
    const now = hourOf(this.world);
    let delta = hour - now;
    if (delta <= 0.05) delta += 24;
    this.reelIn();
    this.ui.fade(true);
    setTimeout(() => {
      this.advanceMinutes(Math.round(delta * 60));
      this.ui.fade(false);
      this.ui.render();
    }, 450);
  }

  // One game minute of the world: weather, market, live events and derbies.
  tickMinute(quiet = false) {
    stepWorld(this.world, 1);
    stepMarket(this.market, 1);
    const started = stepEvents(this.events, { rng: this.rng, minute: this.world.minute, water: this.water, spot: this.profile.spot, world: this.world, market: this.market });
    if (!quiet) {
      for (const e of started) {
        this.ui.notice(e.text, e.tone);
        if (e.kind === 'boils') this.sound.bite();
      }
    }
    const d = this.profile.derby;
    if (d && !d.settled) {
      stepDerby(d, this.world.minute, this.rng);
      const res = settleDerby(this.profile, this.world.minute);
      if (res) {
        const place = ['1st', '2nd', '3rd'][res.rank - 1] || `${res.rank}th`;
        this.ui.notice(res.prize ? `Derby over: you placed ${place} and won ${res.prize} REEL (+${res.xp} XP)` : `Derby over: you placed ${place}. ${res.xp ? `+${res.xp} XP` : 'Better luck next time.'}`, res.prize ? 'good' : 'bad');
        if (res.prize) this.sound.cash();
        this.save();
      }
    }
  }

  advanceMinutes(minutes) {
    for (let i = 0; i < minutes; i += 1) this.tickMinute(true);
    this.updateEnvironment(true);
    for (const h of hotspots(this.events, this.water.id)) this.ui.notice(h.text, h.tone);
  }

  updateEnvironment(force = false) {
    const m = Math.floor(this.world.minute);
    if (!force && m === this.envMinute) return;
    this.envMinute = m;
    this.scene.setEnvironment(hourOf(this.world), this.world.weather);
    this.renderer.setGrade(this.scene.grade);
  }

  // Graphics quality: post effects, anti-aliasing, mirror reflections on the water, shadow detail.
  applyQuality(level) {
    this.renderer.set(level);
    const q = this.renderer.q;
    this.scene.waterSurface.setPlanar(q.reflection === 'planar');
    this.scene.sunLight.light.shadowResolution = q.shadowRes;
    const button = document.getElementById('quality-button');
    if (button) button.textContent = `Graphics: ${q.label}`;
  }

  // ---------- fishing loop ----------
  reelIn() {
    this.lure.active = false;
    this.lure.flight = null;
    this.floatModel.entity.enabled = false;
    this.lureModel.entity.enabled = false;
    this.hideFish();
    this.bite = null;
    this.fight = null;
    this.state = this.state === 'title' ? 'title' : 'idle';
    this.ui.showFight(false);
  }

  hideFish() {
    if (this.fish?.model) this.fish.model.enabled = false;
    this.fish = null;
  }

  castYaw() {
    return this.pose.yaw + this.aim.yaw;
  }

  startCast() {
    const { rod, lure } = this.gear;
    const pose = this.pose;
    const reach = rod.cast * (lure.kind === 'bottom' ? 0.85 : 1) * (0.25 + 0.75 * this.castPower) + 3;
    const land = castLanding(this.water, pose, this.castYaw(), reach);
    const tip = this.rod.tipPosition().clone();
    this.lure.dir = forward(land.yaw);
    this.lure.flight = { t: 0, dur: 0.45 + land.dist / 28, from: tip, to: new pc.Vec3(land.x, 0, land.z) };
    this.lure.dist = land.dist;
    this.lure.x = land.x;
    this.lure.z = land.z;
    this.lure.active = true;
    this.lure.depth = 0;
    this.lure.settled = 0;
    this.whip = 1;
    this.state = 'flying';
    this.sound.cast();
    const model = lure.kind === 'float' ? this.floatModel : this.lureModel;
    model.entity.enabled = true;
  }

  lureWorld() {
    return new pc.Vec3(this.lure.x, -this.lure.depth, this.lure.z);
  }

  updateIdle(dt) {
    const g = this.gear;
    if (this.rodBroken) {
      this.ui.prompt('Your rod is broken. Repair it in Tackle (T).');
      return;
    }
    if (this.state === 'idle') {
      this.ui.prompt(`Hold to cast · ${g.lure.name}`);
      if (this.input.primaryEdge) {
        this.state = 'charging';
        this.castPower = 0;
        this.chargeDir = 1;
      }
    }
    if (this.state === 'charging') {
      this.castPower += this.chargeDir * dt * 0.9;
      if (this.castPower >= 1) {
        this.castPower = 1;
        this.chargeDir = -1;
      } else if (this.castPower <= 0.05) {
        this.chargeDir = 1;
      }
      this.ui.castMeter(this.castPower);
      this.ui.prompt('Release to cast');
      if (!this.input.primary) {
        this.ui.castMeter(null);
        this.startCast();
      }
    }
  }

  updateFlight(dt) {
    const f = this.lure.flight;
    f.t += dt;
    const t = Math.min(1, f.t / f.dur);
    const p = new pc.Vec3().lerp(f.from, f.to, t);
    p.y += Math.sin(t * Math.PI) * (2 + f.from.distance(f.to) * 0.18);
    const model = this.gear.lure.kind === 'float' ? this.floatModel : this.lureModel;
    model.entity.setPosition(p);
    this.flightPos = p;
    this.ui.prompt('');
    if (t >= 1) {
      this.lure.flight = null;
      this.effects.splash(f.to, this.gear.lure.kind === 'bottom' ? 0.8 : 0.4);
      this.sound.plop(this.gear.lure.kind === 'bottom' ? 1.3 : 0.7);
      this.state = 'waiting';
    }
  }

  updateWaiting(dt) {
    const { lure, line } = this.gear;
    const L = this.lure;
    const pose = this.pose;
    const shape = this.water.shape;
    let retrieving = this.input.primary ? this.reelSpeed : 0;
    if (this.input.secondaryEdge && lure.kind === 'lure') {
      L.hop = 0.35;
      L.depth = Math.max(0, L.depth - 0.4);
      this.effects.ripple(new pc.Vec3(L.x, 0, L.z), 0.3);
    }
    if (L.hop > 0) {
      L.hop -= dt;
      retrieving = Math.max(retrieving, lure.idealSpeed || 0);
    }
    if (this.input.primary) {
      const dx = pose.x - L.x;
      const dz = pose.z - L.z;
      const d = Math.hypot(dx, dz) || 1;
      const step = Math.min(d, this.reelSpeed * dt * (lure.kind === 'bottom' ? 0.7 : 1));
      L.x += (dx / d) * step;
      L.z += (dz / d) * step;
    }
    // On the river the current carries floats downstream; sinkers mostly hold.
    if (shape.kind === 'river') {
      const fl = shape.flow(L.x, L.z);
      const k = lure.kind === 'float' ? 1 : lure.kind === 'bottom' ? 0.04 : 0.45;
      L.x += fl.x * fl.speed * k * dt;
      L.z += fl.z * fl.speed * k * dt;
    }
    L.dist = Math.hypot(L.x - pose.x, L.z - pose.z);
    if (L.dist > 0.01) L.dir = { x: (L.x - pose.x) / L.dist, z: (L.z - pose.z) / L.dist };
    const bottom = shape.depthAt(L.x, L.z);
    L.depth = stepLureDepth(lure, L.depth, bottom, retrieving, this.profile.floatDepth, dt);
    L.settled += dt;
    L.retrieving = retrieving;

    if (L.dist < 2.5 || bottom < 0.12) {
      this.reelIn();
      this.ui.prompt('');
      return;
    }
    if (L.dist > 80) {
      this.reelIn();
      this.ui.toast('Drifted too far. Reeled in.', 'bad');
      return;
    }

    const kindHint = lure.kind === 'float' ? (shape.kind === 'river' ? 'Let it drift, watch the float' : 'Watch the float') : lure.kind === 'bottom' ? 'Watch the rod tip' : 'Hold to retrieve, right click to hop, pause to sink';
    this.ui.prompt(`${kindHint} · ${L.dist.toFixed(0)} m`);

    const canBite = lure.kind === 'lure' ? true : L.settled > 2.5;
    if (canBite) {
      const rates = biteRates({
        spot: this.spot,
        lure,
        line,
        depth: L.depth,
        retrieving,
        hour: hourOf(this.world),
        weather: this.world.weather,
        sentimentBite: SENTIMENT[this.market.sentiment].bite,
        eventMult: (id) => eventMultiplier(this.events, id, L.x, L.z)
      });
      const species = rollBite(this.rng, rates, dt * (this.fastForward ? 20 : 1));
      if (species) {
        this.fastForward = false;
        this.bite = createBite(this.rng, species, lure);
        this.bite.held = 0;
        this.bite.lastNibble = -1;
        this.state = 'bite';
        if (lure.kind === 'lure') this.sound.bite();
      }
    }
  }

  updateBite(dt) {
    const { lure } = this.gear;
    const b = stepBite(this.bite, dt);
    const cue = biteCue(b);
    if (cue === 'nibble') {
      const n = Math.floor(b.t / 0.45);
      if (n !== b.lastNibble) {
        b.lastNibble = n;
        this.sound.nibble();
        this.effects.ripple(new pc.Vec3(this.lure.x, 0, this.lure.z), 0.2);
      }
      this.ui.prompt(lure.kind === 'float' ? 'Nibble… wait for it' : 'Something is tapping…');
    } else {
      if (!b.tookOnce) {
        b.tookOnce = true;
        this.sound.bite();
        this.effects.ripple(new pc.Vec3(this.lure.x, 0, this.lure.z), 0.6);
      }
      this.ui.prompt('STRIKE!', true);
    }
    // Moving lures often hook the fish by themselves if you keep reeling through the take.
    if (lure.kind === 'lure' && cue === 'take' && this.input.primary) b.held += dt;
    const selfHook = b.held > 0.35;
    if (this.input.secondaryEdge || selfHook) {
      const result = selfHook && !this.input.secondaryEdge ? { hooked: this.rng() < 0.55, quality: 0.55 } : strike(this.rng, b);
      this.sound.strike();
      if (result.hooked) this.startFight(b.species, result.quality);
      else this.missBite(result.early ? 'Too early! It spooked.' : 'Missed it.');
      return;
    }
    if (b.done) this.missBite(lure.kind === 'float' || lure.kind === 'bottom' ? 'It stole the bait.' : 'It let go.');
  }

  missBite(text) {
    this.ui.toast(text, 'bad');
    this.bite = null;
    this.state = 'waiting';
    this.lure.settled = 0;
  }

  startFight(species, quality) {
    const { rod, reel, line } = this.gear;
    const weight = rollWeight(this.rng, species);
    const pose = this.pose;
    const dir = this.lure.dir;
    const shape = this.water.shape;
    const bottomAt = (dist, angle) => {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const dx = dir.x * c - dir.z * s;
      const dz = dir.x * s + dir.z * c;
      return shape.depthAt(pose.x + dx * dist, pose.z + dz * dist);
    };
    const current = shape.flow(this.lure.x, this.lure.z).speed;
    this.fight = createFight(this.rng, { species, weight, rod, reel, line, distance: this.lure.dist, depth: Math.max(0.3, this.lure.depth), bottomAt, hookQuality: quality, current });
    this.fish = { species, weight, model: this.fishModels[species.id], jumpT: 0 };
    const len = lengthCm(species, weight) / 100;
    this.fish.length = len;
    const scale = (len * 1.05) / (species.model?.length || 1);
    this.fish.model.setLocalScale(scale, scale, scale);
    this.floatModel.entity.enabled = false;
    this.lureModel.entity.enabled = false;
    this.bite = null;
    this.state = 'fight';
    this.ui.showFight(true);
    this.ui.prompt('');
  }

  fishWorld() {
    const f = this.fight;
    const c = Math.cos(f.fishAngle);
    const s = Math.sin(f.fishAngle);
    const d = this.lure.dir;
    const dx = d.x * c - d.z * s;
    const dz = d.x * s + d.z * c;
    return { pos: new pc.Vec3(this.pose.x + dx * f.fishDist, -f.fishDepth, this.pose.z + dz * f.fishDist), dx, dz };
  }

  updateFight(dt) {
    const f = this.fight;
    stepFight(f, { reeling: this.input.primary, reelSpeed: this.reelSpeed, lift: this.input.secondary, drag: this.drag }, dt);
    const readout = fightReadout(f);
    this.ui.fight(readout, f, this.drag);
    this.sound.drag(f.dragSlipping, Math.abs(f.fishVel));

    const { pos, dx, dz } = this.fishWorld();
    const model = this.fish.model;
    if (f.events.includes('jump')) {
      this.fish.jumpT = 0.9;
      this.effects.splash(pos, 1 + this.fish.weight * 0.1);
      this.sound.plop(1.4);
    }
    if (this.fish.jumpT > 0) {
      this.fish.jumpT -= dt;
      const t = 1 - this.fish.jumpT / 0.9;
      pos.y = Math.sin(t * Math.PI) * (0.5 + Math.min(1, this.fish.weight * 0.15));
      if (this.fish.jumpT <= 0) this.effects.splash(pos, 0.8);
    }
    model.enabled = pos.y > -1.4;
    model.setPosition(pos);
    const away = f.fishVel >= 0 ? 1 : -1;
    model.lookAt(pos.x + dx * away, pos.y + (this.fish.jumpT > 0 ? 0.6 : 0), pos.z + dz * away);
    model.rotateLocal(0, 180, Math.sin(performance.now() / 90) * 8);
    swimFish(model, performance.now() / 1000, 1.4);
    if (f.events.includes('shake') && pos.y > -0.8) this.effects.ripple(pos, 0.5);
    if (f.fishDepth < 0.5 && Math.random() < dt * 3) this.effects.ripple(pos, 0.3);
    this.fishPos = pos;

    if (f.result) this.endFight(f.result);
  }

  endFight(result) {
    this.sound.drag(false, 0);
    this.ui.showFight(false);
    if (result === 'landed') {
      this.state = 'catch';
      this.sound.landed();
      const { species, weight } = this.fish;
      this.catchInfo = {
        species,
        weight,
        length: lengthCm(species, weight),
        trophy: trophyRank(species, weight),
        price: quote(this.market, species.id),
        xpKeep: catchXp(species, weight, false),
        xpRelease: catchXp(species, weight, true),
        bagFull: this.profile.bag.length >= BAG_SIZE
      };
      recordCatch(this.profile, species, weight);
      if (derbyCatch(this.profile.derby, this.world.minute, this.profile.water, weight)) this.ui.notice(`Derby weigh-in: ${species.name} ${weight.toFixed(2)} kg`, 'good');
      this.save();
      this.ui.catchCard(this.catchInfo);
      this.input.primary = false;
      this.input.secondary = false;
      this.fish.model.enabled = true;
      return;
    }
    if (result === 'snapped') this.sound.snap();
    if (result === 'rod') {
      this.sound.snap();
      this.profile.brokenRod = this.profile.loadout.rod;
      this.save();
    }
    this.ui.toast(RESULT_TEXT[result], 'bad');
    this.reelIn();
  }

  // Hold the catch up in front of the camera for the card (and the trophy photo).
  holdFish() {
    const cam = this.camera.getPosition();
    const fwd = this.camera.forward;
    const right = this.camera.right;
    const dist = Math.max(0.75, this.fish.length * 1.15);
    const pos = cam.clone().add(fwd.clone().mulScalar(dist)).add(new pc.Vec3(0, -0.08 - this.fish.length * 0.08, 0));
    const m = this.fish.model;
    m.setPosition(pos);
    m.lookAt(pos.clone().add(right));
    m.rotateLocal(Math.sin(performance.now() / 700) * 4, 0, 8 + Math.sin(performance.now() / 160) * 3);
    swimFish(m, performance.now() / 1000, 0.4);
  }

  finishCatch(choice) {
    const info = this.catchInfo;
    const p = this.profile;
    const levelBefore = levelOf(p.xp);
    if (choice === 'keep') {
      p.bag.push({ species: info.species.id, weight: info.weight, value: Math.round(info.weight * info.price) });
      p.xp += info.xpKeep;
    } else if (choice === 'dump') {
      const cash = Math.round(info.weight * quote(this.market, info.species.id) * 0.8);
      p.wallet += cash;
      p.stats.sold += 1;
      p.stats.earned += cash;
      p.xp += info.xpKeep;
      this.sound.cash();
    } else {
      p.xp += info.xpRelease;
      p.stats.released += 1;
      this.effects.splash(new pc.Vec3(this.pose.x + this.lure.dir.x * 2.5, 0, this.pose.z + this.lure.dir.z * 2.5), 0.5);
    }
    this.missionsDone(
      missionCatch(p, {
        water: p.water,
        species: info.species.id,
        weight: info.weight,
        lure: p.loadout.lure,
        hour: hourOf(this.world),
        released: choice === 'release',
        trophy: !!info.trophy
      })
    );
    if (choice === 'dump') this.missionsDone(missionSell(p, { water: p.water, total: Math.round(info.weight * quote(this.market, info.species.id) * 0.8), changes: [changeOf(this.market, info.species.id)] }));
    const levelAfter = levelOf(p.xp);
    this.save();
    this.ui.hideCatch();
    this.catchInfo = null;
    this.reelIn();
    if (levelAfter > levelBefore) {
      this.sound.landed();
      this.ui.toast(`Level ${levelAfter}! New gear and waters`, 'good');
    }
  }

  // ---------- per frame ----------
  placeCamera(dt) {
    const pose = this.pose;
    this.aim.yaw = clamp(this.aim.yaw + this.aim.keys * dt * 0.9, this.photo ? -2.6 : -1, this.photo ? 2.6 : 1);
    let yaw = pose.yaw + this.aim.yaw;
    if (this.state === 'fight' && this.fishPos) {
      const toFish = Math.atan2(-(this.fishPos.x - pose.x), -(this.fishPos.z - pose.z));
      yaw += wrapAngle(toFish - yaw) * 0.6;
    }
    this.camYaw = this.camYaw === undefined || dt === 0 ? yaw : this.camYaw + wrapAngle(yaw - this.camYaw) * Math.min(1, dt * 6);
    this.camera.setPosition(pose.x, pose.eye, pose.z);
    this.camera.setEulerAngles((this.aim.pitch * 180) / Math.PI, (this.camYaw * 180) / Math.PI, 0);
  }

  update(rawDt) {
    const dt = Math.min(rawDt, 0.05);
    const paused = this.state === 'title' || this.ui.modalOpen;

    if (!paused && this.state !== 'catch') {
      const speed = this.fastForward && (this.state === 'idle' || this.state === 'waiting') ? 20 : 1;
      if (this.state !== 'idle' && this.state !== 'waiting') this.fastForward = false;
      this.minuteAcc += dt * speed;
      while (this.minuteAcc >= 1) {
        this.minuteAcc -= 1;
        this.tickMinute();
      }
      this.updateEnvironment();

      if (!this.photo) {
        switch (this.state) {
          case 'idle':
          case 'charging':
            this.updateIdle(dt);
            break;
          case 'flying':
            this.updateFlight(dt);
            break;
          case 'waiting':
            this.updateWaiting(dt);
            break;
          case 'bite':
            this.updateBite(dt);
            break;
          case 'fight':
            this.updateFight(dt);
            break;
          default:
            break;
        }
      }
    }
    this.consumeEdges();

    this.placeCamera(dt);
    if (this.state === 'catch' && this.fish) this.holdFish();
    const cam = this.camera.getPosition();
    const hour = hourOf(this.world);
    const light = daylight(hour);
    this.scene.update(dt, cam);
    this.life.update(dt, {
      cam,
      yaw: this.camYaw,
      light,
      hour,
      hotspots: hotspots(this.events, this.water.id),
      twilight: Math.max(Math.exp(-(((hour - 6.5) / 1.5) ** 2)), Math.exp(-(((hour - 19.5) / 1.5) ** 2)))
    });
    this.updateRig(dt);
    this.effects.update(dt);
    this.drawLine();
    this.sound.reel(dt, (this.state === 'waiting' || this.state === 'fight') && this.input.primary && !this.fight?.reelStall ? this.reelGear / 5 : 0);
    const w = WEATHER[this.world.weather];
    this.sound.ambience(dt, {
      day: light,
      rain: w.precip === 'rain',
      storm: !!w.lightning,
      river: this.water.shape.kind === 'river',
      frogs: this.water.life.frogs || 0,
      birds: !!this.water.life.birds
    });

    this.hudTimer -= rawDt;
    if (this.hudTimer <= 0 && this.state !== 'title') {
      this.hudTimer = 0.2;
      this.ui.hud();
      this.ui.sonar(this.hasFinder && this.finderOn ? this.sonarReading() : null);
      if (this.ui.panel === 'market' && this.market.minutes % 10 === 0) this.ui.render();
    }
  }

  sonarReading() {
    const reach = Math.max(30, Math.min(60, this.gear.rod.cast));
    return {
      ...sonar({
        water: this.water,
        spot: this.spot,
        pose: this.pose,
        yaw: this.lure.active ? Math.atan2(-this.lure.dir.x, -this.lure.dir.z) : this.castYaw(),
        hour: hourOf(this.world),
        weather: this.world.weather,
        events: this.events,
        minute: this.world.minute,
        reach
      }),
      lure: this.lure.active && !this.lure.flight ? { dist: this.lure.dist, depth: this.lure.depth } : null,
      temp: this.water.tempBase + 2 * Math.sin(((hourOf(this.world) - 11) / 24) * Math.PI * 2)
    };
  }

  updateRig(dt) {
    let load = 0;
    let side = 0;
    let lift = 0;
    let twitch = 0;
    if (this.state === 'fight' && this.fight) {
      const r = fightReadout(this.fight);
      load = Math.min(1.2, r.rodLoad * 1.4 + 0.08);
      lift = this.fight.rodPos;
      side = clamp(this.fight.fishAngle - this.aim.yaw * 0.4, -1, 1);
    } else if (this.state === 'waiting') {
      load = this.input.primary ? 0.06 + (this.gear.lure.kind === 'lure' ? 0.08 : 0) : 0.02;
    } else if (this.state === 'bite') {
      twitch = biteCue(this.bite) === 'take' ? 0.04 : 0.015;
      load = 0.1;
    } else if (this.state === 'charging') {
      lift = this.castPower * 0.6;
    } else if (this.state === 'catch') {
      lift = 0.5;
    }
    this.whip = Math.max(0, this.whip - dt * 3.5);
    const whipCurve = this.whip > 0.7 ? -(1 - this.whip) * 2 : this.whip * 0.5;
    this.rod.update(dt, { load, side, lift, reeling: this.input.primary && this.state !== 'idle' ? this.reelGear : 0, whip: this.state === 'charging' ? -this.castPower * 0.4 : whipCurve, twitch });

    // Float and lure follow the water.
    const L = this.lure;
    const kind = this.gear.lure.kind;
    if (L.active && !L.flight && this.state !== 'fight' && this.state !== 'catch') {
      const wave = this.scene.waveHeight(L.x, L.z, this.scene.time);
      if (kind === 'float') {
        let y = wave + 0.02 + Math.sin(this.scene.time * 2.1) * 0.01;
        if (this.state === 'bite') {
          y += biteCue(this.bite) === 'take' ? -0.32 : -Math.abs(Math.sin(this.bite.t * 14)) * 0.05;
        }
        this.floatModel.entity.setPosition(L.x, y, L.z);
      } else {
        this.lureModel.entity.enabled = L.depth < 0.6;
        this.lureModel.entity.setPosition(L.x, Math.max(-L.depth, wave - 0.03), L.z);
        this.lureModel.entity.setEulerAngles(0, (Math.atan2(-L.dir.x, -L.dir.z) * 180) / Math.PI, 0);
      }
    }
  }

  drawLine() {
    const tip = this.rod.tipPosition();
    let end;
    let sag = 0;
    let under = null;
    const L = this.lure;
    if (this.state === 'flying' && this.flightPos) {
      end = this.flightPos;
      sag = 0.2;
    } else if (this.state === 'fight' && this.fishPos) {
      const r = fightReadout(this.fight);
      under = this.fishPos;
      end = new pc.Vec3(this.fishPos.x, Math.max(0, this.fishPos.y), this.fishPos.z);
      sag = Math.max(0, 1 - r.tensionFrac * 4) * (0.15 + r.distance * 0.02);
    } else if (this.state === 'catch' && this.fish) {
      end = this.fish.model.getPosition();
      sag = 0.05;
    } else if (L.active && (this.state === 'waiting' || this.state === 'bite')) {
      const kind = this.gear.lure.kind;
      const top = kind === 'float' ? this.floatModel.entity.getPosition() : new pc.Vec3(L.x, 0, L.z);
      end = top;
      if (kind !== 'float' && L.depth > 0.05) under = this.lureWorld();
      sag = this.input.primary ? 0.05 : 0.25 + L.dist * 0.012;
    } else {
      // Lure hangs below the rod tip.
      end = new pc.Vec3(tip.x, tip.y - 0.5, tip.z);
    }
    const pts = [];
    const n = 18;
    let prev = tip.clone();
    for (let i = 1; i <= n; i += 1) {
      const t = i / n;
      const p = new pc.Vec3().lerp(tip, end, t);
      p.y -= sag * 4 * t * (1 - t);
      if (end.y >= -0.01) p.y = Math.max(p.y, end.y * t);
      pts.push(prev, p);
      prev = p;
    }
    if (under) pts.push(end, under);
    const color = LINE_COLORS[this.profile.loadout.line] || LINE_COLORS['line-mono6'];
    this.app.drawLines(pts, color, true);
  }
}

window.game = new Game(document.getElementById('application'));
