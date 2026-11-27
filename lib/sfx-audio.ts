import { audioEngine } from './audio-engine';
import { readAudio, writeAudio } from './audio-store';
import { buildSfxParam, getSfxBuffer, paramSignature } from './sfx';
import type { SfxSpec } from './types';

/**
 * 효과음 오디오 — ElevenLabs /api/sfx 를 기본으로 쓰고, 실패·한도 초과 시에만
 * Web Audio 실시간 합성으로 폴백한다. 결과는 IndexedDB에 캐시해 재사용한다.
 */

export type SfxProvider = 'elevenlabs' | 'synth';

export interface SfxAudioResult {
  buffer: AudioBuffer;
  blob?: Blob;
  provider: SfxProvider;
  fromCache: boolean;
}

const CAT_EN: Record<string, string> = {
  animal: 'animal sound',
  nature: 'nature ambience',
  life: 'household object sound',
  traffic: 'traffic sound',
  machine: 'machine sound',
  human: 'human voice texture',
  abstract: 'abstract cinematic sound design',
};

const EMO_EN: Record<string, string> = {
  happy: 'welcoming, cheerful',
  guard: 'wary, alert',
  startle: 'sudden, startled',
  tense: 'tense, suspenseful',
  calm: 'calm, gentle',
  funny: 'funny, comedic',
  sad: 'sad, mournful',
};

const INT_EN: Record<string, string> = {
  near: 'close up, loud, dry',
  mid: 'medium distance',
  far: 'distant, soft, with room',
};

const VARIATION_HINT = ['', 'slightly different performance', 'longer with natural tail', 'alternate texture and pitch'];

/** 한 줄 프롬프트 + 태그 → 효과음 생성용 문장 */
export function sfxPromptFor(spec: SfxSpec): string {
  const base = spec.prompt.trim() || 'short sound effect';
  const tags = [CAT_EN[spec.category] ?? spec.category, EMO_EN[spec.emotion] ?? spec.emotion, INT_EN[spec.intensity] ?? spec.intensity]
    .filter(Boolean)
    .join(', ');
  const hint = VARIATION_HINT[spec.variation % VARIATION_HINT.length];
  return `${base} (${tags})${hint ? `, ${hint}` : ''}`;
}

export function sfxCacheKey(spec: SfxSpec): string {
  return `sfx:v2|${spec.prompt.replace(/\s+/g, ' ').trim()}|${spec.category}|${spec.emotion}|${spec.intensity}|${spec.variation}`;
}

const mem = new Map<string, AudioBuffer>();
const providers = new Map<string, SfxProvider>();
const pending = new Map<string, Promise<SfxAudioResult>>();
let lastError = '';

export function sfxProviderOf(spec: SfxSpec): SfxProvider | undefined {
  return providers.get(sfxCacheKey(spec));
}

export function peekSfxBuffer(spec: SfxSpec): AudioBuffer | undefined {
  return mem.get(sfxCacheKey(spec));
}

export function lastSfxError(): string {
  return lastError;
}

function synthParamFor(spec: SfxSpec) {
  return buildSfxParam(spec.category, spec.emotion, spec.intensity, spec.variation);
}

function store(key: string, buffer: AudioBuffer, provider: SfxProvider) {
  mem.set(key, buffer);
  providers.set(key, provider);
}

/** 저장해 둔 효과음을 메모리에 미리 올린다 */
export async function preloadSfx(spec: SfxSpec): Promise<void> {
  const key = sfxCacheKey(spec);
  if (mem.has(key)) return;
  const stored = await readAudio(key);
  if (!stored) return;
  const buffer = await audioEngine.decode(stored.blob);
  if (buffer) store(key, buffer, (stored.provider as SfxProvider) || 'elevenlabs');
}

export function isSfxCached(spec: SfxSpec): boolean {
  return mem.has(sfxCacheKey(spec));
}

export async function getSfxAudio(spec: SfxSpec, opts: { force?: boolean } = {}): Promise<SfxAudioResult> {
  const key = sfxCacheKey(spec);
  if (!opts.force) {
    const hit = mem.get(key);
    if (hit) return { buffer: hit, provider: providers.get(key) ?? 'synth', fromCache: true };
    const running = pending.get(key);
    if (running) return running;
  }

  const job = (async (): Promise<SfxAudioResult> => {
    const param = synthParamFor(spec);

    if (!opts.force) {
      const stored = await readAudio(key);
      if (stored?.blob) {
        const buffer = await audioEngine.decode(stored.blob);
        if (buffer) {
          store(key, buffer, (stored.provider as SfxProvider) || 'elevenlabs');
          return { buffer, blob: stored.blob, provider: providers.get(key)!, fromCache: true };
        }
      }
    }

    try {
      const res = await fetch('/api/sfx', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: sfxPromptFor(spec), duration: Math.min(22, Math.max(0.5, param.duration)) }),
      });
      const type = res.headers.get('content-type') ?? '';
      if (type.includes('audio')) {
        const blob = await res.blob();
        const buffer = await audioEngine.decode(blob);
        if (buffer) {
          store(key, buffer, 'elevenlabs');
          lastError = '';
          void writeAudio(key, blob, 'elevenlabs');
          return { buffer, blob, provider: 'elevenlabs', fromCache: false };
        }
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      lastError = json.error || 'ElevenLabs 효과음을 받지 못했습니다';
    } catch (err) {
      lastError = err instanceof Error ? err.message : '효과음 요청 실패';
    }

    // 폴백: Web Audio 합성
    const buffer = await getSfxBuffer(param, paramSignature(spec.category, spec.emotion, spec.intensity, spec.variation));
    store(key, buffer, 'synth');
    return { buffer, provider: 'synth', fromCache: false };
  })();

  pending.set(key, job);
  try {
    return await job;
  } finally {
    pending.delete(key);
  }
}

export function clearSfxMemory() {
  mem.clear();
  providers.clear();
}
