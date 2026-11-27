'use client';

import { useMemo, useState } from 'react';
import { uid } from '@/lib/data';
import { useEditor } from '@/lib/editor-context';
import { downloadText, subtitleClips, toSrt } from '@/lib/srt';
import { SUBTITLE_PRESETS, FONT_STACK } from '@/lib/data';
import { subtitleText } from '@/lib/renderer';
import { LANG_LABEL, LANG_SHORT, type Lang } from '@/lib/types';
import { Pill, SectionTitle, Segmented } from '../ui';

const TARGETS: Lang[] = ['ko', 'en', 'ja', 'es'];

export function SubtitlePanel() {
  const ed = useEditor();
  const [target, setTarget] = useState<Lang>(ed.project.lang);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => subtitleClips(ed.project), [ed.project]);
  const preset = SUBTITLE_PRESETS[ed.project.subtitlePreset];

  const setText = (id: string, value: string) => {
    ed.commit((p) => ({
      ...p,
      clips: p.clips.map((c) => {
        if (c.id !== id) return c;
        if (target === 'ko') return { ...c, text: value };
        return { ...c, translations: { ...(c.translations ?? {}), [target]: value } };
      }),
    }));
  };

  const nudge = (id: string, deltaMs: number) => {
    ed.commit((p) => ({
      ...p,
      clips: p.clips.map((c) => {
        if (c.id !== id) return c;
        const next = Math.max(-150, Math.min(150, (c.offsetMs ?? 0) + deltaMs));
        return { ...c, offsetMs: next };
      }),
    }));
  };

  const splitTwoLines = (id: string) => {
    const clip = rows.find((r) => r.id === id);
    if (!clip) return;
    const text = subtitleText(clip, target);
    const mid = Math.ceil(text.length / 2);
    const idx = text.lastIndexOf(' ', mid) > 0 ? text.lastIndexOf(' ', mid) : mid;
    setText(id, `${text.slice(0, idx).trim()}\n${text.slice(idx).trim()}`);
  };

  const addRow = () => {
    const clip = {
      id: uid('s'),
      track: 'subtitle' as const,
      start: Math.round(ed.time.t * 20) / 20,
      duration: 2.5,
      label: `자막 ${rows.length + 1}`,
      lang: 'ko' as Lang,
      text: '',
      offsetMs: 0,
      translations: {},
    };
    ed.commit((p) => ({ ...p, clips: [...p.clips, clip] }));
    ed.select(clip.id);
  };

  const translate = async () => {
    if (target === 'ko') {
      ed.toast('한국어는 원문입니다. 번역할 언어를 고르세요', 'warn');
      return;
    }
    setBusy(true);
    try {
      const need = rows.filter((r) => !r.translations?.[target]);
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from: 'ko', to: target, rows: need.map((r) => ({ id: r.id, text: r.text ?? '' })) }),
      });
      const data = (await res.json()) as { provider: string; items: { id: string; text: string | null; needsKey?: boolean }[] };
      if (!data.items?.length) {
        ed.toast('번역 결과가 없습니다. 표본 문장 외에는 API 키가 필요합니다', 'warn');
        return;
      }
      const map = new Map(data.items.map((i) => [i.id, i.text]));
      ed.commit((p) => ({
        ...p,
        clips: p.clips.map((c) => {
          const t = map.get(c.id);
          if (!t) return c;
          return { ...c, translations: { ...(c.translations ?? {}), [target]: t } };
        }),
      }));
      const missing = data.items.filter((i) => !i.text).length;
      ed.toast(
        data.provider === 'demo'
          ? `표본 번역 ${data.items.length - missing}건 적용${missing ? ` · ${missing}건은 API 키 필요` : ''}`
          : `OpenAI 번역 ${data.items.length}건을 적용했습니다`,
        data.provider === 'demo' ? 'warn' : 'ok',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3.5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <SectionTitle>자막 & 다국어</SectionTitle>
          <p className="-mt-1 text-[11px] leading-snug text-slate-500">줄별 편집 · 길이 경고 · ±150ms 싱크 · SRT 내려받기</p>
        </div>
        <Pill tone={ed.caps.translate === 'demo' ? 'warn' : 'ok'}>{ed.caps.translate === 'demo' ? '표본 번역' : 'AI 번역'}</Pill>
      </div>

      <div>
        <div className="mb-1 text-[11px] font-medium text-slate-400">편집 언어</div>
        <Segmented size="sm" value={target} onChange={setTarget} options={TARGETS.map((l) => ({ value: l, label: LANG_LABEL[l] }))} />
      </div>

      <div>
        <div className="mb-1 text-[11px] font-medium text-slate-400">스타일 프리셋</div>
        <Segmented
          size="sm"
          value={ed.project.subtitlePreset}
          onChange={(v) => ed.commit((p) => ({ ...p, subtitlePreset: v }))}
          options={[
            { value: 'shorts', label: '숏폼 강조' },
            { value: 'longform', label: '롱폼 기본' },
          ]}
        />
        <p className="mt-1 text-[10px] leading-snug text-slate-500">
          {preset.desc} · 줄당 {preset.maxChars}자 권장 · 최대 {preset.maxLines}줄
        </p>
        <p className="mt-0.5 truncate text-[9.5px] text-slate-600" title={FONT_STACK[target]}>
          폰트 폴백: {FONT_STACK[target]}
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        <button type="button" onClick={addRow} className="btn flex-1 text-[11.5px]">
          + 자막 추가
        </button>
        <button type="button" onClick={() => void translate()} disabled={busy || target === 'ko'} className="btn btn-primary flex-1 text-[11.5px] disabled:opacity-40">
          {busy ? '번역 중…' : `${LANG_LABEL[target]}로 번역`}
        </button>
      </div>

      <div className="space-y-1.5">
        {rows.map((r, i) => {
          const text = subtitleText(r, target);
          const len = text.replace(/\n/g, '').length;
          const over = len > preset.maxChars * preset.maxLines;
          const offset = r.offsetMs ?? 0;
          const missing = target !== 'ko' && !text;
          return (
            <div
              key={r.id}
              onClick={() => {
                ed.select(r.id);
                ed.seek(r.start);
              }}
              className={`cursor-pointer rounded-xl border p-2 transition ${
                ed.selectedId === r.id ? 'border-lime-400/40 bg-lime-400/[0.06]' : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span className="font-mono text-[9.5px] text-slate-500">
                  {r.start.toFixed(1)}–{(r.start + r.duration).toFixed(1)}s
                </span>
                <span className={`font-mono text-[9.5px] ${over ? 'text-rose-300' : 'text-slate-600'}`}>
                  {len}/{preset.maxChars * preset.maxLines}
                </span>
                {over && <Pill tone="bad">길이 초과</Pill>}
                {missing && <Pill tone="warn">번역 없음</Pill>}
                {offset !== 0 && <Pill tone={Math.abs(offset) >= 150 ? 'bad' : 'info'}>{offset > 0 ? '+' : ''}{offset}ms</Pill>}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    ed.commit((p) => ({ ...p, clips: p.clips.filter((c) => c.id !== r.id) }));
                    ed.select(null);
                  }}
                  className="ml-auto rounded px-1 text-[10px] text-slate-500 hover:text-rose-300"
                  aria-label="자막 삭제"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={text}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setText(r.id, e.target.value)}
                rows={preset.maxLines > 1 ? 2 : 1}
                placeholder={missing ? `${LANG_LABEL[target]} 번역을 입력하거나 '번역'을 누르세요` : '자막 내용'}
                className="field resize-none text-[12px] leading-snug"
              />
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <button type="button" onClick={(e) => { e.stopPropagation(); nudge(r.id, -150); }} className="chip !py-0.5 !text-[9.5px]">
                  −150ms
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); nudge(r.id, 150); }} className="chip !py-0.5 !text-[9.5px]">
                  +150ms
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); splitTwoLines(r.id); }} className="chip !py-0.5 !text-[9.5px]">
                  2줄 나누기
                </button>
                <span className="ml-auto text-[9px] text-slate-600">{LANG_SHORT[r.lang ?? 'ko']} 원문</span>
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <div className="mb-1 text-[11px] font-medium text-slate-400">SRT 다운로드</div>
        <div className="grid grid-cols-4 gap-1">
          {TARGETS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                downloadText(`${slug(ed.project.title)}_${l}.srt`, toSrt(ed.project, l), 'application/x-subrip;charset=utf-8');
                ed.toast(`${LANG_LABEL[l]} SRT 파일을 내려받았습니다`);
              }}
              className="chip justify-center !text-[10px]"
            >
              {LANG_SHORT[l]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function slug(title: string) {
  return title.replace(/[^\w가-힣]+/g, '_').slice(0, 40) || 'subtitles';
}
