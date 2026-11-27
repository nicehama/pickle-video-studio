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
  private voiceSources: AudioBufferSourceNode[] = [];
  private element: HTMLAudioElement | null = null;
  private unlocked = false;
  private silentUrl: string | null = null;

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

  /** Safari의 'interrupted'(전화 수신 등)도 그대로 돌려준다 */
  get state(): string {
    return this.ctx ? this.ctx.state : 'none';
  }

  get output() {
    return this.master;
  }

  /**
   * iOS Safari·인앱 브라우저 오디오 잠금 해제.
   * 반드시 사용자의 클릭(탭) 핸들러 안에서 동기적으로 호출해야 한다.
   * fetch·await 뒤에는 제스처로 인정되지 않으므로, 화면 조작 직후 즉시 부른다.
   */
  syncUnlock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      if (ctx.state !== 'running') void ctx.resume();
    } catch {
      /* noop */
    }
    // 무음 버퍼를 한 번 재생해 컨텍스트를 깨운다 (iOS)
    try {
      const buf = ctx.createBuffer(1, Math.max(1, Math.round(ctx.sampleRate * 0.03)), ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.master ?? ctx.destination);
      src.start(0);
    } catch {
      /* noop */
    }
    // <audio> 요소 경로도 함께 열어 둔다 (인앱 브라우저가 Web Audio를 막는 경우 대비)
    if (!this.unlocked) {
      this.unlocked = true;
      try {
        if (!this.silentUrl) this.silentUrl = silentWavUrl(0.05);
        const el = new Audio(this.silentUrl);
        el.volume = 0.001;
        el.setAttribute('playsinline', 'true');
        (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
        const p = el.play();
        if (p && typeof p.then === 'function') {
          void p.then(() => {
            el.pause();
          }).catch(() => {});
        }
      } catch {
        /* noop */
      }
    }
  }

  async decode(data: Blob | ArrayBuffer): Promise<AudioBuffer | null> {
    const ctx = this.ensure();
    if (!ctx) return null;
    try {
      const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
      if (!buffer.byteLength) return null;
      return await new Promise<AudioBuffer | null>((resolve) => {
        // 콜백형과 프라미스형 모두 지원 (Safari)
        const ret = ctx.decodeAudioData(
          buffer.slice(0),
          (b) => resolve(b),
          () => resolve(null),
        );
        if (ret && typeof (ret as Promise<AudioBuffer>).then === 'function') {
          (ret as Promise<AudioBuffer>).then((b) => resolve(b)).catch(() => resolve(null));
        }
      });
    } catch {
      return null;
    }
  }

  /** 이미 디코딩된 버퍼를 마스터에 이어 재생한다 */
  playBuffer(
    buffer: AudioBuffer,
    opts: { atTime?: number; atWhen?: number; volume?: number; offset?: number; kind?: 'voice' | 'sfx' | 'other' } = {},
  ): number {
    const ctx = this.ensure();
    if (!ctx || !this.master) return 0;
    if (ctx.state === 'suspended') void ctx.resume();
    const { atTime = 0, atWhen, volume = 1, offset = 0, kind = 'other' } = opts;
    const off = Math.max(0, Math.min(offset, Math.max(0, buffer.duration - 0.02)));
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = Math.max(0, Math.min(1.5, volume));
    src.connect(g).connect(this.master);
    const when = atWhen ?? ctx.currentTime + Math.max(0, atTime);
    try {
      src.start(when, off);
    } catch {
      return 0;
    }
    const list = kind === 'voice' ? this.voiceSources : this.activeSfx;
    list.push(src);
    src.onended = () => {
      const i = list.indexOf(src);
      if (i >= 0) list.splice(i, 1);
    };
    return Math.max(0, buffer.duration - off);
  }

  /** <audio> 요소로 재생 — Web Audio가 막힌 인앱 브라우저의 마지막 수단 */
  async playBlobElement(blob: Blob, volume = 1): Promise<boolean> {
    try {
      this.stopElement();
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      el.volume = Math.max(0, Math.min(1, volume));
      el.setAttribute('playsinline', 'true');
      (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      this.element = el;
      el.onended = () => {
        URL.revokeObjectURL(url);
        if (this.element === el) this.element = null;
      };
      await el.play();
      return true;
    } catch {
      return false;
    }
  }

  stopElement() {
    if (this.element) {
      try {
        this.element.pause();
      } catch {
        /* noop */
      }
      this.element = null;
    }
  }

  stopVoice() {
    this.voiceSources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* 이미 종료됨 */
      }
    });
    this.voiceSources = [];
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
    this.stopVoice();
    this.stopElement();
  }
}

/** 아주 짧은 무음 WAV — iOS에서 <audio> 요소 잠금을 풀 때 쓴다 */
function silentWavUrl(seconds: number): string {
  const rate = 8000;
  const samples = Math.max(1, Math.round(rate * seconds));
  const dataSize = samples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, dataSize, true);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

export const audioEngine = new AudioEngine();

export function sfxParamFor(category: string, emotion: string, intensity: string, variation: number) {
  return { param: buildSfxParam(category, emotion, intensity, variation), key: paramSignature(category, emotion, intensity, variation) };
}
