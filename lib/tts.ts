import { VOICE_LANG, toneById } from './data';
import type { Lang, Tone, VoiceSpec } from './types';

export interface SpeakOptions {
  lang: Lang;
  rate: number;
  pitch: number;
  volume: number;
  voiceURI?: string;
}

const PAUSE_TOKEN = /<(\d+(?:\.\d+)?)s>/g;

export function hasKorean(text: string) {
  return /[가-힣]/.test(text);
}

/** 대략적인 발화 길이(초) — 타임라인 클립 길이 산정과 싱크 안내에 쓴다 */
export function estimateDuration(text: string, rate = 1, lang: Lang = 'ko'): number {
  const clean = text.replace(PAUSE_TOKEN, ' ').trim();
  if (!clean) return 0.6;
  let seconds: number;
  if (lang === 'ko') {
    seconds = clean.replace(/\s+/g, '').length / 4.4;
  } else if (lang === 'ja') {
    seconds = clean.replace(/\s+/g, '').length / 5.2;
  } else {
    const words = clean.split(/\s+/).filter(Boolean).length;
    seconds = words / 2.55;
  }
  const pauses = [...text.matchAll(PAUSE_TOKEN)].reduce((a, m) => a + Number(m[1]), 0);
  const naturalPauses = (text.match(/[,，、]/g)?.length ?? 0) * 0.18 + (text.match(/[.!?。！？]/g)?.length ?? 0) * 0.12;
  return Math.max(0.6, seconds / Math.max(0.5, rate) + pauses + naturalPauses);
}

export function pickVoice(lang: Lang, voiceURI?: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voiceURI) {
    const exact = voices.find((v) => v.voiceURI === voiceURI);
    if (exact) return exact;
  }
  const tag = VOICE_LANG[lang].slice(0, 2);
  const same = voices.filter((v) => v.lang.toLowerCase().startsWith(tag));
  if (!same.length) return null;
  const preferred = same.find((v) => /Google|Natural|Neural|Yuna|Sora|Haruka|Paulina/i.test(v.name));
  return preferred ?? same[0];
}

export function listVoices(lang: Lang) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const tag = VOICE_LANG[lang].slice(0, 2);
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(tag));
}

interface Segment {
  text: string;
  pauseAfter: number;
}

/** `<0.5s>` 토큰과 문장부호를 쉼으로 나눠 호흡 있는 낭독을 만든다 */
export function splitSegments(text: string, basePause = 0.35): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  const parts = text.split(PAUSE_TOKEN);
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    if (i % 2 === 1) {
      segments.push({ text: '', pauseAfter: Number(raw) });
      continue;
    }
    let buf = '';
    const tokens = raw.split(/(?<=[.!?。！？,])\s*/);
    for (const tok of tokens) {
      if (!tok.trim()) continue;
      buf += tok;
      if (/[.!?。！？]$/.test(tok)) {
        segments.push({ text: buf.trim(), pauseAfter: basePause + 0.15 });
        buf = '';
      } else if (/,$/.test(tok)) {
        segments.push({ text: buf.trim(), pauseAfter: basePause * 0.55 });
        buf = '';
      }
    }
    if (buf.trim()) segments.push({ text: buf.trim(), pauseAfter: basePause });
    cursor += raw.length;
  }
  return segments.filter((s, i) => s.text || (i > 0 && s.pauseAfter > 0));
}

export interface SpeakHandle {
  cancel: () => void;
  done: Promise<void>;
}

/**
 * 브라우저 Web Speech API로 호흡·쉼표를 살려 낭독한다.
 * (SSML은 브라우저에서 지원되지 않으므로 문장을 나눠 사이에 실제 침묵을 넣는다)
 */
export function speak(text: string, opts: SpeakOptions): SpeakHandle {
  let cancelled = false;
  const timers: number[] = [];
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { cancel: () => {}, done: Promise.resolve() };
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = pickVoice(opts.lang, opts.voiceURI);

  const done = new Promise<void>((resolve) => {
    const segments = splitSegments(text, 0.3);
    let index = 0;
    const next = () => {
      if (cancelled || index >= segments.length) {
        resolve();
        return;
      }
      const seg = segments[index++];
      if (!seg.text) {
        const t = window.setTimeout(next, seg.pauseAfter * 1000);
        timers.push(t);
        return;
      }
      const u = new SpeechSynthesisUtterance(seg.text);
      u.lang = VOICE_LANG[opts.lang];
      u.rate = opts.rate;
      u.pitch = opts.pitch;
      u.volume = opts.volume;
      if (voice) u.voice = voice;
      u.onend = () => {
        const t = window.setTimeout(next, seg.pauseAfter * 1000);
        timers.push(t);
      };
      u.onerror = () => {
        const t = window.setTimeout(next, 120);
        timers.push(t);
      };
      synth.speak(u);
    };
    next();
  });

  return {
    cancel: () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      window.speechSynthesis.cancel();
    },
    done,
  };
}

export function voiceFromTone(text: string, lang: Lang, tone: Tone, overrides?: Partial<VoiceSpec>): VoiceSpec {
  const p = toneById(tone);
  return {
    text,
    lang,
    tone,
    rate: p.rate,
    pitch: p.pitch,
    volume: p.volume,
    ...overrides,
  };
}
