// Procedural sound: no audio files yet. Reel clicks, drag scream, splashes, bites, snaps and ambience.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.clickTimer = 0;
  }

  // Browsers only allow audio after a user gesture.
  unlock() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    this.startAmbience();
    this.startDrag();
  }

  noise(duration, { freq = 1000, q = 1, gain = 0.3, type = 'bandpass', attack = 0.005, sweep = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + duration);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }

  tone(freq, duration, { type = 'sine', gain = 0.2, slide = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.05);
  }

  cast() {
    this.noise(0.45, { freq: 600, sweep: 2400, q: 0.7, gain: 0.25, attack: 0.08 });
  }
  plop(size = 1) {
    this.noise(0.25 + size * 0.2, { freq: 500 / size, sweep: -300 / size, q: 2, gain: 0.35 * size, type: 'lowpass' });
    this.tone(260 / size, 0.12, { slide: -140, gain: 0.12 });
  }
  nibble() {
    this.tone(180, 0.06, { gain: 0.1 });
  }
  bite() {
    this.noise(0.3, { freq: 400, sweep: -200, q: 1.5, gain: 0.4, type: 'lowpass' });
  }
  strike() {
    this.noise(0.2, { freq: 900, sweep: -600, q: 0.8, gain: 0.3 });
  }
  snap() {
    this.tone(1400, 0.35, { type: 'triangle', slide: -1100, gain: 0.3 });
    this.noise(0.15, { freq: 3000, q: 0.5, gain: 0.25 });
  }
  landed() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, { type: 'triangle', gain: 0.12 }), i * 90));
  }
  cash() {
    [1318, 1760].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, { type: 'square', gain: 0.06 }), i * 70));
  }
  ui() {
    this.tone(880, 0.05, { type: 'triangle', gain: 0.05 });
  }

  // Called every frame with how fast the reel turns (0..1).
  reel(dt, speed) {
    if (!this.ctx || speed <= 0) return;
    this.clickTimer -= dt * (6 + speed * 20);
    if (this.clickTimer <= 0) {
      this.clickTimer = 1;
      this.noise(0.03, { freq: 3500, q: 4, gain: 0.06 });
    }
  }

  startDrag() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    this.dragFilter = this.ctx.createBiquadFilter();
    this.dragFilter.type = 'bandpass';
    this.dragFilter.frequency.value = 2400;
    this.dragFilter.Q.value = 8;
    this.dragGain = this.ctx.createGain();
    this.dragGain.gain.value = 0;
    src.connect(this.dragFilter).connect(this.dragGain).connect(this.master);
    src.start();
  }

  // Drag "scream" while line slips off the spool.
  drag(slipping, speed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.dragGain.gain.setTargetAtTime(slipping && !this.muted ? 0.08 + Math.min(speed, 3) * 0.04 : 0, t, 0.04);
    this.dragFilter.frequency.setTargetAtTime(1800 + Math.min(speed, 3) * 600, t, 0.05);
  }

  startAmbience() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.05;
    src.connect(filter).connect(this.windGain).connect(this.master);
    src.start();
  }

  ambience(dt, { day, rain }) {
    if (!this.ctx) return;
    this.windGain.gain.setTargetAtTime(this.muted ? 0 : rain ? 0.16 : 0.05, this.ctx.currentTime, 0.5);
    if (rain && Math.random() < dt * 30) this.noise(0.04, { freq: 5000, q: 1, gain: 0.02 });
    // Birds by day, crickets at night.
    if (day > 0.3 && Math.random() < dt * 0.25) {
      const f = 2200 + Math.random() * 1600;
      for (let i = 0; i < 3; i += 1) setTimeout(() => this.tone(f + i * 120, 0.08, { gain: 0.025, slide: 400 }), i * 110);
    } else if (day < 0.1 && Math.random() < dt * 2) {
      this.tone(4200, 0.05, { type: 'square', gain: 0.008 });
    }
  }

  toggle() {
    this.muted = !this.muted;
    return this.muted;
  }
}
