'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditor, useTime } from '@/lib/editor-context';
import { activeClipAt, drawFrame, formatTimecode } from '@/lib/renderer';
import { clipEnd, framingFor, projectDuration } from '@/lib/editor-ops';
import { FRAMING_LIMIT } from '@/lib/types';
import { Segmented } from './ui';

/** 프리뷰 위에서 직접 움직이는 비율별 프레이밍 조절판 */
function FramingPanel({ onClose }: { onClose: () => void }) {
  const ed = useEditor();
  const { t } = useTime();
  const aspect = ed.project.aspect;
  const clip = activeClipAt(ed.project, 'video', t);
  const other = aspect === '9:16' ? '16:9' : '9:16';

  if (!clip) {
    return (
      <div className="rounded-2xl border border-white/12 bg-ink-900/95 p-3 text-[11px] leading-snug text-slate-400 shadow-xl backdrop-blur">
        재생 헤드를 영상 클립 위로 옮기면 화면 위치·확대를 조정할 수 있어요.
        <button type="button" onClick={onClose} className="mt-2 block text-[10.5px] text-slate-500 underline">
          닫기
        </button>
      </div>
    );
  }

  const f = framingFor(clip, aspect);
  const otherF = framingFor(clip, other);

  const row = (label: string, value: number, key: 'x' | 'y' | 'scale', min: number, max: number, step: number, fmt: string) => (
    <label className="block">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-medium text-slate-400">{label}</span>
        <span className="font-mono text-lime-200/90">{fmt}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => ed.setClipFraming(clip.id, { [key]: Number(e.target.value) })}
        onPointerUp={() => ed.liveEnd()}
        onKeyUp={() => ed.liveEnd()}
        onBlur={() => ed.liveEnd()}
        aria-label={label}
      />
    </label>
  );

  return (
    <div className="w-full rounded-2xl border border-white/12 bg-ink-900/95 p-2.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,.9)] backdrop-blur">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-bold text-slate-200">
          🎯 {aspect} 전용 프레이밍 <span className="font-normal text-slate-500">· {clip.label}</span>
        </span>
        <button type="button" onClick={onClose} className="px-1 text-[11px] leading-none text-slate-500 hover:text-slate-300" aria-label="프레이밍 닫기">
          ✕
        </button>
      </div>
      <div className="space-y-0.5">
        {row('좌우 (X)', f.x, 'x', -FRAMING_LIMIT.x, FRAMING_LIMIT.x, 0.005, `${(f.x * 100).toFixed(0)}%`)}
        {row('상하 (Y)', f.y, 'y', -FRAMING_LIMIT.y, FRAMING_LIMIT.y, 0.005, `${(f.y * 100).toFixed(0)}%`)}
        {row('확대', f.scale, 'scale', FRAMING_LIMIT.scaleMin, FRAMING_LIMIT.scaleMax, 0.01, `${f.scale.toFixed(2)}×`)}
      </div>
      <div className="mt-1.5 flex gap-1">
        <button type="button" onClick={() => ed.setClipFraming(clip.id, { x: 0, y: 0, scale: 1 })} className="chip flex-1 justify-center !py-0.5 !text-[10px]">
          이 비율 초기화
        </button>
        <button
          type="button"
          onClick={() => ed.setClipFraming(clip.id, { x: otherF.x, y: otherF.y, scale: otherF.scale })}
          className="chip flex-1 justify-center !py-0.5 !text-[10px]"
          title={`${other} 비율의 위치·확대 값을 가져옵니다`}
        >
          {other} 값 복사
        </button>
      </div>
      <p className="mt-1 text-[9.5px] leading-snug text-slate-500">
        {aspect === '16:9' ? '롱폼' : '숏폼'}에만 적용되고 원본 영상은 바뀌지 않아요. 프리뷰를 드래그해도 움직입니다.
      </p>
    </div>
  );
}

