'use client';

import { useEffect, useState } from 'react';
import { useEditor } from '@/lib/editor-context';
import { framingFor, removeClip, splitAt } from '@/lib/editor-ops';
import { Preview } from './Preview';
import { Timeline } from './Timeline';
import { ExportModal } from './ExportModal';
import { MediaPanel } from './panels/MediaPanel';
import { SubtitlePanel } from './panels/SubtitlePanel';
import { TtsPanel } from './panels/TtsPanel';
import { SfxPanel } from './panels/SfxPanel';
import { ScriptPanel } from './panels/ScriptPanel';
import { Pill } from './ui';
import { formatSavedAt } from '@/lib/persist';

type ToolTab = 'media' | 'subtitle' | 'script' | 'tts' | 'sfx';

const TAB_META: { id: ToolTab; name: string; icon: string }[] = [
  { id: 'subtitle', name: '자막', icon: '🅣' },
  { id: 'script', name: '컷편집', icon: '✂' },
  { id: 'tts', name: '성우', icon: '🎙' },
  { id: 'sfx', name: '효과음', icon: '🔊' },
  { id: 'media', name: '미디어', icon: '🎞' },
];

function ToolContent({ tab }: { tab: ToolTab }) {
  if (tab === 'media') return <MediaPanel />;
  if (tab === 'subtitle') return <SubtitlePanel />;
  if (tab === 'script') return <ScriptPanel />;
  if (tab === 'tts') return <TtsPanel />;
  return <SfxPanel />;
}

function SaveBadge() {
  const ed = useEditor();
  const map = {
    loading: { text: '불러오는 중…', dot: 'bg-slate-500' },
    saving: { text: '저장 중…', dot: 'bg-amber-300 animate-pulse' },
    saved: { text: ed.savedAt ? `저장됨 ${formatSavedAt(ed.savedAt)}` : '저장됨', dot: 'bg-lime-300' },
    error: { text: '저장 실패', dot: 'bg-rose-400' },
  } as const;
  const s = map[ed.saveState];
  return (
    <button
      type="button"
      onClick={ed.saveNow}
      title="새로고침해도 이어서 편집됩니다 · 눌러서 지금 저장"
      className="mr-0.5 flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 text-[10.5px] font-medium text-slate-400 transition hover:text-slate-200"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      <span className="hidden sm:inline">{s.text}</span>
    </button>
  );
}

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const ed = useEditor();
  const start = (kind: 'empty' | 'sample') => {
    ed.resetProject(kind);
    ed.toast(kind === 'sample' ? '샘플 프로젝트로 새로 시작했습니다' : '빈 프로젝트로 새로 시작했습니다');
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal>
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-4 shadow-2xl">
        <h2 className="text-[14px] font-bold text-white">새 프로젝트</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">
          지금 편집 중인 내용은 자동 저장본에서 지워집니다. 필요하면 먼저 내보내기로 백업해 주세요.
        </p>
        <div className="mt-3 grid gap-1.5">
          <button type="button" onClick={() => start('empty')} className="btn btn-primary justify-start text-[12px]">
            ＋ 빈 프로젝트로 시작
          </button>
          <button type="button" onClick={() => start('sample')} className="btn justify-start text-[12px]">
            🎬 샘플 프로젝트 불러오기 (20초)
          </button>
          <button type="button" onClick={onClose} className="btn btn-ghost justify-center text-[12px]">
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

function ClipInspector() {
  const ed = useEditor();
  const clip = ed.project.clips.find((c) => c.id === ed.selectedId);
  if (!clip) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 px-2.5 py-2 text-[10.5px] leading-snug text-slate-500">
        타임라인에서 클립을 선택하면 시작점·길이를 숫자로 조정할 수 있습니다.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="truncate text-[11.5px] font-semibold text-slate-200">{clip.label}</span>
        <Pill tone="info">{clip.track}</Pill>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="block">
          <span className="text-[9.5px] text-slate-500">시작 (초)</span>
          <input
            type="number"
            step={0.1}
            min={0}
            value={clip.start.toFixed(1)}
            onChange={(e) => {
              const v = Math.max(0, Number(e.target.value) || 0);
              ed.commit((p) => ({ ...p, clips: p.clips.map((c) => (c.id === clip.id ? { ...c, start: v } : c)) }));
            }}
            className="field mt-0.5 py-1 font-mono text-[11px]"
          />
        </label>
        <label className="block">
          <span className="text-[9.5px] text-slate-500">길이 (초)</span>
          <input
            type="number"
            step={0.1}
            min={0.25}
            value={clip.duration.toFixed(1)}
            onChange={(e) => {
              const v = Math.max(0.25, Number(e.target.value) || 0.25);
              ed.commit((p) => ({ ...p, clips: p.clips.map((c) => (c.id === clip.id ? { ...c, duration: v } : c)) }));
            }}
            className="field mt-0.5 py-1 font-mono text-[11px]"
          />
        </label>
      </div>
      {clip.track === 'video' && <FramingInspector clipId={clip.id} />}
      <div className="mt-1.5 flex gap-1">
        <button type="button" onClick={() => ed.commit((p) => splitAt(p, ed.time.t, clip.id))} className="chip flex-1 justify-center !text-[10px]">
          헤드에서 분할
        </button>
        <button
          type="button"
          onClick={() => {
            ed.commit((p) => removeClip(p, clip.id));
            ed.select(null);
          }}
          className="chip flex-1 justify-center !text-[10px] text-rose-200"
        >
          삭제
        </button>
      </div>
    </div>
  );
}

