"use client";

/**
 * A quiet, original generative soundscape for the galleries: slow pentatonic
 * chords on soft oscillators, a touch of "room" reverb made from a synthetic
 * impulse response, and a faint air tone. No audio files are used.
 */
const ROOT = 196; // G3
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
const CHORDS = [
  [0, 2, 4],
  [1, 3, 5],
  [0, 3, 5],
  [2, 4, 6],
  [0, 2, 5],
];

function hz(step: number) {
  return ROOT * Math.pow(2, SCALE[step % SCALE.length]! / 12) * (step >= SCALE.length ? 2 : 1);
}

export class AmbientSoundscape {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private air: AudioBufferSourceNode | null = null;
  private chord = 0;
  private volume = 0.4;
  private running = false;

  start(volume: number) {
    this.volume = volume;
    if (!this.ctx) this.build();
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    void ctx.resume().catch(() => undefined);
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(this.level(), ctx.currentTime, 1.2);
    if (!this.running) {
      this.running = true;
      this.playChord();
    }
  }

  setVolume(volume: number) {
    this.volume = volume;
    if (this.ctx && this.master && this.running) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.3);
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
    setTimeout(() => {
      if (!this.running) void ctx.suspend().catch(() => undefined);
    }, 2500);
  }

  /** Browsers start audio only after a user gesture. */
  get blocked() {
    return this.ctx?.state === "suspended" && this.running;
  }

  resume() {
    void this.ctx?.resume().catch(() => undefined);
  }

  dispose() {
    this.stop();
    this.air?.stop();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  private level() {
    return Math.max(0, Math.min(1, this.volume)) * 0.22;
  }

  private build() {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // Synthetic room reverb: decaying stereo noise as an impulse response.
    const seconds = 3.2;
    const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = ir.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    const dry = ctx.createGain();
    dry.gain.value = 0.6;
    const bus = ctx.createBiquadFilter();
    bus.type = "lowpass";
    bus.frequency.value = 1800;
    const busGain = ctx.createGain();
    bus.connect(busGain);
    busGain.connect(dry).connect(master);
    busGain.connect(reverb).connect(wet).connect(master);

    // Faint air tone (filtered noise) for a sense of space.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const air = ctx.createBufferSource();
    air.buffer = noise;
    air.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = "bandpass";
    airFilter.frequency.value = 500;
    airFilter.Q.value = 0.4;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.018;
    air.connect(airFilter).connect(airGain).connect(master);
    air.start();

    this.ctx = ctx;
    this.master = master;
    this.bus = bus;
    this.air = air;
  }

  private playChord() {
    const ctx = this.ctx;
    const bus = this.bus;
    if (!ctx || !bus || !this.running) return;
    const chord = CHORDS[this.chord % CHORDS.length]!;
    this.chord += 1 + Math.floor(Math.random() * 2);
    const now = ctx.currentTime;
    const length = 9 + Math.random() * 3;
    chord.forEach((step, i) => {
      for (const detune of [-4, 5]) {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? "sine" : "triangle";
        osc.frequency.value = hz(step) * (i === 0 ? 0.5 : 1);
        osc.detune.value = detune;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(0.06 / chord.length, now + 3 + i * 0.6);
        env.gain.setTargetAtTime(0, now + length - 3, 1.4);
        osc.connect(env).connect(bus);
        osc.start(now);
        osc.stop(now + length + 4);
      }
    });
    // An occasional high, soft note.
    if (Math.random() < 0.6) {
      const bell = ctx.createOscillator();
      bell.type = "sine";
      bell.frequency.value = hz(chord[2]! + 5);
      const env = ctx.createGain();
      const at = now + 2 + Math.random() * 4;
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.025, at + 0.05);
      env.gain.setTargetAtTime(0, at + 0.1, 1.2);
      bell.connect(env).connect(bus);
      bell.start(at);
      bell.stop(at + 6);
    }
    this.timer = setTimeout(() => this.playChord(), (length - 2.5) * 1000);
  }
}
