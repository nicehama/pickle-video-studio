import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Provider = 'elevenlabs' | 'openai' | 'browser';

function provider(): Provider {
  if (process.env.ELEVENLABS_API_KEY) return 'elevenlabs';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'browser';
}

/* ------------------------------------------------------------------ */
/* ElevenLabs 클라이언트 — 402(음성 제한/한도)·422(파라미터)를 구분해   */
/* 다른 음성·모델로 자동 재시도한다. 실패 사유는 응답에 그대로 남긴다. */
/* ------------------------------------------------------------------ */

interface ElevenVoice {
  id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
}

let voiceCache: { at: number; voices: ElevenVoice[] } | null = null;
/** 한 번 성공한 음성은 기억해 두고 다음 요청부터 먼저 쓴다 */
let lastGoodVoice: string | null = null;

async function elevenVoices(key: string): Promise<ElevenVoice[]> {
  if (voiceCache && Date.now() - voiceCache.at < 5 * 60_000) return voiceCache.voices;
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key }, cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as { voices?: { voice_id: string; name: string; category?: string; labels?: Record<string, string> }[] };
    const voices = (json.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category, labels: v.labels }));
    voiceCache = { at: Date.now(), voices };
    return voices;
  } catch {
    return [];
  }
}

/**
 * 기본 음성 — 이 계정(무료 플랜)에서 실제로 동작하고 나레이션에 맞는 음성.
 * (기존 기본값 21m00Tcm4TlvDq8ikWAM 'Rachel'은 라이브러리 음성이라 무료 플랜 API에서 402가 났다)
 */
const DEFAULT_VOICE = 'onwK4e9ZLuTAKqWW03F9';
const FALLBACK_VOICES = [DEFAULT_VOICE, 'pNInz6obpgDQGcFmaJgB', 'EXAVITQu4vr4xnSDxMaL', 'JBFqnCBsd6RMkjVDRZzb', 'hpp4J3VqNfWAUOO0d1Us'];
const MODEL_CHAIN = ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'];

const TONE_SETTINGS: Record<string, { stability: number; similarity_boost: number; style: number }> = {
  calm: { stability: 0.62, similarity_boost: 0.75, style: 0.12 },
  bright: { stability: 0.36, similarity_boost: 0.8, style: 0.5 },
  doc: { stability: 0.56, similarity_boost: 0.8, style: 0.22 },
  shorts: { stability: 0.3, similarity_boost: 0.85, style: 0.62 },
};

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

async function errorText(res: Response) {
  try {
    const j = (await res.json()) as { detail?: unknown };
    const d = j?.detail;
    if (typeof d === 'string') return d;
    if (d && typeof d === 'object') {
      const o = d as { message?: string; status?: string; code?: string };
      return [o.status, o.code, o.message].filter(Boolean).join(': ') || JSON.stringify(d).slice(0, 240);
    }
    return JSON.stringify(j).slice(0, 240);
  } catch {
    try {
      return (await res.text()).slice(0, 240);
    } catch {
      return '';
    }
  }
}

/** 한도/결제 문제는 다른 음성으로 재시도해도 같으므로 즉시 포기한다 */
function isBilling(err: string) {
  return /quota|credit|payment|subscription|billing|limit/i.test(err);
}

interface Attempt {
  voice: string;
  model: string;
  body: Record<string, unknown>;
}

async function elevenRequest(key: string, voice: string, model: string, body: Record<string, unknown>) {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ ...body, model_id: model }),
    cache: 'no-store',
  });
}

async function synthesizeEleven(key: string, req: { text: string; lang: string; tone: string; rate: number; pitch: number; voiceId?: string }) {
  const voices = await elevenVoices(key);
  const premade = voices.filter((v) => v.category === 'premade');
  const koreanish = premade.filter((v) => /ko/i.test(v.labels?.language ?? '') || /yuna|sora|jini|mina|korean|한국/i.test(v.name));
  const ordered: string[] = [];
  const push = (id?: string) => {
    if (id && !ordered.includes(id)) ordered.push(id);
  };
  push(req.voiceId);
  push(process.env.ELEVENLABS_VOICE_ID);
  push(lastGoodVoice ?? undefined);
  push(DEFAULT_VOICE);
  koreanish.forEach((v) => push(v.id));
  premade.forEach((v) => push(v.id));
  voices.forEach((v) => push(v.id));
  FALLBACK_VOICES.forEach((v) => push(v));

  const settings = TONE_SETTINGS[req.tone] ?? TONE_SETTINGS.calm;
  const base = {
    text: req.text,
    voice_settings: { ...settings, use_speaker_boost: true, speed: clamp(req.rate || 1, 0.7, 1.2) },
  };

  const attempts: Attempt[] = [];
  ordered.slice(0, 3).forEach((voice) => attempts.push({ voice, model: MODEL_CHAIN[0], body: base }));
  ordered.slice(0, 1).forEach((voice) => MODEL_CHAIN.slice(1).forEach((model) => attempts.push({ voice, model, body: base })));
  ordered.slice(3, 5).forEach((voice) => attempts.push({ voice, model: MODEL_CHAIN[0], body: base }));

  const errors: string[] = [];
  for (const a of attempts.slice(0, 6)) {
    let res = await elevenRequest(key, a.voice, a.model, a.body);
    if (res.status === 422 || res.status === 400) {
      const detail = await errorText(res);
      if (/speed/i.test(detail)) {
        const vs = { ...(a.body.voice_settings as Record<string, unknown>) };
        delete vs.speed;
        res = await elevenRequest(key, a.voice, a.model, { ...a.body, voice_settings: vs });
      } else {
        errors.push(`${res.status} ${detail}`);
        continue;
      }
    }
    if (res.ok) {
      lastGoodVoice = a.voice;
      return { ok: true as const, audio: await res.arrayBuffer(), voice: a.voice, model: a.model };
    }
    const detail = await errorText(res);
    errors.push(`${res.status} ${detail}`);
    if (isBilling(detail)) break;
  }
  return { ok: false as const, error: errors.join(' | ') || 'elevenlabs failed' };
}

