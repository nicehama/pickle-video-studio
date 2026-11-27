import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Provider = 'elevenlabs' | 'openai' | 'browser';

function provider(): Provider {
  if (process.env.ELEVENLABS_API_KEY) return 'elevenlabs';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'browser';
}

/** 어떤 음성 엔진이 연결돼 있는지 클라이언트에 알려 준다 */
export async function GET() {
  const p = provider();
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
 * 키가 없으면 provider:'browser' 를 돌려주고 클라이언트가 Web Speech 로 재생한다.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const text = (body.text ?? '').trim();
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  const p = provider();

  if (p === 'browser') {
    return NextResponse.json({ provider: 'browser' }, { status: 200 });
  }

  try {
    if (p === 'elevenlabs') {
      const voiceId = body.voiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY as string, 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.35 },
        }),
      });
      if (!res.ok) throw new Error(`elevenlabs ${res.status}`);
      return new NextResponse(await res.arrayBuffer(), {
        headers: { 'content-type': 'audio/mpeg', 'x-tts-provider': 'elevenlabs' },
      });
    }

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: process.env.OPENAI_TTS_VOICE || 'alloy',
        input: text,
        instructions: `Read in ${body.lang === 'ko' ? 'Korean' : body.lang === 'ja' ? 'Japanese' : body.lang === 'es' ? 'Spanish' : 'English'}. Tone: ${body.tone ?? 'calm'}.`,
        response_format: 'mp3',
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}`);
    return new NextResponse(await res.arrayBuffer(), {
      headers: { 'content-type': 'audio/mpeg', 'x-tts-provider': 'openai' },
    });
  } catch (err) {
    return NextResponse.json(
      { provider: 'browser', fallback: true, error: err instanceof Error ? err.message : 'tts failed' },
      { status: 200 },
    );
  }
}
