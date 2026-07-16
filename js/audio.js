/* ============================================================
   HIYARI audio — fully procedural WebAudio.
   Engine saws + wind noise ride speed; near-misses play a
   pentatonic ladder; stamps thunk like rubber on card stock.
   Created lazily on the first user gesture (the hold-to-drive).
   ============================================================ */

(function () {
  'use strict';

  // ── ALL SOUND DISABLED (user request, 2026-07-16) ────────────────
  // The engine pitch climbing with speed + the wind/screech/boost
  // white-noise beds + the procedural music stacked into "too much
  // noise". Setting this to true stops the audio engine from ever
  // starting, so every audio.* call in main.js becomes a no-op
  // (each already guards on `if (!this.ok) return;`).
  // Flip back to false to restore the full procedural soundtrack.
  const AUDIO_DISABLED = true;

  const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0]; // C D E G A

  class HiyariAudio {
    constructor() {
      this.ok = false;
      this.muted = false;
      this._lastTick = 0;
      this._lastWarn = 0;
    }

    init() {
      if (this.ok || AUDIO_DISABLED) return;   // no context, no oscillators, silence
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();

      this.master = ctx.createGain();
      this.master.gain.value = 1;
      this.muteGain = ctx.createGain();
      this.muteGain.gain.value = this.muted ? 0 : 1;
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -18;
      this.comp.ratio.value = 6;
      this.master.connect(this.muteGain);
      this.muteGain.connect(this.comp);
      this.comp.connect(ctx.destination);

      // --- shared noise buffer (1.5 s white) ---
      const len = Math.floor(ctx.sampleRate * 1.5);
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      // --- engine: two detuned saws through a lowpass ---
      this.engFilter = ctx.createBiquadFilter();
      this.engFilter.type = 'lowpass';
      this.engFilter.frequency.value = 420;
      this.engGain = ctx.createGain();
      this.engGain.gain.value = 0;
      this.engFilter.connect(this.engGain);
      this.engGain.connect(this.master);

      this.osc1 = ctx.createOscillator();
      this.osc2 = ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc2.type = 'sawtooth';
      this.osc1.frequency.value = 82;
      this.osc2.frequency.value = 82;
      this.osc1.detune.value = -6;
      this.osc2.detune.value = 6;
      this.osc1.connect(this.engFilter);
      this.osc2.connect(this.engFilter);
      this.osc1.start();
      this.osc2.start();

      // tier voice: quiet square a fifth up, gain steps with route tier
      this.tierOsc = ctx.createOscillator();
      this.tierOsc.type = 'square';
      this.tierOsc.frequency.value = 123;
      this.tierGain = ctx.createGain();
      this.tierGain.gain.value = 0;
      this.tierOsc.connect(this.tierGain);
      this.tierGain.connect(this.engFilter);
      this.tierOsc.start();

      // idle lump LFO on engine gain
      this.lfo = ctx.createOscillator();
      this.lfo.frequency.value = 4;
      this.lfoGain = ctx.createGain();
      this.lfoGain.gain.value = 0.012;
      this.lfo.connect(this.lfoGain);
      this.lfoGain.connect(this.engGain.gain);
      this.lfo.start();

      // --- wind bed: looped noise through a bandpass ---
      this.windSrc = ctx.createBufferSource();
      this.windSrc.buffer = this.noiseBuf;
      this.windSrc.loop = true;
      this.windFilter = ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 320;
      this.windFilter.Q.value = 0.6;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      this.windSrc.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.master);
      this.windSrc.start();

      // --- fever drone (two sines a fifth apart), silent until fever ---
      this.feverGain = ctx.createGain();
      this.feverGain.gain.value = 0;
      const f1 = ctx.createOscillator(); f1.frequency.value = 110;
      const f2 = ctx.createOscillator(); f2.frequency.value = 165;
      f1.connect(this.feverGain); f2.connect(this.feverGain);
      this.feverGain.connect(this.master);
      f1.start(); f2.start();

      // --- drift screech: looped noise, shaped per frame ---
      this.screechSrc = ctx.createBufferSource();
      this.screechSrc.buffer = this.noiseBuf;
      this.screechSrc.loop = true;
      this.screechBp = ctx.createBiquadFilter();
      this.screechBp.type = 'bandpass';
      this.screechBp.frequency.value = 1050;
      this.screechBp.Q.value = 2.2;
      this.screechGain = ctx.createGain();
      this.screechGain.gain.value = 0;
      this.screechSrc.connect(this.screechBp);
      this.screechBp.connect(this.screechGain);
      this.screechGain.connect(this.master);
      this.screechSrc.start();

      // --- boost roar layer ---
      this.boostSrc = ctx.createBufferSource();
      this.boostSrc.buffer = this.noiseBuf;
      this.boostSrc.loop = true;
      this.boostBp = ctx.createBiquadFilter();
      this.boostBp.type = 'bandpass';
      this.boostBp.frequency.value = 520;
      this.boostBp.Q.value = 0.8;
      this.boostGain = ctx.createGain();
      this.boostGain.gain.value = 0;
      this.boostSrc.connect(this.boostBp);
      this.boostBp.connect(this.boostGain);
      this.boostGain.connect(this.master);
      this.boostSrc.start();

      // --- music bus ---
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
      this.musicOn = this._musicPref !== false;
      this._mode = 'off';
      this._step = 0;
      this._bar = 0;
      this._nextT = 0;

      this.ok = true;
    }

    /* ============================================================
       MUSIC — an original Tokyo-street-racing homage, synthesized.
       Hirajoshi-flavored bass and shamisen-style plucks over an
       808 hip-hop pattern. No samples, no copyrighted material.
       ============================================================ */

    musicSet(mode) {
      this._mode = mode;
      if (!this.ok) return;
      const on = this.musicOn && mode !== 'off';
      this.musicGain.gain.setTargetAtTime(on ? 0.34 : 0, this.ctx.currentTime, 0.4);
      if (on && !this._timer) {
        this._nextT = this.ctx.currentTime + 0.06;
        this._step = 0;
        this._bar = 0;
        this._timer = setInterval(() => this._musicTick(), 40);
      }
    }

    setMusicOn(on) {
      this.musicOn = on;
      this._musicPref = on;
      if (this.ok) this.musicSet(this._mode);
    }

    _musicTick() {
      if (!this.ok) return;
      const ahead = this.ctx.currentTime + 0.14;
      while (this._nextT < ahead) {
        this._scheduleStep(this._step, this._bar, this._nextT);
        const bpm = this._mode === 'fever' ? 106 : 96;
        this._nextT += 60 / bpm / 4;
        this._step = (this._step + 1) % 16;
        if (this._step === 0) this._bar++;
      }
    }

    _scheduleStep(s, bar, t) {
      const m = this._mode;
      if (m === 'off') return;
      const sparse = m === 'intro' || m === 'results';

      // taiko heartbeat opens every 4th bar
      if (s === 0 && bar % 4 === 0) this._taiko(t);

      if (!sparse) {
        const kicks = m === 'fever' ? [0, 4, 8, 12] : [0, 7, 10];
        if (kicks.includes(s)) this._kick(t);
        if (s === 4 || s === 12) this._snare(t);
        const hatEvery = m === 'fever' ? 1 : 2;
        if (s % hatEvery === 0) this._hat(t, s === 14);
        // bass riff on A1 hirajoshi (A B C E F)
        const riff = { 0: 55, 3: 55, 6: 65.41, 8: 55, 11: 87.31, 14: 82.41 };
        if (riff[s]) this._bass(t, riff[s] * (m === 'fever' ? 2 : 1));
      }

      // shamisen-style pluck motif every other bar
      if (bar % 2 === 0) {
        const motif = sparse
          ? { 0: 440, 6: 523.25, 12: 493.88 }
          : { 0: 440, 2: 523.25, 4: 493.88, 8: 440, 12: 329.63 };
        if (motif[s]) this._pluck(t, motif[s]);
      }
    }

    _kick(t) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(118, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.85, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + 0.18);
    }

    _snare(t) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.start(t, Math.random(), 0.14);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      src.connect(bp); bp.connect(g); g.connect(this.musicGain);
    }

    _hat(t, open) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.start(t, Math.random(), open ? 0.14 : 0.035);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 7200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(open ? 0.11 : 0.085, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.13 : 0.04));
      src.connect(hp); hp.connect(g); g.connect(this.musicGain);
    }

    _bass(t, f) {
      const ctx = this.ctx;
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 310;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.21);
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.musicGain);
      o1.start(t); o2.start(t); o1.stop(t + 0.24); o2.stop(t + 0.24);
    }

    /* Karplus-Strong-ish pluck: noise burst into a tuned feedback delay */
    _pluck(t, f) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.start(t, Math.random(), 0.008);
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = 1 / f;
      const fb = ctx.createGain(); fb.gain.value = 0.91;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass'; damp.frequency.value = 3400;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.34, t);
      out.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      src.connect(delay);
      delay.connect(damp); damp.connect(fb); fb.connect(delay);
      delay.connect(out); out.connect(this.musicGain);
      setTimeout(() => { try { fb.gain.value = 0; } catch (e) {} }, 1200);
    }

    _taiko(t) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(72, t);
      o.frequency.exponentialRampToValueAtTime(37, t + 0.35);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.7, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + 0.5);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.start(t, Math.random(), 0.09);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.3, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      src.connect(lp); lp.connect(ng); ng.connect(this.master);
    }

    /* drift screech intensity 0..1, called per frame */
    setDrift(i) {
      if (!this.ok) return;
      const t = this.ctx.currentTime;
      this.screechGain.gain.setTargetAtTime(i * 0.2, t, 0.06);
      this.screechBp.frequency.setTargetAtTime(880 + i * 520 + Math.sin(t * 13) * 60, t, 0.05);
    }

    landThump() {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(66, t);
      o.frequency.exponentialRampToValueAtTime(34, t + 0.16);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.7, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.22);
    }

    resume() { if (this.ok && this.ctx.state !== 'running') this.ctx.resume(); }

    setMuted(m) {
      this.muted = m;
      if (this.ok) this.muteGain.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
    }

    /* Engine idling on the intro screen */
    idle() {
      if (!this.ok) return;
      const t = this.ctx.currentTime;
      this.engGain.gain.setTargetAtTime(0.055, t, 0.3);
      this.osc1.frequency.setTargetAtTime(78, t, 0.3);
      this.osc2.frequency.setTargetAtTime(78, t, 0.3);
      this.engFilter.frequency.setTargetAtTime(380, t, 0.3);
    }

    /* Rev swell while the ink gauge fills (h = 0..1) */
    holdRev(h) {
      if (!this.ok) return;
      const t = this.ctx.currentTime;
      const f = 78 + h * 110;
      this.osc1.frequency.setTargetAtTime(f, t, 0.06);
      this.osc2.frequency.setTargetAtTime(f, t, 0.06);
      this.engFilter.frequency.setTargetAtTime(380 + h * 1400, t, 0.06);
      this.engGain.gain.setTargetAtTime(0.055 + h * 0.05, t, 0.06);
    }

    /* Per-frame drive parameters. speedNorm 0..1, steer -1..1, tier 0..3, boost 0..1 */
    setDrive(speedNorm, steer, tier, boost) {
      if (!this.ok) return;
      const b = boost || 0;
      const t = this.ctx.currentTime;
      const f = (82 + speedNorm * 138 + Math.abs(steer) * 6) * (1 + b * 0.16);
      this.osc1.frequency.setTargetAtTime(f, t, 0.08);
      this.osc2.frequency.setTargetAtTime(f, t, 0.08);
      this.tierOsc.frequency.setTargetAtTime(f * 1.5, t, 0.08);
      this.tierGain.gain.setTargetAtTime(tier * 0.008, t, 0.4);
      this.engFilter.frequency.setTargetAtTime(400 + speedNorm * 2400 + b * 900, t, 0.1);
      this.engGain.gain.setTargetAtTime(0.075 + speedNorm * 0.05 + b * 0.02, t, 0.1);
      this.windFilter.frequency.setTargetAtTime(300 + speedNorm * 900, t, 0.15);
      this.windGain.gain.setTargetAtTime(speedNorm * speedNorm * 0.34 + b * 0.1, t, 0.15);
      this.boostGain.gain.setTargetAtTime(b * 0.26, t, 0.09);
    }

    _burst(dur) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = false;
      src.start(this.ctx.currentTime, Math.random() * 0.8, dur + 0.05);
      return src;
    }

    /* Near-miss: panned whoosh + pentatonic ping that climbs with combo */
    whoosh(pan, combo) {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = this._burst(0.24);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(2200, t);
      bp.frequency.exponentialRampToValueAtTime(340, t + 0.22);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      src.connect(bp); bp.connect(g);
      if (p) { p.pan.value = Math.max(-0.85, Math.min(0.85, pan)); g.connect(p); p.connect(this.master); }
      else g.connect(this.master);

      const idx = Math.max(0, combo - 1);
      const freq = PENTA[idx % 5] * (idx >= 5 ? 2 : 1);
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.16, t + 0.02);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(og); og.connect(this.master);
      o.start(t + 0.02); o.stop(t + 0.35);
    }

    /* Inhale before the tightest passes: reversed-envelope swell */
    swell() {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = this._burst(0.16);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.15);
      g.gain.setValueAtTime(0.0001, t + 0.155);
      src.connect(bp); bp.connect(g); g.connect(this.master);
    }

    /* Rubber stamp on card stock */
    thunk(big) {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(big ? 70 : 90, t);
      o.frequency.exponentialRampToValueAtTime(big ? 42 : 58, t + (big ? 0.12 : 0.06));
      const g = ctx.createGain();
      g.gain.setValueAtTime(big ? 0.8 : 0.45, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 0.14 : 0.08));
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.16);
      const click = this._burst(0.012);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.12, t);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
      click.connect(cg); cg.connect(this.master);
    }

    /* Odometer digit blip, self-capped to ~30/s */
    tick() {
      if (!this.ok) return;
      const t = this.ctx.currentTime;
      if (t - this._lastTick < 0.033) return;
      this._lastTick = t;
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 1750;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.028, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.025);
    }

    /* Combo-about-to-die woodblock */
    warnTick() {
      if (!this.ok) return;
      const t = this.ctx.currentTime;
      if (t - this._lastWarn < 0.09) return;
      this._lastWarn = t;
      const o = this.ctx.createOscillator();
      o.frequency.value = 840;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.035);
    }

    /* Two-note signboard chime for tiers and milestones */
    chime() {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      [[659.25, 0], [880, 0.14]].forEach(([f, dt]) => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.exponentialRampToValueAtTime(0.18, t + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.5);
        o.connect(g); g.connect(this.master);
        o.start(t + dt); o.stop(t + dt + 0.55);
      });
    }

    uiBlip() {
      if (!this.ok) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.frequency.value = 1150;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.05);
    }

    /* Oncoming lane pass: doppler drop */
    passby(pan) {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = this._burst(0.3);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(1400, t);
      bp.frequency.exponentialRampToValueAtTime(300, t + 0.28);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      src.connect(bp); bp.connect(g);
      if (p) { p.pan.value = pan; g.connect(p); p.connect(this.master); }
      else g.connect(this.master);
    }

    /* The run dying: distorted burst, body thump, tape-stop engine */
    crash() {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = this._burst(0.6);
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 128) - 1;
        curve[i] = Math.tanh(x * 4);
      }
      shaper.curve = curve;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.7, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      src.connect(shaper); shaper.connect(g); g.connect(this.master);

      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(55, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.9, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(og); og.connect(this.master);
      o.start(t); o.stop(t + 0.6);

      // tape-stop: engine glides down two octaves and fades
      this.osc1.frequency.cancelScheduledValues(t);
      this.osc2.frequency.cancelScheduledValues(t);
      const cur = this.osc1.frequency.value;
      this.osc1.frequency.setValueAtTime(cur, t);
      this.osc2.frequency.setValueAtTime(cur, t);
      this.osc1.frequency.exponentialRampToValueAtTime(Math.max(20, cur * 0.25), t + 1.2);
      this.osc2.frequency.exponentialRampToValueAtTime(Math.max(20, cur * 0.25), t + 1.2);
      this.engGain.gain.setTargetAtTime(0, t + 0.1, 0.5);
      this.windGain.gain.setTargetAtTime(0, t, 0.2);
      this.feverGain.gain.setTargetAtTime(0, t, 0.1);
      this.screechGain.gain.setTargetAtTime(0, t, 0.05);
      this.boostGain.gain.setTargetAtTime(0, t, 0.05);
      this.musicSet('off');
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0.25, t + 0.4);
      this.master.gain.linearRampToValueAtTime(1, t + 2.4);
    }

    feverOn()  { if (this.ok) this.feverGain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.4); }
    feverOff() { if (this.ok) this.feverGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); }

    duck(on) {
      if (!this.ok) return;
      this.master.gain.setTargetAtTime(on ? 0.12 : 1, this.ctx.currentTime, 0.08);
    }
  }

  window.HiyariAudio = HiyariAudio;
})();
