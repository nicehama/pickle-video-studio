import { buildSfxParam, getSfxBuffer, paramSignature, type SfxParam } from './sfx';

const BGM_CHORDS: Record<string, { notes: number[]; type: OscillatorType; gain: number; filter: number; trem?: number }> = {
  calm: { notes: [110, 164.81, 220, 329.63], type: 'sine', gain: 0.055, filter: 900, trem: 0.14 },
  bright: { notes: [130.81, 196, 261.63, 392], type: 'triangle', gain: 0.045, filter: 1800, trem: 3.2 },
  tense: { notes: [55, 82.41, 110, 116.54], type: 'sawtooth', gain: 0.035, filter: 320, trem: 0.5 },
  cinema: { notes: [87.31, 130.81, 174.61, 261.63], type: 'sine', gain: 0.05, filter: 1200, trem: 0.25 },
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmNodes: { stop: () => void }[] = [];
  private bgmPreset: string | null = null;
  private ducked = false;
  private activeSfx: AudioBufferSourceNode[] = [];

  ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 1;
      this.bgmGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  get context() {
    return this.ctx;
  }

  get output() {
    return this.master;
  }

  setMuted(muted: boolean) {
    this.ensure();
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  /** 성우가 말하는 구간에는 BGM·효과음을 자동으로 낮춘다 */
  setDucking(on: boolean) {
    this.ducked = on;
    if (this.bgmGain && this.ctx) {
      const target = on ? 0.28 : 1;
      this.bgmGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.bgmGain.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.18);
    }
  }

  async playSfx(param: SfxParam, key: string, atTime = 0): Promise<number> {
    const ctx = this.ensure();
    if (!ctx || !this.master) return 0;
    const buffer = await getSfxBuffer(param, key);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = 1;
    src.connect(g).connect(this.master);
    const when = ctx.currentTime + Math.max(0, atTime);
    src.start(when);
    this.activeSfx.push(src);
    src.onended = () => {
      this.activeSfx = this.activeSfx.filter((s) => s !== src);
    };
    return buffer.duration;
  }

  stopSfx() {
    this.activeSfx.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* 이미 종료됨 */
      }
    });
    this.activeSfx = [];
  }

  startBgm(preset: string) {
    const ctx = this.ensure();
    if (!ctx || !this.bgmGain) return;
    if (this.bgmPreset === preset && this.bgmNodes.length) return;
    this.stopBgm();
    const cfg = BGM_CHORDS[preset] ?? BGM_CHORDS.calm;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cfg.filter;
    filter.Q.value = 0.8;
    filter.connect(this.bgmGain);
    const nodes: { stop: () => void }[] = [];
    cfg.notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = cfg.type;
      osc.frequency.value = freq;
      osc.detune.value = (i - 1) * 4;
      const g = ctx.createGain();
      g.gain.value = cfg.gain / Math.sqrt(cfg.notes.length);
      osc.connect(g).connect(filter);
      osc.start();
      nodes.push({ stop: () => osc.stop() });
    });
    if (cfg.trem) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = cfg.trem;
      lg.gain.value = 0.35;
      lfo.connect(lg).connect(filter.detune);
      lfo.start();
      nodes.push({ stop: () => lfo.stop() });
    }
    this.bgmNodes = nodes;
    this.bgmPreset = preset;
  }

  stopBgm() {
    this.bgmNodes.forEach((n) => {
      try {
        n.stop();
      } catch {
        /* noop */
      }
    });
    this.bgmNodes = [];
    this.bgmPreset = null;
  }

  /** 내보내기용 오디오 스트림 — −14 LUFS 근사 컴프레서를 거친다 */
  exportStream(compress = true): MediaStream | null {
    const ctx = this.ensure();
    if (!ctx || !this.master) return null;
    const dest = ctx.createMediaStreamDestination();
    if (compress) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      comp.knee.value = 12;
      comp.attack.value = 0.01;
      comp.release.value = 0.25;
      this.master.connect(comp).connect(dest);
    } else {
      this.master.connect(dest);
    }
    return dest.stream;
  }

  stopAll() {
    this.stopBgm();
    this.stopSfx();
  }
}

export const audioEngine = new AudioEngine();

export function sfxParamFor(category: string, emotion: string, intensity: string, variation: number) {
  return { param: buildSfxParam(category, emotion, intensity, variation), key: paramSignature(category, emotion, intensity, variation) };
}
