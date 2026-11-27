'use client';

import { useEffect, useRef, useState } from 'react';
import { formatTimecode } from '@/lib/renderer';
import { useEditor, type TimeStore } from '@/lib/editor-context';
import { clipEnd, duckingFor, moveClip, projectDuration, removeClip, splitAt, trimClip } from '@/lib/editor-ops';
import { LANG_SHORT, TRACKS, TRACK_COLOR, type Clip, type TrackId } from '@/lib/types';
import { SFX_CATEGORIES, SFX_EMOTIONS, TONES, BGM_PRESETS } from '@/lib/data';

const ROW_H = 44;
const ROW_H_COMPACT = 38;
const RULER_H = 24;

/** 재생 시간 표시 — 20fps로만 갱신해 타임라인 전체 리렌더를 피한다 */
function useClock(store: TimeStore) {
  const [t, setT] = useState(store.t);
  useEffect(() => {
    const id = window.setInterval(() => {
      setT((prev) => (Math.abs(prev - store.t) > 0.02 ? store.t : prev));
    }, 50);
    return () => window.clearInterval(id);
  }, [store]);
  return t;
}

function Timecode() {
  const ed = useEditor();
  const t = useClock(ed.time);
  return (
    <span className="font-mono text-[11px] text-lime-200/90">
      {formatTimecode(t)} <span className="text-slate-600">/ {formatTimecode(projectDuration(ed.project))}</span>
    </span>
  );
}

interface Drag {
  id: string;
  mode: 'move' | 'left' | 'right';
  startX: number;
  orig: Clip;
  delta: number;
}

