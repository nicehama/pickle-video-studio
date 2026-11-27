import { NextResponse } from 'next/server';
import { DEMO_TRANSLATIONS } from '@/lib/data';

export const runtime = 'nodejs';

const LANGS: Record<string, string> = { ko: 'Korean', en: 'English', ja: 'Japanese', es: 'Spanish' };

export async function GET() {
  const demo = !process.env.OPENAI_API_KEY;
  return NextResponse.json({
    provider: demo ? 'demo' : 'openai',
    hint: demo
      ? '표본 문장만 사전 번역으로 바꿔 줍니다. OPENAI_API_KEY 를 넣으면 임의의 자막도 번역됩니다.'
      : 'OpenAI 로 자막을 번역합니다.',
  });
}

interface Body {
  rows?: { id: string; text: string }[];
  from?: string;
  to?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const rows = (body.rows ?? []).filter((r) => r && typeof r.text === 'string' && r.text.trim());
  const to = body.to ?? 'en';
  if (!rows.length) return NextResponse.json({ items: [], provider: 'demo' });

  if (!process.env.OPENAI_API_KEY) {
    const items = rows.map((r) => {
      const hit = DEMO_TRANSLATIONS.find((d) => d.ko.trim() === r.text.trim());
      const text = hit ? (hit as unknown as Record<string, string>)[to] ?? null : null;
      return { id: r.id, text, needsKey: !text };
    });
    return NextResponse.json({ provider: 'demo', items });
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You localize video subtitles. Keep line length short and natural, preserve on-screen timing, never add commentary. Reply as JSON: {"items":[{"id":"...","text":"..."}]} in the requested target language.',
          },
          {
            role: 'user',
            content: JSON.stringify({ target: LANGS[to] ?? 'English', from: LANGS[body.from ?? 'ko'], rows }),
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '{"items":[]}';
    const parsed = JSON.parse(content) as { items?: { id: string; text: string }[] };
    return NextResponse.json({ provider: 'openai', items: parsed.items ?? [] });
  } catch (err) {
    return NextResponse.json({ provider: 'demo', fallback: true, items: [], error: err instanceof Error ? err.message : 'translate failed' });
  }
}
