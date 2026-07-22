/* ============================================================
   HIYARI audio — fully procedural WebAudio.
   Engine saws + wind noise ride speed; near-misses play a
   pentatonic ladder; stamps thunk like rubber on card stock.
   Created lazily on the first user gesture (the hold-to-drive).
   ============================================================ */

(function () {
  'use strict';

  // ── RACING SFX ENABLED (user request, 2026-07-19) ────────────────
  // Earlier the engine + wind + screech + boost beds + the procedural
  // MUSIC all stacked into "too much noise", so everything was killed.
  // It's back on now, but rebalanced as *sound effects, not music*:
  //   • the wind / boost / screech beds are pulled WAY down (see the
  //     BED_* mix constants below) so they colour the drive instead of
  //     drowning it;
  //   • the engine is the hero — it revs cleanly with speed;
  //   • MUSIC is now a real streamed PLAYLIST — Tokyo Drift first, then
  //     AC/DC — defaulting ON and routed through the music bus. It loops
  //     back to the top of the playlist. The MUSIC button silences it.
  //     Flip AUDIO_DISABLED to true to silence everything.
  const AUDIO_DISABLED = false;

  // bed mix — the constant "hiss" layers, kept low so SFX read clean
  const BED_WIND   = 0.14;   // was 0.34 — wind roar at top speed
  const BED_BOOST  = 0.15;   // was 0.26 — boost turbine layer
  const BED_SCREECH = 0.17;  // was 0.20 — tyre screech ceiling

  const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0]; // C D E G A

  // Background music PLAYLIST — real audio files streamed through the music
  // bus, in order: Tokyo Drift first, then AC/DC, then looping back to the top.
  // In dev these point at the audio/ folder; build.js overrides
  // window.HIYARI_MUSIC_SRCS with base64 data: URIs so the dist stays offline.
  const MUSIC_TRACKS =
    (typeof window !== 'undefined' && window.HIYARI_MUSIC_SRCS) || [
      'audio/' + encodeURIComponent('Tokyo Drift - Teriyaki Boyz [ MUSIC VIDEO ] HD.mp3'),
      'audio/' + encodeURIComponent('AC_DC - Highway to Hell [Audio].mp3'),
    ];

  // music bus volume per game mode (the track loops the whole time)
  const MUSIC_VOL = { intro: 0.34, run: 0.46, fever: 0.58, results: 0.32 };

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

      // --- background music playlist (streamed) ---
      // Routed through the WebAudio graph via a MediaElementSource so the
      // mute button, crash duck and compressor all reach it too. One <audio>
      // element whose src advances on 'ended': Tokyo Drift → AC/DC → loop.
      this._trackIdx = 0;
      try {
        const track = this.track = new Audio();
        track.src = MUSIC_TRACKS[0];
        track.loop = false;               // playlist advances manually, not per-track loop
        track.preload = 'auto';
        track.crossOrigin = 'anonymous';
        track.addEventListener('ended', () => {
          this._trackIdx = (this._trackIdx + 1) % MUSIC_TRACKS.length;
          track.src = MUSIC_TRACKS[this._trackIdx];
          const p = track.play();
          if (p && p.catch) p.catch(() => {});
        });
        this.trackNode = ctx.createMediaElementSource(track);
        this.trackNode.connect(this.musicGain);
      } catch (e) {
        this.track = null;   // no track — SFX still work, just no soundtrack
      }

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
      const vol = MUSIC_VOL[mode] || 0.4;
      this.musicGain.gain.setTargetAtTime(on ? vol : 0, this.ctx.currentTime, 0.4);
      if (!this.track) return;
      if (on) {
        const p = this.track.play();
        if (p && p.catch) p.catch(() => {});   // autoplay gate — ignored, retries on next gesture
      } else if (mode === 'off') {
        this.track.pause();   // hard stop on crash; a plain toggle-off just goes silent
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
      this.screechGain.gain.setTargetAtTime(i * BED_SCREECH, t, 0.06);
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
      this.windGain.gain.setTargetAtTime(speedNorm * speedNorm * BED_WIND + b * 0.06, t, 0.15);
      this.boostGain.gain.setTargetAtTime(b * BED_BOOST, t, 0.09);
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

    /* Corner-ahead call — a panned two-tone "rally note" that rises for a
       right-hander, falls for a left-hander, so you HEAR the turn coming.
       dir: -1 left, +1 right. hard: burns a brighter, longer tone. */
    cornerAlert(dir, hard) {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const up = dir > 0;
      const f0 = up ? 520 : 760;
      const f1 = up ? 780 : 500;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f1, t + 0.16);
      const g = ctx.createGain();
      const peak = hard ? 0.2 : 0.13;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (hard ? 0.5 : 0.34));
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      o.connect(g);
      if (p) { p.pan.value = Math.max(-0.7, Math.min(0.7, dir * 0.6)); g.connect(p); p.connect(this.master); }
      else g.connect(this.master);
      o.start(t); o.stop(t + (hard ? 0.55 : 0.4));
    }

    /* Front cannon: punchy square drop + high click — a pop, not a laser */
    shoot() {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(680, t);
      o.frequency.exponentialRampToValueAtTime(130, t + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.13);
      const click = this._burst(0.02);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 3200;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.14, t);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      click.connect(hp); hp.connect(cg); cg.connect(this.master);
    }

    /* A shot connecting with a car: small dry explosion */
    blastHit() {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = this._burst(0.16);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 750; bp.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.36, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.16);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.5, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(og); og.connect(this.master);
      o.start(t); o.stop(t + 0.2);
    }

    /* Supply crate cracking open: two wood snaps over a low thunk */
    crateBreak() {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      [[1500, 0], [2500, 0.045]].forEach(([f, dtOff]) => {
        const src = this._burst(0.12);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 1.6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);   // hold silent until this snap's turn
        g.gain.setValueAtTime(0.28, t + dtOff);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dtOff + 0.06);
        src.connect(bp); bp.connect(g); g.connect(this.master);
      });
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(66, t + 0.12);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.4, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(og); og.connect(this.master);
      o.start(t); o.stop(t + 0.16);
    }

    /* Ammo pickup: two bright ascending blips */
    pickup() {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      [[1046.5, 0], [1568, 0.09]].forEach(([f, dtOff]) => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + dtOff);
        g.gain.exponentialRampToValueAtTime(0.14, t + dtOff + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dtOff + 0.14);
        o.connect(g); g.connect(this.master);
        o.start(t + dtOff); o.stop(t + dtOff + 0.16);
      });
    }

    /* Shield arming: rising shimmer sweep */
    shieldGain() {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(440, t);
      o.frequency.exponentialRampToValueAtTime(990, t + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.5);
      const spark = this._burst(0.2);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 6000;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.06, t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      spark.connect(hp); hp.connect(sg); sg.connect(this.master);
    }

    /* The shield eating a crash: deep gong + glass shimmer */
    shieldSave() {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(200, t);
      o.frequency.exponentialRampToValueAtTime(62, t + 0.55);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.8, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.65);
      const shimmer = this._burst(0.4);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2400;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.22, t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      shimmer.connect(hp); hp.connect(sg); sg.connect(this.master);
    }

    /* Tyre chirp — the short bark of rubber when a drift first breaks loose */
    tyreChirp() {
      if (!this.ok) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = this._burst(0.09);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 3.4;
      bp.frequency.setValueAtTime(760, t);
      bp.frequency.exponentialRampToValueAtTime(1500, t + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      src.connect(bp); bp.connect(g); g.connect(this.master);
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
