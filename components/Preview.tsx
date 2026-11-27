'use client';

import { useEffect, useRef } from 'react';
import { useEditor, useTime } from '@/lib/editor-context';
import { activeClipAt, drawFrame, formatTimecode } from '@/lib/renderer';
import { clipEnd, projectDuration } from '@/lib/editor-ops';
import { Segmented } from './ui';

export function Preview() {
  const ed = useEditor();
  const { t, playing } = useTime();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
            const target = (vClip.inPoint ?? 0) + (time - vClip.start);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[12.5px] font-semibold text-slate-200">{ed.project.title}</span>
          <span className="hidden rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-400 sm:inline">
            {aspect === '9:16' ? '숏폼 9:16' : '롱폼 16:9'}
          </span>
        </div>
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

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 py-2.5 md:px-4">
        <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(60%_50%_at_50%_40%,rgba(120,170,255,.10),transparent_70%)]" />
        <div className="relative flex h-full w-full items-center justify-center">
          <canvas
            ref={canvasRef}
            width={aspect === '9:16' ? 720 : 1280}
            height={aspect === '9:16' ? 1280 : 720}
            onClick={() => ed.togglePlay()}
            className={`grain max-h-full max-w-full cursor-pointer rounded-xl border border-white/10 bg-black shadow-[0_30px_80px_-40px_rgba(0,0,0,.9)] ${
              aspect === '9:16' ? 'h-full w-auto' : 'w-full'
            }`}
            style={{ aspectRatio: aspect === '9:16' ? '9 / 16' : '16 / 9' }}
          />
          <button
            type="button"
            hidden={aspect !== '9:16'}
            onClick={(e) => {
              e.stopPropagation();
              ed.commit((p) => ({ ...p, safeZone: !p.safeZone }));
            }}
            className={`absolute right-3 top-3 rounded-lg border px-2 py-1.5 text-[10.5px] font-semibold backdrop-blur transition ${
              ed.project.safeZone
                ? 'border-rose-400/40 bg-rose-500/15 text-rose-200'
                : 'border-white/15 bg-black/40 text-slate-300 hover:bg-black/60'
            }`}
            aria-pressed={ed.project.safeZone}
          >
            안전영역 {ed.project.safeZone ? 'ON' : 'OFF'}
          </button>
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
