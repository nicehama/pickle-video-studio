import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function provider() {
  return process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'synth';
}

export async function GET() {
  const p = provider();
  return NextResponse.json({
    provider: p,
    hint:
      p === 'synth'
        ? '브라우저 Web Audio 로 실시간 합성합니다. ELEVENLABS_API_KEY 를 넣으면 같은 화면에서 ElevenLabs 효과음 API 로 전환됩니다.'
        : 'ElevenLabs 사운드 이펙트 API로 렌더링합니다.',
  });
}

/** 상황·감정 프롬프트 → 효과음 어댑터 (키 없으면 클라이언트 합성으로 폴백) */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { prompt?: string; duration?: number };
  const prompt = (body.prompt ?? '').trim();
  if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ provider: 'synth', fallback: true }, { status: 200 });
  }
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ text: prompt, duration_seconds: Math.min(22, Math.max(0.5, body.duration ?? 3)) }),
    });
    if (!res.ok) throw new Error(`elevenlabs ${res.status}`);
    return new NextResponse(await res.arrayBuffer(), {
      headers: { 'content-type': 'audio/mpeg', 'x-sfx-provider': 'elevenlabs' },
    });
  } catch (err) {
    return NextResponse.json({ provider: 'synth', fallback: true, error: err instanceof Error ? err.message : 'sfx failed' }, { status: 200 });
  }
}
