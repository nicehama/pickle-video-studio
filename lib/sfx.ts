import { SFX_INTENSITIES } from './data';

export interface SfxLayer {
  kind: 'noise' | 'sine' | 'sawtooth' | 'square' | 'triangle';
  gain: number;
  attack: number;
  decay: number;
  freq: number;
  freqEnd?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number; freqEnd?: number };
  tremolo?: { rate: number; depth: number };
  delay?: number;
}

export interface SfxParam {
  duration: number;
  layers: SfxLayer[];
}

/* 결정적 난수 — 같은 태그·변주는 항상 같은 소리 */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 카테고리 × 감정 × 강도/거리 → 합성 파라미터.
 * variation(0~3)마다 주파수·디튠·엔벨로프를 조금씩 흔들어 '다중 변주'를 만든다.
 */
export function buildSfxParam(category: string, emotion: string, intensity: string, variation: number): SfxParam {
  const rnd = mulberry32(hashStr(`${category}|${emotion}|${variation}`));
  const inten = SFX_INTENSITIES.find((i) => i.id === intensity) ?? SFX_INTENSITIES[1];
  const distant = inten.distance;
  const g = inten.gain;
  const jitter = (base: number, amt: number) => base * (1 + (rnd() - 0.5) * amt);
  const layers: SfxLayer[] = [];
  let duration = 0.9;

  const key = `${category}/${emotion}`;
  switch (key) {
    case 'animal/happy': {
      duration = 0.75;
      const base = jitter(820, 0.12);
      for (let i = 0; i < 2; i++) {
        layers.push({
          kind: 'noise',
          gain: 0.9 * (i ? 0.75 : 1),
          attack: 0.004,
          decay: 0.11,
          freq: 1,
          filter: { type: 'bandpass', freq: base, q: 1.3 },
          delay: i * (0.15 + rnd() * 0.05),
        });
        layers.push({
          kind: 'sine',
          gain: 0.35,
          attack: 0.003,
          decay: 0.12,
          freq: jitter(300, 0.15),
          freqEnd: 170,
          delay: i * 0.15,
        });
      }
      break;
    }
    case 'animal/guard': {
      duration = 1.5;
      const f = jitter(86, 0.1);
      layers.push({ kind: 'sawtooth', gain: 0.42, attack: 0.06, decay: 1.3, freq: f, filter: { type: 'lowpass', freq: 460, q: 5 }, tremolo: { rate: 21 + rnd() * 6, depth: 0.55 } });
      layers.push({ kind: 'noise', gain: 0.22, attack: 0.1, decay: 1.2, freq: 1, filter: { type: 'lowpass', freq: 320, q: 1 } });
      break;
    }
    case 'animal/startle': {
      duration = 0.45;
      layers.push({ kind: 'square', gain: 0.3, attack: 0.003, decay: 0.18, freq: jitter(560, 0.2), freqEnd: 900 });
      layers.push({ kind: 'noise', gain: 0.5, attack: 0.002, decay: 0.07, freq: 1, filter: { type: 'bandpass', freq: 1900, q: 0.9 } });
      break;
    }
    case 'animal/sad': {
      duration = 1.1;
      layers.push({ kind: 'sine', gain: 0.4, attack: 0.08, decay: 0.95, freq: jitter(640, 0.1), freqEnd: 360, tremolo: { rate: 5.5, depth: 0.28 } });
      break;
    }
    case 'nature/calm': {
      duration = 2.4;
      layers.push({ kind: 'noise', gain: 0.4, attack: 0.6, decay: 1.7, freq: 1, filter: { type: 'lowpass', freq: jitter(2200, 0.2), q: 0.7 }, tremolo: { rate: 0.4, depth: 0.2 } });
      break;
    }
    case 'nature/tense': {
      duration = 2.0;
      layers.push({ kind: 'noise', gain: 0.35, attack: 0.3, decay: 1.6, freq: 1, filter: { type: 'bandpass', freq: 480, freqEnd: jitter(1000, 0.2), q: 3.2 }, tremolo: { rate: 0.9, depth: 0.35 } });
      break;
    }
    case 'life/startle': {
      duration = 0.55;
      layers.push({ kind: 'sine', gain: 0.42, attack: 0.002, decay: 0.28, freq: jitter(2300, 0.15) });
      layers.push({ kind: 'sine', gain: 0.2, attack: 0.002, decay: 0.18, freq: jitter(3300, 0.12) });
      layers.push({ kind: 'noise', gain: 0.4, attack: 0.001, decay: 0.05, freq: 1, filter: { type: 'highpass', freq: 3000, q: 0.7 } });
      break;
    }
    case 'life/happy': {
      duration = 0.9;
      layers.push({ kind: 'sine', gain: 0.35, attack: 0.004, decay: 0.8, freq: jitter(1240, 0.08), tremolo: { rate: 3.2, depth: 0.15 } });
      layers.push({ kind: 'sine', gain: 0.18, attack: 0.004, decay: 0.6, freq: jitter(1860, 0.08) });
      break;
    }
    case 'life/funny': {
      duration = 0.7;
      layers.push({ kind: 'triangle', gain: 0.35, attack: 0.005, decay: 0.6, freq: jitter(320, 0.15), freqEnd: 760, tremolo: { rate: 11, depth: 0.4 } });
      break;
    }
    case 'traffic/tense': {
      duration = 1.3;
      layers.push({ kind: 'sawtooth', gain: 0.26, attack: 0.02, decay: 1.1, freq: jitter(1450, 0.1), freqEnd: 860, filter: { type: 'bandpass', freq: 1500, q: 4 } });
      layers.push({ kind: 'noise', gain: 0.25, attack: 0.01, decay: 0.9, freq: 1, filter: { type: 'lowpass', freq: 1400, q: 0.7 } });
      break;
    }
    case 'machine/tense': {
      duration = 1.8;
      const f = jitter(57, 0.06);
      layers.push({ kind: 'sawtooth', gain: 0.34, attack: 0.12, decay: 1.5, freq: f, filter: { type: 'lowpass', freq: 520, q: 6 }, tremolo: { rate: 7.5 + rnd() * 3, depth: 0.28 } });
      layers.push({ kind: 'sawtooth', gain: 0.18, attack: 0.1, decay: 1.5, freq: f * 2.01 });
      layers.push({ kind: 'noise', gain: 0.14, attack: 0.2, decay: 1.4, freq: 1, filter: { type: 'bandpass', freq: 900, q: 1.4 } });
      break;
    }
    case 'machine/calm': {
      duration = 2.2;
      layers.push({ kind: 'noise', gain: 0.3, attack: 0.35, decay: 1.7, freq: 1, filter: { type: 'bandpass', freq: jitter(760, 0.15), q: 1.6 }, tremolo: { rate: 1.2, depth: 0.15 } });
      break;
    }
    case 'human/sad': {
      duration = 1.4;
      layers.push({ kind: 'noise', gain: 0.3, attack: 0.2, decay: 1.1, freq: 1, filter: { type: 'bandpass', freq: 700, freqEnd: 380, q: 1.1 }, tremolo: { rate: 2.4, depth: 0.2 } });
      break;
    }
    case 'human/happy': {
      duration = 1.1;
      for (let i = 0; i < 4; i++) {
        layers.push({ kind: 'noise', gain: 0.25, attack: 0.01, decay: 0.12, freq: 1, filter: { type: 'bandpass', freq: 900 + rnd() * 300, q: 1.8 }, delay: i * 0.17 });
      }
      break;
    }
    case 'abstract/tense': {
      duration = 1.4;
      layers.push({ kind: 'sawtooth', gain: 0.28, attack: 0.8, decay: 0.5, freq: 180, freqEnd: jitter(2100, 0.15), filter: { type: 'lowpass', freq: 400, freqEnd: 4000 } });
      layers.push({ kind: 'noise', gain: 0.22, attack: 1.0, decay: 0.3, freq: 1, filter: { type: 'highpass', freq: 800, freqEnd: 6000 } });
      break;
    }
    case 'abstract/startle': {
      duration = 0.8;
      layers.push({ kind: 'sine', gain: 0.6, attack: 0.002, decay: 0.6, freq: 92, freqEnd: 38 });
      layers.push({ kind: 'noise', gain: 0.3, attack: 0.002, decay: 0.12, freq: 1, filter: { type: 'lowpass', freq: 2600, q: 0.7 } });
      break;
    }
    default: {
      duration = 0.8;
      layers.push({ kind: 'noise', gain: 0.3, attack: 0.01, decay: 0.4, freq: 1, filter: { type: 'bandpass', freq: 1200, q: 1 } });
      layers.push({ kind: 'sine', gain: 0.2, attack: 0.004, decay: 0.3, freq: 240, freqEnd: 180 });
    }
  }

  // 거리감: 멀수록 저역 위주 + 짧은 잔향 한 겹
  const out = layers.map((l) => {
    const filter = l.filter
      ? {
          ...l.filter,
          freq: clamp(l.filter.freq * (1 - distant * 0.55), 60, 12000),
          ...(l.filter.freqEnd ? { freqEnd: l.filter.freqEnd * (1 - distant * 0.55) } : {}),
        }
      : undefined;
    return { ...l, gain: l.gain * g * (1 - distant * 0.35), filter };
  });

  if (distant > 0.3) {
    out.push({
      kind: 'noise',
      gain: 0.08 * g,
      attack: 0.08,
      decay: Math.min(duration, 0.9),
      freq: 1,
      filter: { type: 'bandpass', freq: 700, q: 0.9 },
      delay: 0.09 + rnd() * 0.05,
    });
  }

  const total = Math.max(duration, ...out.map((l) => (l.delay ?? 0) + l.attack + l.decay));
  return { duration: Math.min(total + 0.05, 3.2), layers: out };
}

