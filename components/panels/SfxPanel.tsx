'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '@/lib/audio-engine';
import { uid } from '@/lib/data';
import { useEditor } from '@/lib/editor-context';
import { buildSfxParam } from '@/lib/sfx';
import { getSfxAudio, isSfxCached, lastSfxError, sfxCacheKey } from '@/lib/sfx-audio';
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
  const [genIdx, setGenIdx] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [tick, setTick] = useState(0);

  const guess = useMemo(() => parsePrompt(prompt), [prompt]);

  const params = useMemo(
    () => Array.from({ length: VARIATION_COUNT }, (_, v) => buildSfxParam(category, emotion, intensity, v)),
    [category, emotion, intensity],
  );

  const specFor = (v: number): SfxSpec => ({ prompt, category, emotion, intensity, variation: v });

  /** ElevenLabs 효과음 → 실패 시에만 합성음. 결과는 캐시되어 다시 생성하지 않는다. */
  const prepare = async (v: number): Promise<{ spec: SfxSpec; duration: number; provider: string; buffer: AudioBuffer }> => {
    const spec = specFor(v);
    setGenIdx(v);
    setNote(isSfxCached(spec) ? '저장된 효과음을 쓰는 중…' : 'ElevenLabs 효과음을 만드는 중… (몇 초 걸립니다)');
    const res = await getSfxAudio(spec);
    setGenIdx(null);
    setTick((t) => t + 1);
    if (res.provider === 'elevenlabs') {
      setNote(`ElevenLabs 효과음 준비 완료 · ${res.buffer.duration.toFixed(1)}초${res.fromCache ? ' · 캐시 재사용' : ''}`);
    } else {
      const why = lastSfxError();
      setNote(`ElevenLabs 효과음을 못 받아 합성음으로 재생합니다${why ? ` · ${why}` : ''}`);
    }
    return { spec: { ...spec, provider: res.provider, audioKey: sfxCacheKey(spec) }, duration: res.buffer.duration, provider: res.provider, buffer: res.buffer };
  };

  const playVariation = async (v: number) => {
    // 클릭 핸들러 안에서 동기 unlock (iOS Safari·인앱 브라우저)
    audioEngine.syncUnlock();
    audioEngine.stopSfx();
    setPlayingIdx(v);
    const ready = await prepare(v);
    if (ready.provider === 'synth') {
      ed.toast('ElevenLabs 효과음을 못 받아 합성음으로 재생합니다', 'warn');
    }
    const played = audioEngine.playBuffer(ready.buffer, { kind: 'sfx' });
    window.setTimeout(() => setPlayingIdx((cur) => (cur === v ? null : cur)), Math.max(300, (played || ready.duration) * 1000));
    window.setTimeout(() => {
      const st = audioEngine.state;
      if (st === 'suspended' || st === 'interrupted') {
        ed.toast('소리가 안 들리면 아이폰 측면 무음 스위치를 끄고 볼륨을 올려 주세요', 'warn');
      }
    }, 450);
  };

  const insert = async (v: number) => {
    audioEngine.syncUnlock();
    const ready = await prepare(v);
    const clip = {
      id: uid('f'),
      track: 'sfx' as const,
      start: Math.round(ed.time.t * 20) / 20,
      duration: Math.max(0.3, Math.round(ready.duration * 100) / 100),
      label: `${SFX_CATEGORIES.find((c) => c.id === category)?.name} · ${SFX_EMOTIONS.find((e) => e.id === emotion)?.name} v${v + 1}`,
      sfx: ready.spec,
    };
    ed.commit((p) => ({ ...p, clips: [...p.clips, clip] }));
    ed.select(clip.id);
    ed.toast(
      `${ready.provider === 'elevenlabs' ? 'ElevenLabs' : '합성'} 효과음 ${ready.duration.toFixed(1)}초를 타임라인에 넣었습니다`,
      ready.provider === 'elevenlabs' ? 'ok' : 'warn',
    );
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
          <span className="text-[10px] text-slate-600">
            {ed.caps.sfx === 'elevenlabs' ? 'ElevenLabs 사운드 API · 캐시 재사용' : 'Web Audio 실시간 합성'}
          </span>
        </div>
        {note && <div className="mb-1.5 rounded-lg bg-lime-400/[0.08] px-2 py-1 text-[10px] text-lime-200/90">{note}</div>}
        <div className="space-y-1.5">
          {params.map((param, v) => {
            const sig = `${category}|${emotion}|${intensity}|${v}`;
            const cached = isSfxCached(specFor(v));
            void tick;
            return (
              <div key={v} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-1.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void playVariation(v)}
                    disabled={genIdx !== null}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[11px] disabled:opacity-50 ${
                      playingIdx === v ? 'border-amber-300/60 bg-amber-400/20 text-amber-100' : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10'
                    }`}
                    aria-label={`변주 ${v + 1} 미리듣기`}
                  >
                    {genIdx === v ? '⏳' : playingIdx === v ? '❚❚' : '▶'}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10.5px] font-semibold text-slate-300">
                        변주 {v + 1}
                        {cached && <span className="ml-1 text-[9px] text-lime-300/80">AI</span>}
                      </span>
                      <span className="font-mono text-[9.5px] text-slate-500">{param.duration.toFixed(1)}s</span>
                    </div>
                    <Waveform param={param} sig={sig} />
                  </div>
                  <button type="button" onClick={() => void insert(v)} disabled={genIdx !== null} className="chip shrink-0 !px-2 text-[10px] disabled:opacity-50">
                    {genIdx === v ? '⏳' : '넣기'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-2 text-[10.5px] leading-snug text-amber-100/80">
        🎚 성우가 말하는 구간에 효과음·BGM이 겹치면 자동으로 <b>−8dB 덕킹</b>되고, 타임라인에 <b>DUCK</b> 표시가 붙습니다.{' '}
        {ed.caps.sfx === 'elevenlabs'
          ? '미리듣기·넣기를 누를 때 ElevenLabs가 소리를 만들고, 같은 변주는 저장된 오디오를 다시 씁니다(타임라인·WebM 내보내기에도 그대로 들어갑니다).'
          : ' ELEVENLABS_API_KEY 를 넣으면 같은 화면에서 실제 사운드 이펙트 API 로 바뀝니다.'}
      </div>
    </div>
  );
}