function FramingInspector({ clipId }: { clipId: string }) {
  const ed = useEditor();
  const clip = ed.project.clips.find((c) => c.id === clipId);
  if (!clip) return null;
  const aspect = ed.project.aspect;
  const other = aspect === '9:16' ? '16:9' : '9:16';
  const f = framingFor(clip, aspect);
  const otherF = framingFor(clip, other);
  const moved = Math.abs(f.x) > 0.001 || Math.abs(f.y) > 0.001 || Math.abs(f.scale - 1) > 0.001;
  const otherMoved = Math.abs(otherF.x) > 0.001 || Math.abs(otherF.y) > 0.001 || Math.abs(otherF.scale - 1) > 0.001;

  const slider = (label: string, value: number, key: 'x' | 'y' | 'scale', min: number, max: number, step: number, text: string) => (
    <label className="block">
      <div className="flex items-center justify-between text-[9.5px]">
        <span className="text-slate-500">{label}</span>
        <span className="font-mono text-lime-200/80">{text}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => ed.setClipFraming(clipId, { [key]: Number(e.target.value) })}
        onPointerUp={() => ed.liveEnd()}
        onKeyUp={() => ed.liveEnd()}
        onBlur={() => ed.liveEnd()}
        aria-label={`${aspect} ${label}`}
      />
    </label>
  );

  return (
    <div className="mt-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-1.5">
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[9.5px] font-semibold text-slate-400">
          {aspect} 프레이밍 <span className="font-normal text-slate-600">(이 비율에만)</span>
        </span>
        {moved && <Pill tone="ok">적용됨</Pill>}
      </div>
      {slider('좌우 X', f.x, 'x', -0.5, 0.5, 0.005, `${(f.x * 100).toFixed(0)}%`)}
      {slider('상하 Y', f.y, 'y', -0.5, 0.5, 0.005, `${(f.y * 100).toFixed(0)}%`)}
      {slider('확대', f.scale, 'scale', 1, 3, 0.01, `${f.scale.toFixed(2)}×`)}
      <div className="flex gap-1">
        <button type="button" onClick={() => ed.setClipFraming(clipId, { x: 0, y: 0, scale: 1 })} className="chip flex-1 justify-center !py-0 !text-[9px]">
          초기화
        </button>
        <button
          type="button"
          onClick={() => ed.setClipFraming(clipId, { x: otherF.x, y: otherF.y, scale: otherF.scale })}
          className="chip flex-1 justify-center !py-0 !text-[9px]"
          title={`${other} 비율의 값을 가져옵니다`}
        >
          {other} 값 복사
        </button>
      </div>
      <p className="mt-0.5 text-[9px] leading-snug text-slate-600">
        {other} 쪽은 {otherMoved ? '따로 조정됨' : '기본값'} · 원본 파일 불변
      </p>
    </div>
  );
}

