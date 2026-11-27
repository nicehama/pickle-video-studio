'use client';

import { useRef, useState } from 'react';
import { audioEngine, sfxParamFor } from '@/lib/audio-engine';
import { useEditor } from '@/lib/editor-context';
import { projectDuration } from '@/lib/editor-ops';
import { drawFrame } from '@/lib/renderer';
import { downloadBlob, downloadText, toSrt } from '@/lib/srt';
import { RESOLUTIONS, type ResolutionKey } from '@/lib/data';
import { LANG_LABEL, type Lang } from '@/lib/types';
import { Pill, Slider, Toggle } from './ui';

export function ExportModal({ onClose }: { onClose: () => void }) {
  const ed = useEditor();
  const [res, setRes] = useState<ResolutionKey>('1080p');
  const [lufs, setLufs] = useState(true);
  const [burnIn, setBurnIn] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const cancelRef = useRef(false);
  const total = projectDuration(ed.project);
  const [range, setRange] = useState<number>(Math.min(total, 60));

  const aspect = ed.project.aspect;
  const long = RESOLUTIONS[res];
  const w = aspect === '9:16' ? long : Math.round((long * 16) / 9 / 2) * 2;
  const h = aspect === '9:16' ? Math.round((long * 16) / 9 / 2) * 2 : long;

  const exportWebm = async () => {
    if (typeof MediaRecorder === 'undefined') {
      ed.toast('이 브라우저는 MediaRecorder를 지원하지 않습니다. PNG·SRT로 내보내세요', 'warn');
      return;
    }
    cancelRef.current = false;
    setNote('');
    setProgress(0);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const stream = canvas.captureStream(30);
    const audioStream = audioEngine.exportStream(lufs);
    audioStream?.getAudioTracks().forEach((tr) => stream.addTrack(tr));

    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: res === '1080p' ? 6_000_000 : 4_000_000 });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });
    recorder.start(250);

    // 오디오: 효과음·BGM을 실제 시간에 맞춰 넣는다 (브라우저 음성 TTS는 캡처 불가)
    audioEngine.ensure();
    if (ed.project.music) {
      const bgm = ed.project.clips.find((c) => c.track === 'bgm');
      if (bgm?.bgmPreset) audioEngine.startBgm(bgm.bgmPreset);
    }
    ed.project.clips
      .filter((c) => c.track === 'sfx' && c.sfx && c.start < range)
      .forEach((c) => {
        const { param, key } = sfxParamFor(c.sfx!.category, c.sfx!.emotion, c.sfx!.intensity, c.sfx!.variation);
        void audioEngine.playSfx(param, key, c.start);
      });

    const stills = new Map<string, HTMLVideoElement>();
    ed.videos.current.forEach((v, id) => stills.set(id, v));
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        const elapsed = (performance.now() - started) / 1000;
        const t = Math.min(range, elapsed);
        drawFrame(ctx, w, h, {
          project: burnIn ? ed.project : { ...ed.project, clips: ed.project.clips.filter((c) => c.track !== 'subtitle') },
          time: t,
          videos: ed.videos.current,
          showSafeZone: false,
          showBadges: false,
        });
        setProgress(Math.min(1, elapsed / range));
        if (cancelRef.current || elapsed >= range) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    recorder.stop();
    audioEngine.stopBgm();
    audioEngine.stopSfx();
    const blob = await finished;
    downloadBlob(`${slug(ed.project.title)}_${aspect.replace(':', 'x')}_${res}.webm`, blob);
    setProgress(null);
    setNote(`내보내기 완료 · ${(blob.size / 1024 / 1024).toFixed(1)}MB · 브라우저 음성(TTS)은 파일에 포함되지 않습니다`);
    ed.toast('WebM 파일을 내려받았습니다');
  };

  const saveFrame = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawFrame(ctx, w, h, { project: ed.project, time: ed.time.t, videos: ed.videos.current, showSafeZone: false, showBadges: false });
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(`${slug(ed.project.title)}_${ed.time.t.toFixed(1)}s.png`, blob);
    }, 'image/png');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-900 p-4 shadow-2xl sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-white">내보내기</h2>
            <p className="text-[11px] text-slate-500">유튜브 롱폼 · 숏폼 그대로, 자막 번인과 SRT를 함께 뽑습니다.</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost h-9 w-9 !px-0" aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">해상도</div>
            <div className="mt-1 flex gap-1">
              {(Object.keys(RESOLUTIONS) as ResolutionKey[]).map((k) => (
                <button key={k} type="button" onClick={() => setRes(k)} className={`chip flex-1 justify-center ${res === k ? 'chip-on' : ''}`}>
                  {k}
                </button>
              ))}
            </div>
            <div className="mt-1.5 font-mono text-[10.5px] text-slate-400">
              {w} × {h} · {aspect === '9:16' ? '9:16 숏폼' : '16:9 롱폼'} · 30fps
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">구간</div>
            <Slider label="길이" value={range} min={2} max={Math.max(2, Math.round(total))} step={1} onChange={setRange} format={(v) => `${v}s / ${total.toFixed(0)}s`} />
            <div className="font-mono text-[10px] text-slate-500">0s ~ {range}s</div>
          </div>
        </div>

        <div className="mt-2 space-y-1.5">
          <Toggle on={lufs} onChange={setLufs} label="음량 −14 LUFS 표준화" desc="유튜브 권장 음량. 합성 오디오에 근사 노멀라이즈를 적용합니다." />
          <Toggle on={burnIn} onChange={setBurnIn} label="자막 번인" desc={ed.project.lang === 'ko' ? '한국어 자막을 영상에 굽습니다.' : `${LANG_LABEL[ed.project.lang]} 자막을 영상에 굽습니다.`} />
        </div>

        <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">자막 파일 (SRT)</div>
          <div className="grid grid-cols-4 gap-1">
            {(['ko', 'en', 'ja', 'es'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  downloadText(`${slug(ed.project.title)}_${l}.srt`, toSrt(ed.project, l), 'application/x-subrip;charset=utf-8');
                  ed.toast(`${LANG_LABEL[l]} SRT를 내려받았습니다`);
                }}
                className="chip justify-center !text-[10px]"
              >
                .srt {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {progress !== null && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
              <span>렌더링 중…</span>
              <span className="font-mono text-lime-200">{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-lime-400 transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="mt-1 text-[10px] leading-snug text-slate-500">
              실시간으로 캔버스를 기록합니다. 내보내는 동안 소리가 함께 재생됩니다.
            </p>
          </div>
        )}

        {note && <p className="mt-2 rounded-lg bg-lime-400/10 px-2 py-1.5 text-[10.5px] text-lime-200">{note}</p>}

        <div className="mt-3 flex gap-1.5">
          <button type="button" onClick={saveFrame} className="btn flex-1 text-[12px]">
            현재 프레임 PNG
          </button>
          <button
            type="button"
            onClick={() => {
              cancelRef.current = true;
            }}
            className="btn hidden text-[12px]"
            aria-hidden
          >
            취소
          </button>
          <button type="button" onClick={() => void exportWebm()} disabled={progress !== null} className="btn btn-primary flex-[1.4] text-[12px]">
            {progress !== null ? '렌더링 중…' : `WebM 내보내기 (${range}s)`}
          </button>
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
          <Pill tone={lufs ? 'ok' : 'default'}>−14 LUFS</Pill>
          <Pill tone={burnIn ? 'ok' : 'default'}>자막 번인</Pill>
          <Pill tone="info">SRT 4개 언어</Pill>
        </div>
      </div>
    </div>
  );
}

function slug(title: string) {
  return title.replace(/[^\w가-힣]+/g, '_').slice(0, 40) || 'export';
}
