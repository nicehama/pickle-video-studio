'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '@/lib/audio-engine';
import { uid } from '@/lib/data';
import { useEditor } from '@/lib/editor-context';
import { sfxParamFor } from '@/lib/audio-engine';
import { buildSfxParam } from '@/lib/sfx';
import { SFX_CATEGORIES, SFX_EMOTIONS, SFX_INTENSITIES, VARIATION_COUNT, parsePrompt } from '@/lib/data';
import type { SfxSpec } from '@/lib/types';
import { Pill, SectionTitle } from '../ui';

function Waveform({ param, sig }: { param: ReturnType<typeof buildSfxParam>; sig: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let alive = true;
    import('@/lib/sfx').then(({ getSfxBuffer }) => {
      void getSfxBuffer(param, sig).then((buf) => {
        if (!alive) return;
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const dpr = 2;
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
        const data = buf.getChannelData(0);
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const bars = Math.floor(w / 3);
        const step = Math.floor(data.length / bars) || 1;
        for (let i = 0; i < bars; i++) {
          let peak = 0;
          for (let j = 0; j < step; j += 4) peak = Math.max(peak, Math.abs(data[i * step + j] ?? 0));
          const bh = Math.max(1.5, peak * h * 0.95);
          ctx.fillStyle = 'rgba(253, 200, 100, 0.85)';
          ctx.fillRect(i * 3, (h - bh) / 2, 1.6, bh);
        }
      });
    });
    return () => {
      alive = false;
    };
  }, [param, sig]);
  return <canvas ref={ref} className="h-8 w-full" />;
}

export function SfxPanel() {
  const ed = useEditor();
  const [category, setCategory] = useState('animal');
  const [emotion, setEmotion] = useState('happy');
  const [intensity, setIntensity] = useState('near');
  const [prompt, setPrompt] = useState('강아지가 반가워서 가까이에서 짖는 소리');
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);

  const guess = useMemo(() => parsePrompt(prompt), [prompt]);

  const params = useMemo(
    () => Array.from({ length: VARIATION_COUNT }, (_, v) => buildSfxParam(category, emotion, intensity, v)),
    [category, emotion, intensity],
  );

  const playVariation = async (v: number) => {
    const { param, key } = sfxParamFor(category, emotion, intensity, v);
    setPlayingIdx(v);
    audioEngine.ensure();
    const dur = await audioEngine.playSfx(param, key);
    window.setTimeout(() => setPlayingIdx((cur) => (cur === v ? null : cur)), Math.max(300, dur * 1000));
  };

  const insert = (v: number) => {
    const spec: SfxSpec = { prompt, category, emotion, intensity, variation: v };
    const param = buildSfxParam(category, emotion, intensity, v);
    const clip = {
      id: uid('f'),
      track: 'sfx' as const,
      start: Math.round(ed.time.t * 20) / 20,
      duration: Math.round(param.duration * 10) / 10,
      label: `${SFX_CATEGORIES.find((c) => c.id === category)?.name} · ${SFX_EMOTIONS.find((e) => e.id === emotion)?.name}`,
      sfx: spec,
    };
    ed.commit((p) => ({ ...p, clips: [...p.clips, clip] }));
    ed.select(clip.id);
    ed.toast('효과음을 타임라인에 넣었습니다 (성우 구간에서는 자동 덕킹)');
  };

  const applyGuess = () => {
    setCategory(guess.category);
    setEmotion(guess.emotion);
    setIntensity(guess.intensity);
    ed.toast(guess.note, 'info');
  };

  return (
    <div className="space-y-3.5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <SectionTitle>효과음 스튜디오</SectionTitle>
          <p className="-mt-1 text-[11px] leading-snug text-slate-500">상황을 한 줄로 쓰면 태그로 해석해 변주 4종을 합성합니다.</p>
        </div>
        <Pill tone={ed.caps.sfx === 'synth' ? 'warn' : 'ok'}>SFX</Pill>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-400">한 줄 프롬프트</span>
          <button type="button" onClick={applyGuess} className="text-[10.5px] font-semibold text-lime-300 hover:underline">
            해석 적용
          </button>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="field resize-none text-[12px] leading-relaxed"
          placeholder="예: 강아지가 경계하며 낮게 으르렁대는 소리 (멀리서)"
        />
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
          <span className="text-slate-400">자동 해석</span>
          <Pill tone="info">{SFX_CATEGORIES.find((c) => c.id === guess.category)?.name}</Pill>
          <Pill tone="info">{SFX_EMOTIONS.find((e) => e.id === guess.emotion)?.name}</Pill>
          <Pill tone="info">{SFX_INTENSITIES.find((i) => i.id === guess.intensity)?.name}</Pill>
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px] font-medium text-slate-400">① 카테고리</div>
        <div className="flex flex-wrap gap-1">
          {SFX_CATEGORIES.map((c) => (
            <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={`chip ${category === c.id ? 'chip-on' : ''}`}>
              <span>{c.icon}</span> {c.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px] font-medium text-slate-400">② 감정 · 뉘앙스</div>
        <div className="flex flex-wrap gap-1">
          {SFX_EMOTIONS.map((e) => (
            <button key={e.id} type="button" onClick={() => setEmotion(e.id)} className={`chip ${emotion === e.id ? 'chip-on' : ''}`}>
              {e.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px] font-medium text-slate-400">③ 강도 · 거리감</div>
        <div className="flex flex-wrap gap-1">
          {SFX_INTENSITIES.map((i) => (
            <button key={i.id} type="button" onClick={() => setIntensity(i.id)} className={`chip ${intensity === i.id ? 'chip-on' : ''}`}>
              {i.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-400">변주 {VARIATION_COUNT}종</span>
          <span className="text-[10px] text-slate-600">Web Audio 실시간 합성</span>
        </div>
        <div className="space-y-1.5">
          {params.map((param, v) => {
            const sig = `${category}|${emotion}|${intensity}|${v}`;
            return (
              <div key={v} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-1.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void playVariation(v)}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[11px] ${
                      playingIdx === v ? 'border-amber-300/60 bg-amber-400/20 text-amber-100' : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10'
                    }`}
                    aria-label={`변주 ${v + 1} 미리듣기`}
                  >
                    {playingIdx === v ? '❚❚' : '▶'}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-semibold text-slate-300">변주 {v + 1}</span>
                      <span className="font-mono text-[9.5px] text-slate-500">{param.duration.toFixed(1)}s</span>
                    </div>
                    <Waveform param={param} sig={sig} />
                  </div>
                  <button type="button" onClick={() => insert(v)} className="chip shrink-0 !px-2 text-[10px]">
                    넣기
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-2 text-[10.5px] leading-snug text-amber-100/80">
        🎚 성우가 말하는 구간에 효과음·BGM이 겹치면 자동으로 <b>−8dB 덕킹</b>되고, 타임라인에 <b>DUCK</b> 표시가 붙습니다.
        {ed.caps.sfx === 'synth' ? ' ELEVENLABS_API_KEY 를 넣으면 같은 화면에서 실제 사운드 이펙트 API 로 바뀝니다.' : ''}
      </div>
    </div>
  );
}