export function Timeline({ compact = false }: { compact?: boolean }) {
  const ed = useEditor();
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [snap, setSnap] = useState(true);
  const zoom = ed.zoom;
  const rowH = compact ? ROW_H_COMPACT : ROW_H;
  const total = projectDuration(ed.project);
  const width = Math.max(560, (total + 2) * zoom);

  /* 재생 헤드는 React 상태 없이 직접 움직인다 */
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const ph = playheadRef.current;
      if (ph) ph.style.transform = `translateX(${ed.time.t * zoom}px)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ed.time, zoom]);

  const snapTargets = (exceptId: string) => {
    const pts = [0, ed.time.t];
    ed.project.clips.forEach((c) => {
      if (c.id === exceptId) return;
      pts.push(c.start, clipEnd(c));
    });
    return pts;
  };

  const applySnap = (value: number, targets: number[]) => {
    if (!snap) return Math.round(value * 20) / 20;
    let best = value;
    let bestD = 0.14;
    for (const t of targets) {
      const d = Math.abs(value - t);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return Math.round(best * 1000) / 1000;
  };

  const onPointerDown = (e: React.PointerEvent, clip: Clip, mode: Drag['mode']) => {
    e.stopPropagation();
    e.preventDefault();
    ed.select(clip.id);
    setDrag({ id: clip.id, mode, startX: e.clientX, orig: clip, delta: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, delta: (e.clientX - drag.startX) / zoom });
  };

  const finishDrag = () => {
    if (!drag) return;
    const { orig, mode, delta } = drag;
    const targets = snapTargets(orig.id);
    const end = clipEnd(orig);
    if (mode === 'move') {
      const start = applySnap(Math.max(0, orig.start + delta), targets);
      if (Math.abs(start - orig.start) > 0.001) ed.commit((p) => moveClip(p, orig.id, start));
    } else if (mode === 'right') {
      const newEnd = applySnap(Math.max(orig.start + 0.25, end + delta), targets);
      if (Math.abs(newEnd - end) > 0.001) ed.commit((p) => trimClip(p, orig.id, 'end', newEnd));
    } else {
      const start = applySnap(Math.max(0, Math.min(end - 0.25, orig.start + delta)), targets);
      if (Math.abs(start - orig.start) > 0.001) ed.commit((p) => trimClip(p, orig.id, 'start', start));
    }
    setDrag(null);
  };

  const previewOf = (clip: Clip) => {
    if (!drag || drag.id !== clip.id) return { start: clip.start, duration: clip.duration };
    const { orig, mode, delta } = drag;
    const end = clipEnd(orig);
    if (mode === 'move') return { start: Math.max(0, orig.start + delta), duration: orig.duration };
    if (mode === 'right') return { start: orig.start, duration: Math.max(0.25, orig.duration + delta) };
    const start = Math.min(end - 0.25, Math.max(0, orig.start + delta));
    return { start, duration: end - start };
  };

  const seekFromEvent = (clientX: number) => {
    const lane = laneRef.current;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    ed.seek(Math.max(0, (clientX - rect.left) / zoom));
  };

  const split = () => {
    ed.commit((p) => splitAt(p, ed.time.t, ed.selectedId ?? undefined));
    ed.toast('재생 헤드에서 컷을 분할했습니다');
  };

  const del = () => {
    if (!ed.selectedId) {
      ed.toast('삭제할 클립을 먼저 선택하세요', 'warn');
      return;
    }
    ed.commit((p) => removeClip(p, ed.selectedId as string));
    ed.select(null);
  };

  return (
    <div className="flex min-h-0 flex-col border-t border-white/[0.07] bg-ink-900/50">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <span className="mr-1 hidden text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:inline">타임라인</span>
        <Timecode />
        <div className="mx-1 hidden h-4 w-px bg-white/10 sm:block" />
        <button type="button" onClick={split} className="chip" title="재생 헤드에서 분할 (S)">
          ✂ 분할
        </button>
        <button type="button" onClick={del} className="chip" title="선택 클립 삭제 (Delete)">
          🗑 삭제
        </button>
        <button
          type="button"
          onClick={() => {
            ed.undo();
            ed.toast('실행 취소');
          }}
          disabled={!ed.canUndo}
          className="chip disabled:opacity-30"
          title="실행 취소 (⌘Z)"
        >
          ↶
        </button>
        <button type="button" onClick={ed.redo} disabled={!ed.canRedo} className="chip disabled:opacity-30" title="다시 실행 (⇧⌘Z)">
          ↷
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setSnap(!snap)} className={`chip ${snap ? 'chip-on' : ''}`} title="스냅">
            ⌁ 스냅
          </button>
          <div className="flex items-center overflow-hidden rounded-full border border-white/10">
            <button type="button" onClick={() => ed.setZoom(Math.max(24, zoom - 12))} className="h-7 w-7 text-[13px] text-slate-300 hover:bg-white/5" aria-label="축소">
              −
            </button>
            <span className="w-8 text-center font-mono text-[10px] text-slate-500">{Math.round(zoom)}</span>
            <button type="button" onClick={() => ed.setZoom(Math.min(220, zoom + 12))} className="h-7 w-7 text-[13px] text-slate-300 hover:bg-white/5" aria-label="확대">
              +
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-[62px] shrink-0 border-r border-white/[0.07] bg-ink-950/40 md:w-[74px]">
          <div style={{ height: RULER_H }} className="border-b border-white/[0.06]" />
          {TRACKS.map((tr) => (
            <div key={tr.id} style={{ height: rowH }} className="flex flex-col justify-center border-b border-white/[0.04] px-1.5">
              <span className="truncate text-[10.5px] font-semibold text-slate-300">{tr.name}</span>
              {!compact && <span className="hidden truncate text-[9px] text-slate-600 md:block">{tr.hint}</span>}
            </div>
          ))}
        </div>

        <div className="scroll-thin relative flex-1 overflow-x-auto overflow-y-hidden">
          <div
            ref={laneRef}
            style={{ width }}
            className="relative select-none"
            onPointerMove={onPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <div
              style={{ height: RULER_H }}
              className="sticky top-0 z-10 cursor-ew-resize border-b border-white/[0.06] bg-ink-900/90"
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                seekFromEvent(e.clientX);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 1) seekFromEvent(e.clientX);
              }}
            >
              {Array.from({ length: Math.ceil(total) + 2 }, (_, i) => i).map((s) => (
                <div key={s} className="absolute top-0 h-full border-l border-white/[0.07]" style={{ left: s * zoom }}>
                  <span className="absolute left-1 top-1 font-mono text-[9px] text-slate-500">{s}s</span>
                </div>
              ))}
            </div>

            {TRACKS.map((tr) => (
              <div
                key={tr.id}
                style={{ height: rowH }}
                className="relative border-b border-white/[0.04]"
                onPointerDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  ed.select(null);
                  seekFromEvent(e.clientX);
                }}
              >
                {ed.project.clips
                  .filter((c) => c.track === tr.id)
                  .map((clip) => {
                    const pv = previewOf(clip);
                    const selected = ed.selectedId === clip.id;
                    const color = TRACK_COLOR[clip.track];
                    const duck = clip.track === 'sfx' ? duckingFor(ed.project, clip) : { ducked: false, overlap: 0 };
                    return (
                      <div
                        key={clip.id}
                        style={{ left: pv.start * zoom, width: Math.max(16, pv.duration * zoom), height: rowH - 8 }}
                        className="absolute top-1"
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onPointerDown={(e) => onPointerDown(e, clip, 'move')}
                          onDoubleClick={() => ed.seek(clip.start)}
                          className={`timeline-grab group relative h-full w-full cursor-grab overflow-hidden rounded-lg border ${color.border} ${color.bg} text-left active:cursor-grabbing ${
                            selected ? 'shadow-glow ring-2 ring-lime-300/70' : 'hover:border-white/30'
                          }`}
                          title={`${clip.label} · ${pv.start.toFixed(2)}s ~ ${(pv.start + pv.duration).toFixed(2)}s`}
                        >
                          <div className="pointer-events-none px-2 pt-0.5">
                            <div className={`truncate text-[10.5px] font-semibold leading-tight ${color.text}`}>{clip.label}</div>
                            {!compact && (
                              <div className="flex items-center gap-1 truncate text-[9px] leading-tight text-white/45">
                                {clip.track === 'subtitle' && clip.text ? <span className="truncate">{clip.text}</span> : null}
                                {clip.track === 'voice' && clip.voice ? (
                                  <span className="truncate">
                                    {TONES.find((t) => t.id === clip.voice?.tone)?.name} · {clip.voice.rate.toFixed(2)}x
                                  </span>
                                ) : null}
                                {clip.track === 'sfx' && clip.sfx ? (
                                  <span className="truncate">
                                    {SFX_CATEGORIES.find((c) => c.id === clip.sfx?.category)?.name} ·{' '}
                                    {SFX_EMOTIONS.find((e) => e.id === clip.sfx?.emotion)?.name} v{clip.sfx.variation + 1}
                                  </span>
                                ) : null}
                                {clip.track === 'bgm' ? <span>{BGM_PRESETS.find((b) => b.id === clip.bgmPreset)?.name}</span> : null}
                              </div>
                            )}
                          </div>
                          {(clip.track === 'voice' || clip.track === 'sfx') && (
                            <div
                              className="pointer-events-none absolute inset-x-0 bottom-0 h-2 opacity-40"
                              style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,.65) 0 1px, transparent 1px 4px)' }}
                            />
                          )}
                          {duck.ducked && (
                            <span className="pointer-events-none absolute bottom-0.5 right-1 rounded bg-black/50 px-1 text-[8px] font-bold text-amber-200">
                              DUCK −8dB
                            </span>
                          )}
                          {clip.track === 'subtitle' && clip.lang && (
                            <span className="pointer-events-none absolute right-1 top-0.5 rounded bg-black/40 px-1 text-[8px] font-bold text-white/70">
                              {LANG_SHORT[clip.lang]}
                            </span>
                          )}
                        </div>
                        {/* 트림 핸들: 보이는 선은 얇고, 터치 영역은 44×44px */}
                        <div
                          className="absolute -left-4 top-1/2 h-11 w-11 -translate-y-1/2 cursor-ew-resize touch-none"
                          onPointerDown={(e) => onPointerDown(e, clip, 'left')}
                          aria-label="시작점 조절"
                        >
                          <div className="mx-auto h-full w-1 rounded-full bg-white/0 transition group-hover:bg-white/60" />
                        </div>
                        <div
                          className="absolute -right-4 top-1/2 h-11 w-11 -translate-y-1/2 cursor-ew-resize touch-none"
                          onPointerDown={(e) => onPointerDown(e, clip, 'right')}
                          aria-label="끝점 조절"
                        >
                          <div className="mx-auto h-full w-1 rounded-full bg-white/0 transition group-hover:bg-white/60" />
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}

            <div ref={playheadRef} className="pointer-events-none absolute left-0 top-0 z-20 h-full w-px bg-lime-300" style={{ willChange: 'transform' }}>
              <div className="absolute -left-[5px] top-0 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-lime-300" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