async function synthesizeOpenAI(req: { text: string; lang: string; tone: string; rate: number }) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: process.env.OPENAI_TTS_VOICE || 'alloy',
      input: req.text,
      instructions: `Read in ${req.lang === 'ko' ? 'Korean' : req.lang === 'ja' ? 'Japanese' : req.lang === 'es' ? 'Spanish' : 'English'}. Tone: ${req.tone ?? 'calm'}. Speed: ${req.rate ?? 1}.`,
      response_format: 'mp3',
    }),
    cache: 'no-store',
  });
  if (!res.ok) return { ok: false as const, error: `openai ${res.status} ${await errorText(res)}` };
  return { ok: true as const, audio: await res.arrayBuffer() };
}

/** 어떤 음성 엔진이 연결돼 있는지 클라이언트에 알려 준다 */
export async function GET(req: Request) {
  const p = provider();
  const url = new URL(req.url);

  // 진단용: 키·음성 목록·구독 상태를 값 없이 요약해 돌려준다 (키 자체는 절대 내보내지 않음)
  if (url.searchParams.get('diag')) {    if (!process.env.ELEVENLABS_API_KEY) {
      return NextResponse.json({ provider: p, elevenlabs: null, openai: !!process.env.OPENAI_API_KEY });
    }
    const key = process.env.ELEVENLABS_API_KEY;
    const [voices, sub] = await Promise.all([
      elevenVoices(key),
      fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key }, cache: 'no-store' })
        .then(async (r) => (r.ok ? ((await r.json()) as Record<string, unknown>) : { error: r.status, detail: await errorText(r) }))
        .catch((e) => ({ error: String(e) })),
    ]);
    return NextResponse.json({
      provider: p,
      openai: !!process.env.OPENAI_API_KEY,
      voiceEnv: process.env.ELEVENLABS_VOICE_ID ?? null,
      voices: voices.slice(0, 25).map((v) => ({ id: v.id, name: v.name, category: v.category, labels: v.labels })),
      subscription: sub && typeof sub === 'object'
        ? {
            tier: (sub as Record<string, unknown>).tier,
            character_count: (sub as Record<string, unknown>).character_count,
            character_limit: (sub as Record<string, unknown>).character_limit,
            can_extend_character_limit: (sub as Record<string, unknown>).can_extend_character_limit,
            error: (sub as Record<string, unknown>).error,
            detail: (sub as Record<string, unknown>).detail,
          }
        : sub,
    });
  }

  return NextResponse.json({
    provider: p,
    hint:
      p === 'browser'
        ? '브라우저 내장 음성(Web Speech API)으로 재생합니다. ELEVENLABS_API_KEY 또는 OPENAI_API_KEY 를 Vercel 환경변수에 넣으면 같은 화면에서 신경망 음성으로 자동 전환됩니다.'
        : p === 'elevenlabs'
          ? 'ElevenLabs 신경망 음성으로 렌더링합니다.'
          : 'OpenAI TTS(gpt-4o-mini-tts)로 렌더링합니다.',
  });
}

interface Body {
  text?: string;
  lang?: string;
  tone?: string;
  rate?: number;
  pitch?: number;
  voiceId?: string;
}

/**
 * 고품질 TTS 어댑터.
 * ElevenLabs → (실패 시) OpenAI → (키 없음/모두 실패) 브라우저 음성.
 * 실패 사유는 `error` 에 담아 화면에서 안내할 수 있게 한다.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const text = (body.text ?? '').trim();
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  const p = provider();
  const reqArgs = { text, lang: body.lang ?? 'ko', tone: body.tone ?? 'calm', rate: body.rate ?? 1, pitch: body.pitch ?? 1, voiceId: body.voiceId };

  if (process.env.ELEVENLABS_API_KEY) {
    try {
      const out = await synthesizeEleven(process.env.ELEVENLABS_API_KEY, reqArgs);
      if (out.ok) {
        return new NextResponse(out.audio, {
          headers: {
            'content-type': 'audio/mpeg',
            'content-length': String(out.audio.byteLength),
            'x-tts-provider': 'elevenlabs',
            'x-tts-voice': out.voice,
            'x-tts-model': out.model,
            'cache-control': 'no-store',
          },
        });
      }
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ provider: 'browser', fallback: true, error: out.error }, { status: 200 });
      }
    } catch (err) {
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ provider: 'browser', fallback: true, error: err instanceof Error ? err.message : 'tts failed' }, { status: 200 });
      }
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const out = await synthesizeOpenAI(reqArgs);
      if (out.ok) {
        return new NextResponse(out.audio, {
          headers: {
            'content-type': 'audio/mpeg',
            'content-length': String(out.audio.byteLength),
            'x-tts-provider': 'openai',
            'cache-control': 'no-store',
          },
        });
      }
      return NextResponse.json({ provider: 'browser', fallback: true, error: out.error }, { status: 200 });
    } catch (err) {
      return NextResponse.json({ provider: 'browser', fallback: true, error: err instanceof Error ? err.message : 'tts failed' }, { status: 200 });
    }
  }

  return NextResponse.json({ provider: 'browser' }, { status: 200 });
}
