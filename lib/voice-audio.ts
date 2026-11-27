import { audioEngine } from './audio-engine';
import { readAudio, writeAudio } from './audio-store';
import type { VoiceSpec } from './types';

/**
 * 성우(TTS) 오디오 — /api/tts 에서 받은 실제 오디오를 디코딩해 보관한다.
 * 같은 문장·같은 설정은 IndexedDB 캐시를 재사용하므로 크레딧이 다시 나가지 않는다.
 */

export type VoiceProvider = 'elevenlabs' | 'openai' | 'browser';

export interface VoiceAudioResult {
  buffer: AudioBuffer;
  blob: Blob;
  provider: VoiceProvider;
  fromCache: boolean;
  /** 서버가 실제로 고른 음성·모델 (ElevenLabs) */
  voice?: string;
  model?: string;
}

const mem = new Map<string, AudioBuffer>();
const blobs = new Map<string, Blob>();
const providers = new Map<string, VoiceProvider>();
const pending = new Map<string, Promise<VoiceAudioResult | null>>();
let lastError = '';

export function voiceCacheKey(spec: VoiceSpec): string {
  const text = spec.text.replace(/\s+/g, ' ').trim();
  return `tts:v2|${spec.lang}|${spec.tone}|${(spec.rate || 1).toFixed(2)}|${(spec.pitch || 1).toFixed(2)}|${text}`;
}

export function lastVoiceError(): string {
  return lastError;
}

/** 이미 메모리에 올라온 버퍼 (재생 시 즉시 사용) */
export function peekVoiceBuffer(spec: VoiceSpec): AudioBuffer | undefined {
  return mem.get(voiceCacheKey(spec));
}

export function peekVoiceBlob(spec: VoiceSpec): Blob | undefined {
  return blobs.get(voiceCacheKey(spec));
}

export function voiceProviderOf(spec: VoiceSpec): VoiceProvider | undefined {
  return providers.get(voiceCacheKey(spec));
}

/** 저장해 둔 오디오를 메모리에 미리 올린다 (새로고침 후 타임라인 재생용) */
export async function preloadVoice(spec: VoiceSpec): Promise<void> {
  const key = voiceCacheKey(spec);
  if (mem.has(key)) return;
  const stored = await readAudio(key);
  if (!stored) return;
  const buffer = await audioEngine.decode(stored.blob);
  if (buffer) {
    mem.set(key, buffer);
    blobs.set(key, stored.blob);
    providers.set(key, (stored.provider as VoiceProvider) || 'elevenlabs');
  }
}

export function isVoiceCached(spec: VoiceSpec): boolean {
  return mem.has(voiceCacheKey(spec));
}

/**
 * 성우 오디오를 가져온다 — 캐시 → /api/tts → 실패 시 null(호출한 쪽이 브라우저 음성으로 폴백)
 */
export async function getVoiceAudio(spec: VoiceSpec, opts: { force?: boolean } = {}): Promise<VoiceAudioResult | null> {
  const key = voiceCacheKey(spec);
  if (!opts.force) {
    const hit = mem.get(key);
    if (hit) {
      return {
        buffer: hit,
        blob: blobs.get(key) ?? new Blob(),
        provider: providers.get(key) ?? 'elevenlabs',
        fromCache: true,
      };
    }
    const running = pending.get(key);
    if (running) return running;
  }

  const job = (async (): Promise<VoiceAudioResult | null> => {
    const ctx = audioEngine.ensure();
    if (!ctx) {
      lastError = '이 브라우저에서 오디오를 다룰 수 없습니다';
      return null;
    }

    if (!opts.force) {
      const stored = await readAudio(key);
      if (stored?.blob) {
        const buffer = await audioEngine.decode(stored.blob);
        if (buffer) {
          mem.set(key, buffer);
          blobs.set(key, stored.blob);
          providers.set(key, (stored.provider as VoiceProvider) || 'elevenlabs');
          return { buffer, blob: stored.blob, provider: providers.get(key)!, fromCache: true };
        }
      }
    }

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: spec.text, lang: spec.lang, tone: spec.tone, rate: spec.rate, pitch: spec.pitch }),
      });
      const type = res.headers.get('content-type') ?? '';
      if (!type.includes('audio')) {
        const json = (await res.json().catch(() => ({}))) as { provider?: string; error?: string; fallback?: boolean };
        lastError = json.error || (json.provider === 'browser' ? '서버에 음성 엔진 키가 없습니다' : '음성을 받지 못했습니다');
        return null;
      }
      const blob = await res.blob();
      if (!blob.size) {
        lastError = '음성 응답이 비어 있습니다';
        return null;
      }
      const buffer = await audioEngine.decode(blob);
      if (!buffer) {
        lastError = '음성 오디오를 해석하지 못했습니다';
        return null;
      }
      const provider = ((res.headers.get('x-tts-provider') as VoiceProvider) || 'elevenlabs');
      const voice = res.headers.get('x-tts-voice') ?? undefined;
      const model = res.headers.get('x-tts-model') ?? undefined;
      mem.set(key, buffer);
      blobs.set(key, blob);
      providers.set(key, provider);
      lastError = '';
      void writeAudio(key, blob, provider);
      return { buffer, blob, provider, fromCache: false, voice, model };
    } catch (err) {
      lastError = err instanceof Error ? err.message : '음성 요청 실패';
      return null;
    }
  })();

  pending.set(key, job);
  try {
    return await job;
  } finally {
    pending.delete(key);
  }
}

export function clearVoiceMemory() {
  mem.clear();
  blobs.clear();
  providers.clear();
}
