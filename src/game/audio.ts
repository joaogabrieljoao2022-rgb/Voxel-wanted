export class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Continuous nodes
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private driftSource: AudioBufferSourceNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;
  private driftGain: GainNode | null = null;

  private sirenOsc: OscillatorNode | null = null;
  private sirenLfo: OscillatorNode | null = null;
  private sirenLfoGain: GainNode | null = null;
  private sirenGain: GainNode | null = null;

  private heliSource: AudioBufferSourceNode | null = null;
  private heliLfo: OscillatorNode | null = null;
  private heliLfoGain: GainNode | null = null;
  private heliGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private loopsActive = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        mute ? 0 : 0.55,
        this.ctx.currentTime,
        0.04,
      );
    }
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.55;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx, 2.0);
      this.setupContinuousLoops();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private setupContinuousLoops(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    // 1. Engine rumble
    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 55;

    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'triangle';
    this.engineOsc2.frequency.value = 110;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 260;
    this.engineFilter.Q.value = 2.0;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOsc1.start();
    this.engineOsc2.start();

    // 2. Tire screech / drift noise
    this.driftSource = this.ctx.createBufferSource();
    this.driftSource.buffer = this.noiseBuffer;
    this.driftSource.loop = true;

    this.driftFilter = this.ctx.createBiquadFilter();
    this.driftFilter.type = 'bandpass';
    this.driftFilter.frequency.value = 1350;
    this.driftFilter.Q.value = 4.2;

    this.driftGain = this.ctx.createGain();
    this.driftGain.gain.value = 0;

    this.driftSource.connect(this.driftFilter);
    this.driftFilter.connect(this.driftGain);
    this.driftGain.connect(this.masterGain);
    this.driftSource.start();

    // 3. Police siren (wail modulated by LFO)
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 690;

    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'sine';
    this.sirenLfo.frequency.value = 1.6;

    this.sirenLfoGain = this.ctx.createGain();
    this.sirenLfoGain.gain.value = 230;

    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;

    this.sirenLfo.connect(this.sirenLfoGain);
    this.sirenLfoGain.connect(this.sirenOsc.frequency);
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.masterGain);

    this.sirenLfo.start();
    this.sirenOsc.start();

    // 4. Helicopter rotor chop
    this.heliSource = this.ctx.createBufferSource();
    this.heliSource.buffer = this.noiseBuffer;
    this.heliSource.loop = true;

    const heliFilter = this.ctx.createBiquadFilter();
    heliFilter.type = 'lowpass';
    heliFilter.frequency.value = 340;

    this.heliGain = this.ctx.createGain();
    this.heliGain.gain.value = 0;

    this.heliLfo = this.ctx.createOscillator();
    this.heliLfo.type = 'sine';
    this.heliLfo.frequency.value = 13.5;

    this.heliLfoGain = this.ctx.createGain();
    this.heliLfoGain.gain.value = 0.04;

    this.heliSource.connect(heliFilter);
    heliFilter.connect(this.heliGain);
    this.heliLfo.connect(this.heliLfoGain);
    this.heliLfoGain.connect(this.heliGain.gain);
    this.heliGain.connect(this.masterGain);

    this.heliSource.start();
    this.heliLfo.start();
  }

  public updateLoops(params: {
    active: boolean;
    speedRatio: number; // 0..1.3
    driftIntensity: number; // 0..1
    nearestPoliceDist: number;
    hasHelicopter: boolean;
  }): void {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;

    if (!params.active) {
      if (this.loopsActive) {
        this.engineGain.gain.setTargetAtTime(0, t, 0.05);
        this.driftGain?.gain.setTargetAtTime(0, t, 0.04);
        this.sirenGain?.gain.setTargetAtTime(0, t, 0.06);
        this.heliGain?.gain.setTargetAtTime(0, t, 0.06);
        this.loopsActive = false;
      }
      return;
    }

    this.loopsActive = true;
    const sr = Math.max(0, Math.min(1.4, params.speedRatio));
    const baseFreq = 48 + sr * 82;
    this.engineOsc1?.frequency.setTargetAtTime(baseFreq, t, 0.05);
    this.engineOsc2?.frequency.setTargetAtTime(baseFreq * 1.98, t, 0.05);
    this.engineFilter?.frequency.setTargetAtTime(220 + sr * 680, t, 0.06);
    this.engineGain.gain.setTargetAtTime(0.08 + sr * 0.07, t, 0.06);

    const driftVal = Math.max(0, Math.min(1, params.driftIntensity));
    this.driftGain?.gain.setTargetAtTime(driftVal * 0.13, t, 0.04);
    this.driftFilter?.frequency.setTargetAtTime(1150 + driftVal * 480, t, 0.04);

    // Siren attenuation by nearest police distance
    const dist = params.nearestPoliceDist;
    const sirenVol =
      dist < 95 ? Math.max(0.008, (1 - dist / 95) * 0.095) : 0;
    this.sirenGain?.gain.setTargetAtTime(sirenVol, t, 0.12);

    this.heliGain?.gain.setTargetAtTime(params.hasHelicopter ? 0.08 : 0, t, 0.15);
  }

  public playCash(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const freqs = [659.25, 987.77, 1318.5];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t + idx * 0.04);
      gain.gain.setValueAtTime(0.0001, t + idx * 0.04);
      gain.gain.linearRampToValueAtTime(0.18, t + idx * 0.04 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.04 + 0.16);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + idx * 0.04);
      osc.stop(t + idx * 0.04 + 0.18);
    });
  }

  public playSmash(intensity = 0.7): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(850 + Math.random() * 450, t);
    filter.Q.value = 1.6;

    const gain = this.ctx.createGain();
    const vol = Math.min(0.32, 0.14 + intensity * 0.16);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.17);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(t, Math.random() * 0.5, 0.18);
  }

  public playCrash(intensity = 0.8): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140 + intensity * 40, t);
    osc.frequency.exponentialRampToValueAtTime(36, t + 0.22);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.45, 0.18 + intensity * 0.22), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.25);

    this.playSmash(intensity);
  }

  public playExplosion(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const t = this.ctx.currentTime;

    // Sub-bass boom
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(125, t);
    osc.frequency.exponentialRampToValueAtTime(24, t + 0.55);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.42, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.58);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.6);

    // Filtered explosion noise burst
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + 0.6);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.45, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.62);

    src.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    src.start(t, 0, 0.64);
  }

  public playRampLaunch(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.22);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  public playSplash(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(280, t + 0.45);
    filter.Q.value = 1.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.36, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.48);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(t, 0, 0.5);
  }

  public playStarUp(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const notes = [440, 587.33];
    notes.forEach((n, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(n, t + i * 0.09);
      gain.gain.setValueAtTime(0.09, t + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.16);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.18);
    });
  }

  public playAchievement(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n, t + i * 0.065);
      gain.gain.setValueAtTime(0.0001, t + i * 0.065);
      gain.gain.linearRampToValueAtTime(0.16, t + i * 0.065 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.065 + 0.24);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + i * 0.065);
      osc.stop(t + i * 0.065 + 0.26);
    });
  }

  public playGunshot(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, t);
    filter.Q.value = 1.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(t, Math.random() * 0.4, 0.1);
  }

  public playTankShot(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(165, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + 0.26);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.32, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.3);

    this.playSmash(0.85);
  }

  public playRepair(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t + idx * 0.045);
      gain.gain.setValueAtTime(0.0001, t + idx * 0.045);
      gain.gain.linearRampToValueAtTime(0.16, t + idx * 0.045 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.045 + 0.18);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + idx * 0.045);
      osc.stop(t + idx * 0.045 + 0.2);
    });
  }

  public playPowerUp(kind: 'shield' | 'turbo'): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const notes =
      kind === 'shield' ? [440, 659.25, 880, 1174.66] : [330, 493.88, 740, 987.77];
    notes.forEach((f, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = kind === 'shield' ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(f, t + idx * 0.038);
      gain.gain.setValueAtTime(0.0001, t + idx * 0.038);
      gain.gain.linearRampToValueAtTime(kind === 'shield' ? 0.17 : 0.12, t + idx * 0.038 + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.038 + 0.22);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + idx * 0.038);
      osc.stop(t + idx * 0.038 + 0.24);
    });
  }

  public playLevelUp(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t + idx * 0.055);
      gain.gain.setValueAtTime(0.0001, t + idx * 0.055);
      gain.gain.linearRampToValueAtTime(0.18, t + idx * 0.055 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.055 + 0.26);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + idx * 0.055);
      osc.stop(t + idx * 0.055 + 0.28);
    });
  }

  public dispose(): void {
    this.updateLoops({
      active: false,
      speedRatio: 0,
      driftIntensity: 0,
      nearestPoliceDist: 999,
      hasHelicopter: false,
    });
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