export function Preview() {
  const ed = useEditor();
  const { t, playing } = useTime();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; fx: number; fy: number; w: number; h: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [framingOpen, setFramingOpen] = useState(false);
  const stateRef = useRef({ project: ed.project, videos: ed.videos, safe: ed.project.safeZone });
  stateRef.current = { project: ed.project, videos: ed.videos, safe: ed.project.safeZone };

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      const st = stateRef.current;
      if (canvas) {
        const w = canvas.width;
        const h = canvas.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const time = ed.time.t;
          // 영상 요소를 재생 헤드에 맞춘다
          const vClip = activeClipAt(st.project, 'video', time);
          st.videos.current.forEach((v, id) => {
            if (id !== vClip?.mediaId) {
              if (!v.paused) v.pause();
              return;
            }
            const target = (vClip!.inPoint ?? 0) + (time - vClip!.start);
            if (Math.abs(v.currentTime - target) > 0.3) {
              try {
                v.currentTime = Math.max(0, target);
              } catch {
                /* seek 준비 전 */
              }
            }
            if (ed.time.playing && v.paused) void v.play().catch(() => {});
            if (!ed.time.playing && !v.paused) v.pause();
          });
          drawFrame(ctx, w, h, { project: st.project, time, videos: st.videos.current, showSafeZone: st.safe, showBadges: true });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ed.time, ed.videos]);

  const aspect = ed.project.aspect;
  const setAspect = (a: '16:9' | '9:16') =>
    ed.commit((p) => ({ ...p, aspect: a, subtitlePreset: a === '9:16' ? 'shorts' : 'longform' }));

  const total = projectDuration(ed.project);
  const activeVoice = ed.project.clips.find((c) => c.track === 'voice' && t >= c.start && t < clipEnd(c));
  const activeVideo = activeClipAt(ed.project, 'video', t);

  const startPan = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeVideo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const f = framingFor(activeVideo, ed.project.aspect);
    dragRef.current = { sx: e.clientX, sy: e.clientY, fx: f.x, fy: f.y, w: rect.width || 1, h: rect.height || 1, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    ed.liveBegin();
  };

  const movePan = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d || !activeVideo) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) setFramingOpen(true);
    d.moved = true;
    ed.setClipFraming(activeVideo.id, { x: d.fx + dx / d.w, y: d.fy + dy / d.h });
  };

  const endPan = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved) suppressClick.current = true;
    ed.liveEnd();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[12.5px] font-semibold text-slate-200">{ed.project.title}</span>
          <span className="hidden rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-400 sm:inline">
            {aspect === '9:16' ? '숏폼 9:16' : '롱폼 16:9'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFramingOpen((v) => !v)}
            className={`flex h-[30px] items-center gap-1 rounded-lg border px-2 text-[10.5px] font-semibold transition ${
              framingOpen ? 'border-lime-400/40 bg-lime-400/15 text-lime-200' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200'
            }`}
            aria-pressed={framingOpen}
            title="이 비율의 화면 위치·확대 조정"
          >
            🎯 프레이밍
          </button>
          <Segmented
            size="sm"
            value={aspect}
            onChange={setAspect}
            options={[
              { value: '16:9', label: '16:9', hint: '유튜브 롱폼' },
              { value: '9:16', label: '9:16', hint: '숏폼 · 릴스 · 쇼츠' },
            ]}
          />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 py-2.5 md:px-4">
        <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(60%_50%_at_50%_40%,rgba(120,170,255,.10),transparent_70%)]" />
        <div className="relative flex h-full w-full items-center justify-center">
          <canvas
            ref={canvasRef}
            width={aspect === '9:16' ? 720 : 1280}
            height={aspect === '9:16' ? 1280 : 720}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              ed.togglePlay();
            }}
            className={`grain max-h-full max-w-full touch-none rounded-xl border border-white/10 bg-black shadow-[0_30px_80px_-40px_rgba(0,0,0,.9)] ${
              activeVideo ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
            } ${aspect === '9:16' ? 'h-full w-auto' : 'w-full'}`}
            style={{ aspectRatio: aspect === '9:16' ? '9 / 16' : '16 / 9' }}
          />
          {framingOpen && (
            <div className="absolute inset-x-0 bottom-1 z-20 mx-auto max-w-[320px] px-1">
              <FramingPanel onClose={() => setFramingOpen(false)} />
            </div>
          )}
          {aspect === '9:16' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                ed.commit((p) => ({ ...p, safeZone: !p.safeZone }));
              }}
              className={`absolute right-3 top-3 hidden rounded-lg border px-2 py-1.5 text-[10.5px] font-semibold backdrop-blur transition lg:block ${
                ed.project.safeZone
                  ? 'border-rose-400/40 bg-rose-500/15 text-rose-200'
                  : 'border-white/15 bg-black/40 text-slate-300 hover:bg-black/60'
              }`}
              aria-pressed={ed.project.safeZone}
            >
              안전영역 {ed.project.safeZone ? 'ON' : 'OFF'}
            </button>
          )}
          {!playing && (
            <button
              type="button"
              onClick={() => ed.togglePlay()}
              className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-xl text-white backdrop-blur transition hover:scale-105 hover:bg-black/65"
              aria-label="재생"
            >
              ▶
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 pb-2 md:px-4">
        <button type="button" onClick={() => ed.togglePlay()} className="btn btn-primary h-10 w-10 !px-0 text-[14px]" aria-label={playing ? '일시정지' : '재생'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button type="button" onClick={() => ed.stop()} className="btn btn-ghost h-10 w-10 !px-0" aria-label="정지">
          ■
        </button>
        <div className="flex items-baseline gap-1 font-mono text-[12px]">
          <span className="text-lime-200">{formatTimecode(t)}</span>
          <span className="text-slate-600">/ {formatTimecode(total)}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {activeVoice && (
            <span className="hidden items-center gap-1 rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-[10.5px] text-violet-200 sm:flex">
              🎙 성우 발화 중 · 덕킹
            </span>
          )}
          {aspect === '9:16' && (
            <button
              type="button"
              onClick={() => ed.commit((p) => ({ ...p, safeZone: !p.safeZone }))}
              aria-pressed={ed.project.safeZone}
              className={`flex h-9 items-center gap-1 rounded-lg border px-2 text-[10.5px] font-semibold lg:hidden ${
                ed.project.safeZone ? 'border-rose-400/40 bg-rose-500/15 text-rose-200' : 'border-white/10 bg-white/[0.03] text-slate-400'
              }`}
            >
              안전영역 {ed.project.safeZone ? 'ON' : 'OFF'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const next = !ed.project.music;
              ed.commit((p) => ({ ...p, music: next }));
            }}
            className={`flex h-9 items-center gap-1 rounded-lg border px-2 text-[11px] transition ${
              ed.project.music ? 'border-lime-400/30 bg-lime-400/10 text-lime-200' : 'border-white/10 bg-white/[0.03] text-slate-400'
            }`}
            title="BGM 재생"
          >
            ♪ BGM
          </button>
        </div>
      </div>
    </div>
  );
}