export function paramSignature(category: string, emotion: string, intensity: string, variation: number) {
  return `${category}|${emotion}|${intensity}|${variation}`;
}

/* --------------------------------------------------------------- */
/* 오프라인 렌더 — 파형 그리기와 재생에 같은 버퍼를 쓴다             */
/* --------------------------------------------------------------- */
const bufferCache = new Map<string, AudioBuffer>();

function makeNoiseBuffer(ctx: BaseAudioContext, seconds: number) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function scheduleLayers(
  ctx: BaseAudioContext,
  dest: AudioNode,
  param: SfxParam,
  startAt: number,
  dry = 1,
) {
  const noise = makeNoiseBuffer(ctx, param.duration + 0.2);
  for (const l of param.layers) {
    const t0 = startAt + (l.delay ?? 0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, l.gain * dry), t0 + Math.max(0.002, l.attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.01, l.attack + l.decay));

    let tail: AudioNode = g;
    if (l.tremolo) {
      const trem = ctx.createGain();
      trem.gain.value = 1 - l.tremolo.depth / 2;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = l.tremolo.rate;
      lfoGain.gain.value = l.tremolo.depth / 2;
      lfo.connect(lfoGain).connect(trem.gain);
      lfo.start(t0);
      lfo.stop(t0 + l.attack + l.decay + 0.1);
      tail.connect(trem);
      tail = trem;
    }

    if (l.filter) {
      const f = ctx.createBiquadFilter();
      f.type = l.filter.type;
      f.frequency.setValueAtTime(l.filter.freq, t0);
      if (l.filter.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(30, l.filter.freqEnd), t0 + l.attack + l.decay);
      f.Q.value = l.filter.q ?? 1;
      tail.connect(f);
      tail = f;
    }

    tail.connect(dest);

    if (l.kind === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.connect(g);
      src.start(t0);
      src.stop(t0 + l.attack + l.decay + 0.05);
    } else {
      const osc = ctx.createOscillator();
      osc.type = l.kind;
      osc.frequency.setValueAtTime(l.freq, t0);
      if (l.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, l.freqEnd), t0 + l.attack + l.decay);
      osc.connect(g);
      osc.start(t0);
      osc.stop(t0 + l.attack + l.decay + 0.05);
    }
  }
}

export async function renderSfx(param: SfxParam, sampleRate = 44100): Promise<AudioBuffer> {
  const seconds = param.duration;
  const Ctor: typeof OfflineAudioContext =
    (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new Ctor(1, Math.max(1, Math.ceil(seconds * sampleRate)), sampleRate);
  scheduleLayers(ctx, ctx.destination, param, 0);
  return await ctx.startRendering();
}

export function getSfxBuffer(param: SfxParam, key: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(key);
  if (cached) return Promise.resolve(cached);
  return renderSfx(param).then((b) => {
    bufferCache.set(key, b);
    return b;
  });
}

/** @deprecated 개발용 — 서버 렌더 없이 파형 높이만 필요할 때 */
export function previewWaveform(seedKey: string, bars = 32): number[] {
  const rnd = mulberry32(hashStr(seedKey));
  return Array.from({ length: bars }, (_, i) => {
    const env = Math.sin((i / bars) * Math.PI * 0.9 + 0.2) ** 0.7;
    return Math.max(0.08, Math.min(1, env * (0.45 + rnd() * 0.7)));
  });
}
