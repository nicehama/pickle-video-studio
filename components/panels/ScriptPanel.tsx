'use client';

import { useMemo, useState } from 'react';
import { useEditor } from '@/lib/editor-context';
import { clipEnd, cutRanges, projectDuration, silenceGaps, wordsOf } from '@/lib/editor-ops';
import { subtitleClips } from '@/lib/srt';
import { subtitleText } from '@/lib/renderer';
import { LANG_LABEL } from '@/lib/types';
import { Pill, SectionTitle } from '../ui';

const GAP_STEPS = [
  { value: 0.4, label: '0.4초+' },
  { value: 0.6, label: '0.6초+' },
  { value: 1, label: '1초+' },
];

/**
 * 블로(Vrew) 스타일 텍스트 컷 편집.
 * 대본의 단어·문장을 고르면 그 구간의 영상·성우·효과음이 타임라인에서 실제로 잘려 나간다(리플 컷).
 */
export function ScriptPanel() {
  const ed = useEditor();
  const lang = ed.project.lang;
  const rows = useMemo(() => subtitleClips(ed.project), [ed.project]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gapMin, setGapMin] = useState(0.6);

  const gaps = useMemo(() => silenceGaps(ed.project, gapMin), [ed.project, gapMin]);
  const gapTotal = gaps.reduce((sum, [a, b]) => sum + (b - a), 0);
  const total = projectDuration(ed.project);

  const toggleWord = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const runCut = (ranges: [number, number][], what: string) => {
    if (!ranges.length) return;
    const length = ranges.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0);
    const before = projectDuration(ed.project);
    ed.commit((p) => cutRanges(p, ranges));
    setSelected(new Set());
    const after = Math.max(8, before - length);
    ed.toast(`${what} ${ranges.length}구간 · ${length.toFixed(2)}초 잘라냄 → ${before.toFixed(1)}s → ${after.toFixed(1)}s`);
  };

  const selectedRanges = (): [number, number][] => {
    const out: [number, number][] = [];
    for (const r of rows) {
      const words = wordsOf({ ...r, text: subtitleText(r, lang) });
      words.forEach((w, i) => {
        if (selected.has(`${r.id}:${i}`)) out.push([w.start, w.end]);
      });
    }
    return out;
  };

  const selectedLength = selectedRanges().reduce((sum, [a, b]) => sum + (b - a), 0);
  const selectedCount = selected.size;

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <SectionTitle>대본 컷 편집</SectionTitle>
          <p className="-mt-1 text-[11px] leading-snug text-slate-500">글자를 지우면 영상·성우도 같이 잘립니다 (블로 방식)</p>
        </div>
        <Pill tone="info">{LANG_LABEL[lang]}</Pill>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2 text-[10.5px] leading-relaxed text-slate-400">
        대본에서 <b className="text-slate-200">단어를 눌러 선택</b>하고 아래 버튼을 누르면, 그 구간만큼 타임라인이 당겨집니다. 문장 통째로는 줄마다
        <span className="text-rose-300"> 문장 컷</span>을 쓰세요. ⌘/Ctrl+Z로 되돌릴 수 있어요.
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => runCut(selectedRanges(), '선택 구간')}
          disabled={!selectedCount}
          className="btn btn-primary h-9 flex-1 text-[11.5px] disabled:opacity-40"
        >
          ✂ 선택 단어 컷 {selectedCount ? `${selectedCount}개 · ${selectedLength.toFixed(2)}s` : ''}
        </button>
        <button type="button" onClick={() => setSelected(new Set())} disabled={!selectedCount} className="btn h-9 text-[11px] disabled:opacity-40">
          선택 해제
        </button>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-slate-300">무음 구간 일괄 자르기</span>
          <div className="flex items-center overflow-hidden rounded-full border border-white/10">
            {GAP_STEPS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGapMin(g.value)}
                className={`h-7 px-2 text-[10px] font-semibold transition ${
                  Math.abs(gapMin - g.value) < 0.001 ? 'bg-lime-400/20 text-lime-200' : 'text-slate-400 hover:bg-white/5'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[9.5px] leading-snug text-slate-500">
          자막·성우가 없는 구간을 찾아 {gapMin}초 이상만 잘라냅니다 · 양쪽 {Math.round(0.12 * 1000)}ms는 남깁니다
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => runCut(gaps, '무음 구간')}
            disabled={!gaps.length}
            className="btn h-8 flex-1 text-[11px] disabled:opacity-40"
          >
            {gaps.length ? `🧹 ${gaps.length}구간 · ${gapTotal.toFixed(2)}s 자르기` : '자를 무음 구간 없음'}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>
          자막 {rows.length}줄 · 전체 <span className="font-mono text-slate-300">{total.toFixed(1)}s</span>
        </span>
        {selectedCount > 0 && <span className="text-rose-300">선택 {selectedCount}개 · {selectedLength.toFixed(2)}s</span>}
      </div>

      <div className="space-y-1.5">
        {rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-[11px] text-slate-500">
            자막 트랙이 비어 있습니다. 자막 패널에서 먼저 대본을 추가해 주세요.
          </p>
        )}
        {rows.map((r, i) => {
          const text = subtitleText(r, lang);
          const words = wordsOf({ ...r, text });
          const isSelectedRow = ed.selectedId === r.id;
          return (
            <div
              key={r.id}
              onClick={() => {
                ed.select(r.id);
                ed.seek(r.start);
              }}
              className={`cursor-pointer rounded-xl border p-2 transition ${
                isSelectedRow ? 'border-lime-400/40 bg-lime-400/[0.06]' : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span className="font-mono text-[9.5px] text-slate-500">
                  {i + 1}. {r.start.toFixed(2)}–{clipEnd(r).toFixed(2)}s
                </span>
                <span className="font-mono text-[9.5px] text-slate-600">{r.duration.toFixed(2)}s</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    runCut([[r.start, clipEnd(r)]], '문장 컷');
                  }}
                  className="ml-auto rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[9.5px] font-semibold text-rose-200 hover:bg-rose-500/20"
                >
                  문장 컷
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {words.length === 0 && <span className="text-[11px] text-slate-600">(빈 자막)</span>}
                {words.map((w, wi) => {
                  const key = `${r.id}:${wi}`;
                  const on = selected.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      title={`${w.start.toFixed(2)}–${w.end.toFixed(2)}s · 눌러서 컷 선택`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWord(key);
                      }}
                      className={`rounded-md px-1 py-0.5 text-[12px] leading-snug transition ${
                        on
                          ? 'bg-rose-500/25 text-rose-100 line-through decoration-rose-300 decoration-2'
                          : 'text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      {w.text}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
