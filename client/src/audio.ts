// Placeholder sound: every action gets a small synthesized sound (no audio files to download).

type Wave = OscillatorType;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;
  private lastPickup = 0;
  private pickupStreak = 0;

  /** Must be called from a user gesture on mobile. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, opts: { type?: Wave; vol?: number; slide?: number; delay?: number; attack?: number } = {}) {
    const c = this.ctx;
    if (!c || !this.master || this.muted) return;
    const t0 = c.currentTime + (opts.delay ?? 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
    const v = opts.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, opts: { vol?: number; freq?: number; q?: number; delay?: number; sweep?: number } = {}) {
    const c = this.ctx;
    if (!c || !this.master || !this.noiseBuf || this.muted) return;
    const t0 = c.currentTime + (opts.delay ?? 0);
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1200, t0);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
    f.Q.value = opts.q ?? 1;
    const g = c.createGain();
    g.gain.setValueAtTime(opts.vol ?? 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0);
    s.stop(t0 + dur);
  }

  /** One sound per weapon. */
  shoot(kind: string) {
    if (kind === 'blaster') {
      // laser zap: a short falling chirp with a bubbly top
      this.tone(1500, 0.08, { type: 'sawtooth', vol: 0.07, slide: 0.3 });
      this.tone(2400, 0.05, { type: 'sine', vol: 0.07, slide: 0.6 });
    } else if (kind === 'rocket') {
      this.noise(0.35, { vol: 0.25, freq: 600, sweep: 2400 });
      this.tone(160, 0.25, { type: 'sawtooth', vol: 0.12, slide: 1.8 });
    } else if (kind === 'banana') {
      this.tone(520, 0.12, { type: 'triangle', vol: 0.18, slide: 0.6 });
    } else if (kind === 'freeze') {
      this.tone(1400, 0.3, { type: 'sine', vol: 0.15, slide: 0.5 });
      this.noise(0.25, { vol: 0.1, freq: 5000 });
    } else if (kind === 'hook') {
      this.tone(300, 0.2, { type: 'sawtooth', vol: 0.14, slide: 3 });
    } else if (kind === 'hammer') {
      this.tone(90, 0.35, { type: 'square', vol: 0.22, slide: 0.5, delay: 0.2 });
      this.noise(0.3, { vol: 0.25, freq: 400, delay: 0.2 });
    }
  }

  pickup() {
    const now = performance.now();
    this.pickupStreak = now - this.lastPickup < 350 ? Math.min(this.pickupStreak + 1, 12) : 0;
    this.lastPickup = now;
    const f = 880 * Math.pow(2, this.pickupStreak / 12);
    this.tone(f, 0.09, { type: 'square', vol: 0.08 });
    this.tone(f * 1.5, 0.12, { type: 'sine', vol: 0.12, delay: 0.03 });
  }
  steal() {
    this.noise(0.18, { freq: 3000, sweep: 800, vol: 0.25, q: 2 });
    [1320, 1760, 2093].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', vol: 0.15, delay: 0.05 + i * 0.05 }));
  }
  stolenFrom() {
    this.tone(500, 0.25, { type: 'sawtooth', vol: 0.12, slide: 0.5 });
    this.noise(0.15, { freq: 600, vol: 0.3 });
  }
  hit() {
    this.tone(140, 0.18, { type: 'sine', vol: 0.5, slide: 0.4 });
    this.noise(0.12, { freq: 900, vol: 0.35, q: 0.7 });
  }
  whiff() {
    this.noise(0.12, { freq: 2200, sweep: 900, vol: 0.12, q: 1.5 });
  }
  dash() {
    this.noise(0.22, { freq: 600, sweep: 2600, vol: 0.22, q: 1.2 });
  }
  bankTick(progress: number) {
    this.tone(440 + progress * 440, 0.06, { type: 'triangle', vol: 0.07 });
  }
  bank(n: number) {
    const notes = [1046, 1318, 1568, 2093];
    notes.forEach((f, i) => this.tone(f, 0.18, { type: 'square', vol: 0.09, delay: i * 0.07 }));
    this.noise(0.4, { freq: 6000, vol: 0.12, q: 0.5, delay: 0.25 });
    if (n >= 15) this.tone(2637, 0.4, { type: 'sine', vol: 0.15, delay: 0.32 });
  }
  burst() {
    this.tone(90, 0.4, { type: 'sine', vol: 0.55, slide: 0.5 });
    this.noise(0.35, { freq: 400, sweep: 3000, vol: 0.3 });
    [300, 420, 360].forEach((f, i) => this.tone(f, 0.08, { type: 'square', vol: 0.06, delay: i * 0.04 }));
  }
  slam() {
    this.tone(60, 0.55, { type: 'sine', vol: 0.7, slide: 0.5 });
    this.noise(0.45, { freq: 250, vol: 0.5, q: 0.6 });
  }
  sticky() {
    this.tone(600, 0.25, { type: 'triangle', vol: 0.2, slide: 2.2 });
    this.tone(900, 0.2, { type: 'sine', vol: 0.12, slide: 1.5, delay: 0.08 });
  }
  stun() {
    [1500, 1800, 1500, 1800].forEach((f, i) => this.tone(f, 0.07, { type: 'sine', vol: 0.07, delay: i * 0.08 }));
  }
  fall() {
    this.tone(900, 0.9, { type: 'sine', vol: 0.18, slide: 0.25 });
  }
  bounce() {
    this.tone(180, 0.35, { type: 'sine', vol: 0.4, slide: 3 });
  }
  land() {
    this.noise(0.1, { freq: 500, vol: 0.2 });
  }
  wave() {
    [2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.15, { type: 'sine', vol: 0.05, delay: i * 0.06 }));
  }
  count(go = false) {
    this.tone(go ? 1046 : 523, go ? 0.4 : 0.15, { type: 'square', vol: 0.12 });
  }
  warn() {
    this.tone(660, 0.12, { type: 'square', vol: 0.07 });
    this.tone(660, 0.12, { type: 'square', vol: 0.07, delay: 0.18 });
  }
  rumble() {
    this.noise(1.2, { freq: 120, vol: 0.4, q: 0.4 });
  }
  win() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.2, { type: 'square', vol: 0.1, delay: i * 0.11 }));
  }
  lose() {
    [392, 349, 330, 262].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.12, delay: i * 0.15 }));
  }
  power() {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.14, { type: 'triangle', vol: 0.12, delay: i * 0.05 }));
    this.noise(0.25, { freq: 4000, sweep: 9000, vol: 0.08, q: 0.8 });
  }
  pop() {
    this.tone(600, 0.08, { type: 'sine', vol: 0.25, slide: 2.5 });
  }
  shieldBlock() {
    this.tone(1400, 0.3, { type: 'sine', vol: 0.18, slide: 0.6 });
    this.tone(2100, 0.25, { type: 'triangle', vol: 0.1, slide: 0.7, delay: 0.02 });
  }
  fuse() {
    this.noise(0.12, { freq: 5000, vol: 0.06, q: 2 });
  }
  boom() {
    this.tone(55, 0.8, { type: 'sine', vol: 0.8, slide: 0.4 });
    this.noise(0.8, { freq: 900, sweep: 120, vol: 0.6, q: 0.5 });
    this.noise(0.3, { freq: 3000, vol: 0.25, q: 0.7 });
  }
  jackpotWarn() {
    this.noise(1.6, { freq: 90, sweep: 220, vol: 0.35, q: 0.4 });
    [392, 494, 587].forEach((f, i) => this.tone(f, 0.25, { type: 'square', vol: 0.06, delay: 0.4 + i * 0.35 }));
  }
  jackpot() {
    this.tone(70, 0.6, { type: 'sine', vol: 0.5, slide: 0.6 });
    [1046, 1318, 1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.22, { type: 'square', vol: 0.08, delay: 0.1 + i * 0.07 }));
    this.noise(1.0, { freq: 7000, vol: 0.12, q: 0.4, delay: 0.2 });
  }
  golden() {
    [1568, 2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.25, { type: 'sine', vol: 0.14, delay: i * 0.06 }));
  }
  charge() {
    this.tone(220, 0.3, { type: 'sawtooth', vol: 0.07, slide: 3 });
  }
  whoosh() {
    this.noise(0.35, { freq: 400, sweep: 3500, vol: 0.3, q: 0.9 });
  }
  dodge() {
    this.noise(0.25, { freq: 1500, sweep: 5000, vol: 0.2, q: 1.5 });
    this.tone(1760, 0.18, { type: 'sine', vol: 0.12, delay: 0.08 });
  }
  tick() {
    this.tone(1800, 0.03, { type: 'square', vol: 0.05 });
  }
  land2() {
    [784, 1046, 1568].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', vol: 0.13, delay: i * 0.06 }));
  }
  crown() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, { type: 'square', vol: 0.1, delay: i * 0.09 }));
    this.tone(1568, 0.5, { type: 'sine', vol: 0.12, delay: 0.36 });
  }
  crownOther() {
    [784, 1046].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', vol: 0.07, delay: i * 0.07 }));
  }
  horn() {
    this.tone(330, 0.45, { type: 'sawtooth', vol: 0.12 });
    this.tone(415, 0.45, { type: 'sawtooth', vol: 0.1 });
    this.tone(330, 0.3, { type: 'sawtooth', vol: 0.12, delay: 0.55 });
    this.tone(415, 0.3, { type: 'sawtooth', vol: 0.1, delay: 0.55 });
  }
  bell() {
    for (let i = 0; i < 3; i++) {
      this.tone(196, 1.2, { type: 'sine', vol: 0.3, delay: i * 0.8 });
      this.tone(392, 0.9, { type: 'triangle', vol: 0.1, delay: i * 0.8 });
      this.tone(587, 0.6, { type: 'sine', vol: 0.06, delay: i * 0.8 });
    }
  }
  click() {
    this.tone(1200, 0.05, { type: 'square', vol: 0.06 });
  }
}
