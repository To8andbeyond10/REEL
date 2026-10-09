import * as pc from 'playcanvas';
import { createFight, pickFish, stepFight } from './fishing.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;

class ReelGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.elapsed = 0;
    this.menu = true;
    this.paused = false;
    this.reelHeld = false;
    this.resultCooldown = 0;
    this.castDuration = 0.75;
    this.bobberStart = new pc.Vec3(-4.1, -0.5, 0);
    this.bobberTarget = new pc.Vec3(2.7, -1.2, 0);
    this.fishBase = new pc.Vec3(2.7, -2.2, 0);
    this.storageKey = 'reel-save-v1';
    this.save = this.loadSave();

    this.createApp();
    this.createScene();
    this.cacheDom();
    this.bindDom();
    this.bindFocusLoss();
    this.bindResize();
    this.resetSession();
    this.showMenu();
    this.app.on('update', (dt) => this.update(dt));
  }

  createApp() {
    this.app = new pc.Application(this.canvas, {
      mouse: new pc.Mouse(this.canvas),
      touch: pc.platform.touch ? new pc.TouchDevice(this.canvas) : undefined
    });

    this.app.start();
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.scene.ambientLight = new pc.Color(0.72, 0.78, 0.92);
    this.app.scene.gammaCorrection = pc.GAMMA_SRGB;
    this.app.scene.toneMapping = pc.TONEMAP_ACES;
  }

  createScene() {
    const camera = new pc.Entity('camera');
    camera.addComponent('camera', {
      clearColor: new pc.Color(0.42, 0.78, 1),
      projection: pc.PROJECTION_ORTHOGRAPHIC,
      orthoHeight: 5
    });
    camera.setLocalPosition(0, 0, 10);
    this.app.root.addChild(camera);
    this.camera = camera;

    const light = new pc.Entity('light');
    light.addComponent('light', {
      type: 'directional',
      intensity: 1.45,
      castShadows: false
    });
    light.setEulerAngles(35, -55, 0);
    this.app.root.addChild(light);

    this.water = this.createBox('water', new pc.Color(0.1, 0.42, 0.82), new pc.Vec3(8.5, 4.9, 0.2), new pc.Vec3(1.4, -1.7, -0.2));
    this.bank = this.createBox('bank', new pc.Color(0.38, 0.3, 0.18), new pc.Vec3(3.8, 5.6, 0.3), new pc.Vec3(-5.2, -0.3, 0));
    this.rod = this.createCapsuleLikeRod();
    this.bobber = this.createSphere('bobber', new pc.Color(1, 0.97, 0.95), 0.23, this.bobberStart.clone());
    this.bobberTip = this.createSphere('bobber-tip', new pc.Color(1, 0.32, 0.32), 0.12, this.bobberStart.clone().add(new pc.Vec3(0, 0.15, 0.1)));
    this.fish = this.createConeFish();
    this.line = this.createLine();
    this.sun = this.createSphere('sun', new pc.Color(1, 0.92, 0.4), 0.48, new pc.Vec3(-1.1, 3.25, -1));
  }

  createMaterial(color, opacity = 1) {
    const material = new pc.StandardMaterial();
    material.diffuse = color.clone();
    material.emissive = color.clone().mulScalar(0.08);
    material.opacity = opacity;
    if (opacity < 1) {
      material.blendType = pc.BLEND_NORMAL;
    }
    material.update();
    return material;
  }

  createBox(name, color, scale, position) {
    const entity = new pc.Entity(name);
    entity.addComponent('render', {
      type: 'box',
      material: this.createMaterial(color)
    });
    entity.setLocalScale(scale);
    entity.setLocalPosition(position);
    this.app.root.addChild(entity);
    return entity;
  }

  createSphere(name, color, radius, position) {
    const entity = new pc.Entity(name);
    entity.addComponent('render', {
      type: 'sphere',
      material: this.createMaterial(color)
    });
    entity.setLocalScale(radius, radius, radius);
    entity.setLocalPosition(position);
    this.app.root.addChild(entity);
    return entity;
  }

  createCapsuleLikeRod() {
    const entity = new pc.Entity('rod');
    entity.addComponent('render', {
      type: 'cylinder',
      material: this.createMaterial(new pc.Color(0.18, 0.12, 0.08))
    });
    entity.setLocalScale(0.12, 2.6, 0.12);
    entity.setLocalEulerAngles(0, 0, 32);
    entity.setLocalPosition(-4.55, 0.75, 0.05);
    this.app.root.addChild(entity);

    const reel = new pc.Entity('reel');
    reel.addComponent('render', {
      type: 'sphere',
      material: this.createMaterial(new pc.Color(0.92, 0.86, 0.55))
    });
    reel.setLocalScale(0.3, 0.3, 0.2);
    reel.setLocalPosition(-4.05, -0.35, 0.18);
    this.app.root.addChild(reel);
    return entity;
  }

  createConeFish() {
    const entity = new pc.Entity('fish');
    entity.addComponent('render', {
      type: 'cone',
      material: this.createMaterial(new pc.Color(0.05, 0.16, 0.32), 0.85)
    });
    entity.setLocalScale(0.55, 0.95, 0.35);
    entity.setLocalEulerAngles(90, 0, 90);
    entity.setLocalPosition(this.fishBase);
    entity.enabled = false;
    this.app.root.addChild(entity);
    return entity;
  }

  createLine() {
    const entity = new pc.Entity('line');
    entity.addComponent('render', {
      type: 'box',
      material: this.createMaterial(new pc.Color(0.96, 0.98, 1), 0.95)
    });
    this.app.root.addChild(entity);
    return entity;
  }

  cacheDom() {
    this.ui = {
      start: document.getElementById('start-button'),
      cast: document.getElementById('cast-button'),
      hook: document.getElementById('hook-button'),
      reel: document.getElementById('reel-button'),
      pause: document.getElementById('pause-button'),
      resume: document.getElementById('resume-button'),
      replay: document.getElementById('replay-button'),
      pauseOverlay: document.getElementById('pause-overlay'),
      gameoverOverlay: document.getElementById('gameover-overlay'),
      messageTitle: document.getElementById('message-title'),
      messageBody: document.getElementById('message-body'),
      sessionTimer: document.getElementById('session-timer'),
      score: document.getElementById('score'),
      coins: document.getElementById('coins'),
      bestScore: document.getElementById('best-score'),
      stateLabel: document.getElementById('state-label'),
      fishLabel: document.getElementById('fish-label'),
      streakLabel: document.getElementById('streak-label'),
      progressBar: document.getElementById('progress-bar'),
      progressValue: document.getElementById('progress-value'),
      tensionBar: document.getElementById('tension-bar'),
      tensionValue: document.getElementById('tension-value'),
      tensionMeter: document.getElementById('tension-bar').parentElement,
      gameoverSummary: document.getElementById('gameover-summary')
    };
  }

  bindDom() {
    this.ui.start.addEventListener('click', () => this.startSession());
    this.ui.cast.addEventListener('click', () => this.castLine());
    this.ui.hook.addEventListener('click', () => this.hookFish());
    this.ui.pause.addEventListener('click', () => this.togglePause());
    this.ui.resume.addEventListener('click', () => this.togglePause(false));
    this.ui.replay.addEventListener('click', () => this.startSession());

    const startReel = (event) => {
      event.preventDefault();
      if (this.state === 'reeling') {
        this.reelHeld = true;
      }
    };

    const stopReel = () => {
      this.reelHeld = false;
    };

    this.ui.reel.addEventListener('pointerdown', startReel);
    this.ui.reel.addEventListener('pointerup', stopReel);
    this.ui.reel.addEventListener('pointerleave', stopReel);
    this.ui.reel.addEventListener('pointercancel', stopReel);

    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
      }
      // Auto-repeat from a held key must not cast, hook or toggle anything.
      if (event.repeat) {
        return;
      }
      if (event.code === 'Enter' && this.menu) {
        this.startSession();
      } else if (event.code === 'Space') {
        if (this.state === 'idle') {
          this.castLine();
        } else if (this.state === 'bite') {
          this.hookFish();
        } else if (this.state === 'reeling') {
          this.reelHeld = true;
        }
      } else if (event.key.toLowerCase() === 'p' && !this.menu && this.state !== 'gameover') {
        this.togglePause();
      }
    });

    window.addEventListener('keyup', (event) => {
      if (event.code === 'Space') {
        this.reelHeld = false;
      }
    });
  }

  bindFocusLoss() {
    // A keyup or pointerup that happens in another window never reaches us,
    // so drop the reel and pause whenever the game loses focus.
    const suspend = () => {
      this.reelHeld = false;
      this.togglePause(true);
    };
    window.addEventListener('blur', suspend);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        suspend();
      }
    });
  }

  bindResize() {
    const resize = () => this.app.resizeCanvas();
    window.addEventListener('resize', resize);
    resize();
  }

  loadSave() {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        return { totalCoins: 0, bestScore: 0 };
      }
      const parsed = JSON.parse(raw);
      return {
        totalCoins: Number.isFinite(parsed.totalCoins) ? parsed.totalCoins : 0,
        bestScore: Number.isFinite(parsed.bestScore) ? parsed.bestScore : 0
      };
    } catch {
      return { totalCoins: 0, bestScore: 0 };
    }
  }

  persistSave() {
    window.localStorage.setItem(this.storageKey, JSON.stringify(this.save));
  }

  resetSession() {
    this.state = 'menu';
    this.currentFish = null;
    this.castClock = 0;
    this.waitClock = 0;
    this.hookWindow = 0;
    this.fight = null;
    this.fishRevealed = false;
    this.tension = 0;
    this.progress = 0;
    this.score = 0;
    this.streak = 0;
    this.catches = 0;
    this.sessionCoins = 0;
    this.sessionTime = 90;
    this.resultCooldown = 0;
    this.reelHeld = false;
    this.castTargetX = this.bobberTarget.x;
    this.castTargetY = this.bobberTarget.y;
    this.bobber.setPosition(this.bobberStart);
    this.bobberTip.setPosition(this.bobberStart.clone().add(new pc.Vec3(0, 0.15, 0.1)));
    this.fish.enabled = false;
    this.refreshUi();
    this.syncLine();
  }

  showMenu() {
    this.menu = true;
    this.paused = false;
    this.ui.pauseOverlay.classList.add('hidden');
    this.ui.gameoverOverlay.classList.add('hidden');
    this.setMessage('REEL', 'Start a 90 second session. Cast, wait for the bite and hook fast. Reel while the fish rests, and let go when it twitches before a surge.');
    this.state = 'menu';
    this.refreshUi();
  }

  startSession() {
    this.menu = false;
    this.paused = false;
    this.ui.pauseOverlay.classList.add('hidden');
    this.ui.gameoverOverlay.classList.add('hidden');
    this.state = 'idle';
    this.currentFish = null;
    this.fight = null;
    this.fishRevealed = false;
    this.score = 0;
    this.streak = 0;
    this.catches = 0;
    this.sessionCoins = 0;
    this.sessionTime = 90;
    this.tension = 0;
    this.progress = 0;
    this.resultCooldown = 0;
    this.reelHeld = false;
    this.bobber.setPosition(this.bobberStart);
    this.bobberTip.setPosition(this.bobberStart.clone().add(new pc.Vec3(0, 0.15, 0.1)));
    this.fish.enabled = false;
    this.setMessage('Lines in the water', 'Press cast to send the bobber out. When a fish bites, hook immediately. Then reel while it rests and let go when it surges, or the line snaps.');
    this.refreshUi();
    this.syncLine();
  }

  togglePause(force) {
    if (this.menu || this.state === 'gameover') {
      return;
    }

    this.paused = typeof force === 'boolean' ? force : !this.paused;
    this.ui.pauseOverlay.classList.toggle('hidden', !this.paused);
    this.refreshUi();
  }

  setMessage(title, body) {
    this.ui.messageTitle.textContent = title;
    this.ui.messageBody.textContent = body;
  }

  castLine() {
    if (this.state !== 'idle' || this.paused) {
      return;
    }

    this.currentFish = pickFish();
    this.fight = null;
    this.fishRevealed = false;
    this.castClock = 0;
    this.waitClock = this.randomRange(...this.currentFish.biteDelay);
    this.hookWindow = 0;
    this.progress = 0;
    this.tension = 0;
    this.castTargetX = this.randomRange(1.6, 3.5);
    this.castTargetY = this.randomRange(-1.7, -0.75);
    this.state = 'casting';
    this.setMessage('Cast away', 'Something is down there. Watch the bobber and get ready to hook.');
    this.refreshUi();
  }

  hookFish() {
    if (this.state !== 'bite' || this.paused) {
      return;
    }

    this.state = 'reeling';
    this.reelHeld = false;
    this.fight = createFight(this.currentFish);
    this.progress = this.fight.progress;
    this.tension = this.fight.tension;
    this.setMessage('Fish on!', 'Hold reel while it rests. When the bobber twitches, let go before it surges.');
    this.refreshUi();
  }

  settleResult(title, body, scoreDelta = 0, coinDelta = 0, caught = false) {
    if (caught) {
      this.catches += 1;
      this.streak += 1;
      this.score += scoreDelta;
      this.sessionCoins += coinDelta;
      this.save.totalCoins += coinDelta;
      this.save.bestScore = Math.max(this.save.bestScore, this.score);
      this.persistSave();
    } else {
      this.streak = 0;
    }

    this.reelHeld = false;
    this.fight = null;
    this.fishRevealed = true;
    this.resultCooldown = 1.7;
    this.state = 'result';
    this.setMessage(title, body);
    this.fish.enabled = false;
    this.refreshUi();
  }

  endSession() {
    this.reelHeld = false;
    this.menu = false;
    this.state = 'gameover';
    this.save.bestScore = Math.max(this.save.bestScore, this.score);
    this.persistSave();
    this.ui.gameoverSummary.textContent = `Score ${this.score} • Catches ${this.catches} • Coins banked ${this.sessionCoins}`;
    this.ui.gameoverOverlay.classList.remove('hidden');
    this.setMessage('Session complete', 'Nice run. Cash in your haul and jump back in for another session.');
    this.refreshUi();
  }

  update(dt) {
    this.elapsed += dt;
    if (this.menu || this.paused) {
      this.animateBackdrop(dt);
      return;
    }

    this.animateBackdrop(dt);

    if (this.state !== 'gameover') {
      this.sessionTime = Math.max(0, this.sessionTime - dt);
      if (this.sessionTime === 0) {
        this.endSession();
        return;
      }
    }

    if (this.state === 'casting') {
      this.updateCasting(dt);
    } else if (this.state === 'waiting') {
      this.updateWaiting(dt);
    } else if (this.state === 'bite') {
      this.updateBite(dt);
    } else if (this.state === 'reeling') {
      this.updateReeling(dt);
    } else if (this.state === 'result') {
      this.updateResult(dt);
    }

    this.updateBobber(dt);
    this.updateFish(dt);
    this.syncLine();
    this.refreshUi();
  }

  updateCasting(dt) {
    this.castClock += dt;
    const t = clamp(this.castClock / this.castDuration, 0, 1);
    const arc = Math.sin(t * Math.PI) * 1.1;
    const x = lerp(this.bobberStart.x, this.castTargetX, t);
    const y = lerp(this.bobberStart.y, this.castTargetY, t) + arc;
    this.bobber.setPosition(x, y, 0);
    this.bobberTip.setPosition(x, y + 0.15, 0.1);
    if (t >= 1) {
      this.state = 'waiting';
      this.setMessage('Waiting...', 'Stay alert. Fish nibble fast, and the hook window is short.');
    }
  }

  updateWaiting(dt) {
    this.waitClock -= dt;
    if (this.waitClock <= 0) {
      this.state = 'bite';
      this.hookWindow = 1.85;
      this.setMessage('Bite!', 'Something is nibbling. Hit hook before it spits the lure.');
    }
  }

  updateBite(dt) {
    this.hookWindow -= dt;
    if (this.hookWindow <= 0) {
      this.settleResult('Missed the strike', `A ${this.currentFish.name} stole the bait and disappeared into the weeds.`);
    }
  }

  updateReeling(dt) {
    const fight = this.fight;
    const previousPhase = fight.phase;
    const outcome = stepFight(fight, this.reelHeld, dt);
    this.progress = fight.progress;
    this.tension = fight.tension;
    const name = this.currentFish.name;

    if (outcome === 'caught') {
      const bonus = Math.round(this.currentFish.reward * (1 + this.streak * 0.08));
      this.settleResult(
        `Caught a ${name}!`,
        `Clean catch. You banked ${bonus} meme coins and kept the streak alive.`,
        bonus,
        bonus,
        true
      );
      return;
    }

    if (outcome === 'snapped') {
      this.settleResult('Line snapped', `The ${name} surged while you were reeling. Let go when the bobber twitches.`);
      return;
    }

    if (outcome === 'escaped') {
      this.settleResult('Fish escaped', `The ${name} shook free. Keep reeling whenever it rests so it can't wear you out.`);
      return;
    }

    if (fight.phase !== previousPhase) {
      if (fight.phase === 'warn') {
        this.setMessage('It\'s about to run!', 'Let go of reel now.');
      } else if (fight.phase === 'surge') {
        this.setMessage('Surge!', 'Hold off until it tires, or the line will snap.');
      } else {
        this.setMessage('It\'s tiring', 'Reel it in while it rests.');
      }
    }
  }

  updateResult(dt) {
    this.resultCooldown -= dt;
    if (this.resultCooldown <= 0) {
      this.state = 'idle';
      this.currentFish = null;
      this.progress = 0;
      this.tension = 0;
      this.bobber.setPosition(this.bobberStart);
      this.bobberTip.setPosition(this.bobberStart.clone().add(new pc.Vec3(0, 0.15, 0.1)));
      this.setMessage('Ready again', 'Cast again while the session timer is still ticking.');
    }
  }

  updateBobber(dt) {
    const bobberPos = this.bobber.getPosition();
    const floatOffset = Math.sin(this.elapsed * 3.4) * 0.06;
    if (this.state === 'waiting' || this.state === 'bite' || this.state === 'reeling') {
      let biteDip = 0;
      const phase = this.fight ? this.fight.phase : null;
      if (this.state === 'bite') {
        biteDip = Math.sin(this.elapsed * 18) * 0.12;
      } else if (phase === 'warn') {
        // The twitch that telegraphs a surge.
        biteDip = Math.sin(this.elapsed * 32) * 0.1;
      } else if (phase === 'surge') {
        biteDip = -0.2 + Math.sin(this.elapsed * 14) * 0.05;
      }
      this.bobber.setPosition(bobberPos.x, this.castTargetY + floatOffset + biteDip, 0);
      const tipHeight = this.state === 'bite' ? 0.11 : 0.15;
      this.bobberTip.setPosition(bobberPos.x, this.castTargetY + floatOffset + tipHeight + biteDip, 0.1);
    } else if (this.state === 'idle' || this.state === 'menu' || this.state === 'gameover' || this.state === 'result') {
      this.bobber.setPosition(
        lerp(bobberPos.x, this.bobberStart.x, clamp(dt * 4, 0, 1)),
        lerp(bobberPos.y, this.bobberStart.y, clamp(dt * 4, 0, 1)),
        0
      );
      const pos = this.bobber.getPosition();
      this.bobberTip.setPosition(pos.x, pos.y + 0.15, 0.1);
    }
  }

  updateFish(dt) {
    if (!this.currentFish || this.state === 'idle' || this.state === 'menu' || this.state === 'gameover' || this.state === 'result') {
      this.fish.enabled = false;
      return;
    }

    // The fish stays a shadow until it is landed or lost, so its species is a surprise.
    this.fish.enabled = true;

    const surging = this.fight && this.fight.phase === 'surge';
    const wave = Math.sin(this.elapsed * (surging ? 7 : 2.8) + this.currentFish.reward);
    const biteBoost = this.state === 'bite' ? 0.42 : 0;
    const reelBoost = this.state === 'reeling' ? Math.sin(this.elapsed * (surging ? 16 : 8)) * (surging ? 0.35 : 0.2) : 0;
    const x = this.castTargetX - 0.65 + wave * 0.48;
    const y = this.castTargetY - 1.05 + biteBoost + reelBoost;
    this.fish.setPosition(x, y, 0);
    this.fish.setEulerAngles(90, 0, 90 + wave * 22);
    const depthPulse = this.state === 'reeling' ? 0.62 : 0.52;
    this.fish.setLocalScale(0.55, 0.95 + depthPulse * 0.2, 0.35);
  }

  animateBackdrop() {
    const waterColor = new pc.Color(
      0.08 + Math.sin(this.elapsed * 0.6) * 0.02,
      0.4 + Math.sin(this.elapsed * 0.8) * 0.03,
      0.78 + Math.cos(this.elapsed * 0.5) * 0.04
    );
    this.water.render.material.diffuse = waterColor;
    this.water.render.material.emissive = waterColor.clone().mulScalar(0.12);
    this.water.render.material.update();

    this.sun.setLocalPosition(-1.1 + Math.sin(this.elapsed * 0.08) * 0.16, 3.2, -1);
  }

  syncLine() {
    const start = new pc.Vec3(-3.55, 1.95, 0.02);
    const end = this.bobber.getPosition().clone();
    const midpoint = start.clone().add(end).mulScalar(0.5);
    const delta = end.clone().sub(start);
    const length = Math.max(delta.length(), 0.001);
    const angle = (Math.atan2(delta.y, delta.x) * 180) / Math.PI;
    this.line.setLocalPosition(midpoint);
    this.line.setLocalScale(length, 0.035, 0.02);
    this.line.setLocalEulerAngles(0, 0, angle);
  }

  refreshUi() {
    const visibleScore = Math.round(this.score);
    const visibleCoins = this.save.totalCoins;
    this.ui.score.textContent = String(visibleScore);
    this.ui.coins.textContent = String(visibleCoins);
    this.ui.bestScore.textContent = String(Math.max(this.save.bestScore, visibleScore));
    this.ui.sessionTimer.textContent = `${Math.ceil(this.sessionTime)}s`;
    if (!this.currentFish) {
      this.ui.fishLabel.textContent = '—';
    } else {
      this.ui.fishLabel.textContent = this.fishRevealed ? this.currentFish.name : '???';
    }
    this.ui.streakLabel.textContent = String(this.streak);
    this.ui.progressValue.textContent = `${Math.round(this.progress)}%`;
    this.ui.progressBar.style.width = `${this.progress}%`;
    this.ui.tensionValue.textContent = `${Math.round(this.tension)}%`;
    this.ui.tensionBar.style.width = `${this.tension}%`;
    const phase = this.fight ? this.fight.phase : null;
    this.ui.tensionMeter.classList.toggle('warn', phase === 'warn');
    this.ui.tensionMeter.classList.toggle('surge', phase === 'surge');
    this.ui.stateLabel.textContent = this.describeState();

    this.ui.start.disabled = !this.menu;
    this.ui.cast.disabled = this.state !== 'idle' || this.paused;
    this.ui.hook.disabled = this.state !== 'bite' || this.paused;
    this.ui.reel.disabled = this.state !== 'reeling' || this.paused;
    this.ui.pause.disabled = this.menu || this.state === 'gameover';
  }

  describeState() {
    if (this.menu) {
      return 'Menu';
    }
    if (this.paused) {
      return 'Paused';
    }
    switch (this.state) {
      case 'idle':
        return 'Ready to cast';
      case 'casting':
        return 'Casting';
      case 'waiting':
        return 'Waiting for bite';
      case 'bite':
        return 'Hook now';
      case 'reeling':
        if (this.fight && this.fight.phase === 'warn') {
          return 'Let go!';
        }
        return this.fight && this.fight.phase === 'surge' ? 'Surging' : 'Reeling';
      case 'result':
        return 'Recovering';
      case 'gameover':
        return 'Session complete';
      default:
        return this.state;
    }
  }

  randomRange(min, max) {
    return min + Math.random() * (max - min);
  }
}

const canvas = document.getElementById('application');
new ReelGame(canvas);