export function Editor() {
  const ed = useEditor();
  const [tab, setTab] = useState<ToolTab>('subtitle');
  const [mobileTab, setMobileTab] = useState<ToolTab>('subtitle');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = /input|textarea|select/i.test(el.tagName) || el.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) ed.redo();
        else ed.undo();
        return;
      }
      if (typing) return;
      if (e.code === 'Space') {
        e.preventDefault();
        ed.togglePlay();
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        ed.commit((p) => splitAt(p, ed.time.t, ed.selectedId ?? undefined));
        ed.toast('재생 헤드에서 컷을 분할했습니다');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (ed.selectedId) {
          e.preventDefault();
          ed.commit((p) => removeClip(p, ed.selectedId as string));
          ed.select(null);
        }
      } else if (e.key === 'ArrowRight') {
        ed.seek(ed.time.t + 0.5);
      } else if (e.key === 'ArrowLeft') {
        ed.seek(Math.max(0, ed.time.t - 0.5));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ed]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      {/* 상단 바 */}
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-white/[0.07] bg-ink-950/60 px-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-lime-400/90 text-[13px] font-black text-ink-950">P</div>
          <div className="leading-none">
            <div className="text-[13px] font-bold tracking-tight text-white">Pickle Studio</div>
            <div className="mt-0.5 hidden text-[9.5px] text-slate-500 sm:block">블로 스타일 웹 영상편집기</div>
          </div>
          <span className="ml-1 hidden rounded-md border border-lime-400/25 bg-lime-400/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-lime-200 md:inline">
            2차 · 자동저장
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <SaveBadge />
          <button type="button" onClick={ed.undo} disabled={!ed.canUndo} className="btn btn-ghost hidden h-9 !px-2 text-[12px] sm:flex" title="실행 취소">
            ↶
          </button>
          <button type="button" onClick={ed.redo} disabled={!ed.canRedo} className="btn btn-ghost hidden h-9 !px-2 text-[12px] sm:flex" title="다시 실행">
            ↷
          </button>
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
          <button type="button" onClick={() => setNewProjectOpen(true)} className="btn h-9 text-[11.5px]" title="새 프로젝트 · 초기화">
            새 프로젝트
          </button>
          <button type="button" onClick={() => setExportOpen(true)} className="btn btn-primary h-9 text-[12px] font-semibold">
            내보내기
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 좌: 미디어 (데스크톱) */}
        <aside className="scroll-thin hidden w-[288px] shrink-0 overflow-y-auto border-r border-white/[0.07] lg:block">
          <MediaPanel />
        </aside>

        {/* 중앙 */}
        <main className="flex min-w-0 flex-1 flex-col">
          <Preview />

          {/* 데스크톱 타임라인 */}
          <div className="hidden h-[338px] min-h-0 shrink-0 flex-col lg:flex">
            <Timeline />
          </div>

          {/* 모바일: 도구 시트 + 접이식 타임라인 */}
          <div className="flex shrink-0 flex-col lg:hidden">
            <div className="scroll-thin flex items-center gap-1 overflow-x-auto border-t border-white/[0.07] px-2 py-1.5">
              {TAB_META.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (mobileTab === t.id && sheetOpen) {
                      setSheetOpen(false);
                      return;
                    }
                    setMobileTab(t.id);
                    setSheetOpen(true);
                    setTimelineOpen(false);
                  }}
                  className={`flex min-h-[40px] shrink-0 items-center gap-1 rounded-full border px-3.5 text-[12px] font-semibold transition ${
                    sheetOpen && mobileTab === t.id
                      ? 'border-lime-400/40 bg-lime-400/15 text-lime-200'
                      : 'border-white/10 bg-white/[0.03] text-slate-300'
                  }`}
                >
                  <span>{t.icon}</span>
                  {t.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setTimelineOpen((v) => !v);
                  setSheetOpen(false);
                }}
                className={`ml-auto flex min-h-[40px] shrink-0 items-center rounded-full border px-3 text-[11.5px] ${
                  timelineOpen ? 'border-lime-400/40 bg-lime-400/15 text-lime-200' : 'border-white/10 text-slate-300'
                }`}
              >
                타임라인 {timelineOpen ? '▾' : '▸'}
              </button>
            </div>
            {sheetOpen && (
              <div className="scroll-thin max-h-[46dvh] min-h-[160px] flex-1 overflow-y-auto border-t border-white/[0.05] bg-ink-950/60">
                <div className="sticky top-0 z-10 flex items-center justify-between bg-ink-950/80 px-3 py-1 backdrop-blur">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    {TAB_META.find((t) => t.id === mobileTab)?.name} 도구
                  </span>
                  <button type="button" onClick={() => setSheetOpen(false)} className="px-2 py-1 text-[11px] text-slate-400" aria-label="도구 접기">
                    접기 ▾
                  </button>
                </div>
                <ToolContent tab={mobileTab} />
              </div>
            )}
            <div className={`shrink-0 overflow-hidden transition-[height] ${timelineOpen ? 'h-[268px]' : 'h-0'}`}>
              <Timeline compact />
            </div>
          </div>
        </main>

        {/* 우: 도구 (데스크톱) */}
        <aside className="hidden w-[352px] shrink-0 flex-col border-l border-white/[0.07] lg:flex">
          <div className="flex shrink-0 gap-1 border-b border-white/[0.07] p-2">
            {TAB_META.filter((t) => t.id !== 'media').map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`min-h-[36px] flex-1 rounded-lg px-2 text-[11.5px] font-semibold transition ${
                  tab === t.id ? 'bg-lime-400/15 text-lime-200 shadow-[inset_0_0_0_1px_rgba(198,242,78,.25)]' : 'text-slate-400 hover:bg-white/[0.05]'
                }`}
              >
                <span className="mr-1">{t.icon}</span>
                {t.name}
              </button>
            ))}
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            <ToolContent tab={tab} />
          </div>
          <div className="shrink-0 border-t border-white/[0.07] p-2">
            <ClipInspector />
          </div>
        </aside>
      </div>

      {/* 토스트 */}
      <div className="pointer-events-none fixed bottom-3 left-1/2 z-[60] flex w-[min(92vw,520px)] -translate-x-1/2 flex-col items-center gap-1.5">
        {ed.toasts.map((t) => (
          <div
            key={t.id}
            className={`toast w-full rounded-xl border px-3 py-2 text-center text-[11.5px] font-medium shadow-lg backdrop-blur ${
              t.kind === 'warn'
                ? 'border-amber-400/30 bg-amber-500/15 text-amber-100'
                : t.kind === 'info'
                  ? 'border-sky-400/30 bg-sky-500/15 text-sky-100'
                  : 'border-lime-400/30 bg-lime-500/15 text-lime-100'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>

      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
      {newProjectOpen && <NewProjectModal onClose={() => setNewProjectOpen(false)} />}
    </div>
  );
}
