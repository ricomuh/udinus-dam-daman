const SFX_FILES = {
  correct:   'assets/audio/sfx/benar.wav',
  wrong:     'assets/audio/sfx/salah.wav',
  wrong_alt: 'assets/audio/sfx/salah-.wav',
  snake:     'assets/audio/sfx/turun dari ular.wav',
  win:       'assets/audio/sfx/sfx_win_42.wav',
  bgm_win:   'assets/audio/bgm/bgm_win_31.ogg',
};

// AudioManager — wrapper Web Audio API (SFX + BGM) + Phaser audio untuk fonik huruf
export class AudioManager {
  constructor(scene) {
    this.scene = scene;
    this.ctx = null;
    this.muted = false;
    this._phonemeTimers = [];
    this._letterBuffers = {};
    this._sfxBuffers = {};
    this._loaded = false;
    this._bgmSource = null;
    this._bgmGain = null;
    this._bgmPlaying = false;
  }

  _ensureCtx() {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    } catch (e) {
      this.ctx = null;
    }
    return this.ctx;
  }

  unlock() {
    const ctx = this._ensureCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  async loadSfx() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const base = import.meta.env.BASE_URL;
    await Promise.all(
      Object.entries(SFX_FILES).map(async ([key, path]) => {
        try {
          const res = await fetch(`${base}${path}`);
          if (!res.ok) return;
          const buf = await res.arrayBuffer();
          this._sfxBuffers[key] = await ctx.decodeAudioData(buf);
        } catch (e) {
          console.warn(`SFX load failed [${key}]:`, e.message);
        }
      })
    );
  }

  _playSfx(key, gainVal = 0.7) {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const buf = this._sfxBuffers[key];
    if (!buf) return;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = gainVal;
    src.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.scene && this.scene.sound) this.scene.sound.mute = m;
  }

  _tone(freq, durationSec, type = 'sine', gain = 0.3) {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + durationSec);
    osc.stop(ctx.currentTime + durationSec);
  }

  _sequence(freqs, interval, type = 'sine', dur = 0.15) {
    freqs.forEach((f, i) => setTimeout(() => this._tone(f, dur, type), i * interval));
  }

  diceRoll() {
    // Rattling dice — rapid noise bursts dengan pitch naik
    this._sequence([400, 550, 700, 550, 800], 55, 'square', 0.08);
  }

  ladderUp() {
    // Naik tangga — glissando ascending ceria
    this._sequence([330, 392, 494, 587, 698, 784], 70, 'sine', 0.18);
  }

  snakeDown() {
    if (this._sfxBuffers.snake) { this._playSfx('snake', 1.4); return; }
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.6);
    g.gain.setValueAtTime(0.28, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.65);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
    setTimeout(() => {
      const ctx2 = this._ensureCtx();
      if (!ctx2 || this.muted) return;
      const dur = 0.18;
      const buf = ctx2.createBuffer(1, ctx2.sampleRate * dur, ctx2.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.15));
      }
      const src = ctx2.createBufferSource();
      const gThud = ctx2.createGain();
      const filter = ctx2.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200;
      src.buffer = buf;
      gThud.gain.value = 0.5;
      src.connect(filter);
      filter.connect(gThud);
      gThud.connect(ctx2.destination);
      src.start();
    }, 580);
  }

  correctAnswer() {
    if (this._sfxBuffers.correct) { this._playSfx('correct', 0.75); return; }
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        if (this.muted) return;
        const ctx2 = this._ensureCtx();
        if (!ctx2) return;
        const osc1 = ctx2.createOscillator();
        const g1 = ctx2.createGain();
        osc1.type = 'sine';
        osc1.frequency.value = freq;
        g1.gain.setValueAtTime(0.22, ctx2.currentTime);
        g1.gain.exponentialRampToValueAtTime(0.01, ctx2.currentTime + 0.35);
        osc1.connect(g1);
        g1.connect(ctx2.destination);
        osc1.start();
        osc1.stop(ctx2.currentTime + 0.35);
        const osc2 = ctx2.createOscillator();
        const g2 = ctx2.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 2;
        g2.gain.setValueAtTime(0.08, ctx2.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.01, ctx2.currentTime + 0.25);
        osc2.connect(g2);
        g2.connect(ctx2.destination);
        osc2.start();
        osc2.stop(ctx2.currentTime + 0.25);
      }, i * 130);
    });
  }

  wrongAnswer() {
    if (this._sfxBuffers.wrong) { this._playSfx('wrong', 0.75); return; }
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const pairs = [
      { freq: 370, dur: 0.18 },
      { freq: 277, dur: 0.28 },
    ];
    let t = ctx.currentTime;
    pairs.forEach(({ freq, dur }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.01, t + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur * 0.85;
    });
  }

  win() {
    if (this._sfxBuffers.win) {
      this._playSfx('win', 0.8);
      setTimeout(() => this._playSfx('bgm_win', 0.7), 400);
      return;
    }
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const chordFreqs = [261.63, 329.63, 392.0];
    chordFreqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.18, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    });
    const arpeggioFreqs = [523.25, 659.25, 783.99, 1046.5];
    arpeggioFreqs.forEach((freq, i) => {
      const delay = 0.28 + i * 0.13;
      setTimeout(() => {
        const ctx2 = this._ensureCtx();
        if (!ctx2 || this.muted) return;
        const osc = ctx2.createOscillator();
        const g = ctx2.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.22, ctx2.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, ctx2.currentTime + 0.4);
        osc.connect(g);
        g.connect(ctx2.destination);
        osc.start();
        osc.stop(ctx2.currentTime + 0.4);

        // Sparkle: high overtone tipis
        const osc2 = ctx2.createOscillator();
        const g2 = ctx2.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 2;
        g2.gain.setValueAtTime(0.07, ctx2.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.01, ctx2.currentTime + 0.3);
        osc2.connect(g2);
        g2.connect(ctx2.destination);
        osc2.start();
        osc2.stop(ctx2.currentTime + 0.3);
      }, delay * 1000);
    });
  }

  click() {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 800;
    g.gain.value = 0.15;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc.stop(ctx.currentTime + 0.08);
  }

  step() {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    // Soft "tap" sound — short noise burst
    const dur = 0.04;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.3));
    }
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    src.buffer = buf;
    g.gain.value = 0.12;
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  // Load semua file audio fonik huruf via fetch + decodeAudioData
  async loadLetterSounds() {
    const ctx = this._ensureCtx();
    if (!ctx) return;

    const letters = 'abcdefghijklmnoprstuvwxyz';
    const variants = [1, 2];

    for (const letter of letters) {
      const buffers = [];
      for (const v of variants) {
        const url = `${import.meta.env.BASE_URL}assets/audio/letters/${letter}_${v}.mp3`;
        try {
          const response = await fetch(url);
          if (!response.ok) {
            console.warn(`Audio ${letter}_${v}: HTTP ${response.status}`);
            continue;
          }
          const contentType = response.headers.get('content-type');
          if (contentType && !contentType.includes('audio') && !contentType.includes('octet')) {
            console.warn(`Audio ${letter}_${v}: unexpected content-type: ${contentType}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          buffers.push(audioBuffer);
        } catch (e) {
          console.warn(`Gagal load fonik ${letter}_${v}:`, e.message);
        }
      }
      if (buffers.length > 0) {
        this._letterBuffers[letter] = buffers;
      }
    }
    this._loaded = true;
  }

  // Bunyi huruf — mainkan dari AudioBuffer (random variant)
  playLetter(letter) {
    if (this.muted) return;
    this.unlock();
    const buffers = this._letterBuffers[letter];
    if (!buffers || buffers.length === 0) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;

    const idx = Math.floor(Math.random() * buffers.length);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffers[idx];
    gain.gain.value = 0.8;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }

  // Bunyi fonem terpisah (untuk Seri C) — mainkan audio file berurutan
  playPhonemes(parts, { interval = 600 } = {}) {
    if (this.muted) return;
    this.unlock();
    this.stopPhonemes();
    parts.forEach((p, i) => {
      const timer = setTimeout(() => this.playLetter(p), i * interval);
      this._phonemeTimers.push(timer);
    });
  }

  stopPhonemes() {
    this._phonemeTimers.forEach(clearTimeout);
    this._phonemeTimers = [];
    // AudioBufferSource tidak bisa di-stop dari sini karena fire-and-forget
    // Tapi timer berikutnya sudah di-clear
  }

  stop() {
    this.stopPhonemes();
    this.stopBGM();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  // BGM — cheerful children's music box melody via Web Audio API
  startBGM() {
    if (this._bgmPlaying) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;

    // Pentatonic melody notes (C major pentatonic, two octaves)
    const notes = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
    // Simple cheerful pattern
    const melody = [0, 2, 4, 5, 4, 2, 0, 3, 5, 7, 5, 3, 1, 4, 6, 5];
    const bpm = 140;
    const beatDur = 60 / bpm;

    this._bgmGain = ctx.createGain();
    this._bgmGain.gain.value = this.muted ? 0 : 0.12;
    this._bgmGain.connect(ctx.destination);

    let noteIdx = 0;
    const playNext = () => {
      if (!this._bgmPlaying) return;
      const freq = notes[melody[noteIdx % melody.length]];
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      noteGain.gain.value = 0.3;
      osc.connect(noteGain);
      noteGain.connect(this._bgmGain);
      osc.start();
      noteGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + beatDur * 0.8);
      osc.stop(ctx.currentTime + beatDur * 0.9);
      noteIdx++;
      this._bgmTimer = setTimeout(playNext, beatDur * 1000);
    };

    this._bgmPlaying = true;
    playNext();
  }

  stopBGM() {
    this._bgmPlaying = false;
    if (this._bgmTimer) clearTimeout(this._bgmTimer);
    this._bgmTimer = null;
  }

  setBGMMuted(m) {
    if (this._bgmGain) this._bgmGain.gain.value = m ? 0 : 0.12;
  }

  // TTS fallback — Web Speech API (tidak lagi digunakan untuk fonik huruf)
  speak(text, { rate = 0.8, lang = 'id-ID' } = {}) {
    if (this.muted) return;
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = rate;
      window.speechSynthesis.speak(u);
    } catch (e) {
      // ignore
    }
  }
}
