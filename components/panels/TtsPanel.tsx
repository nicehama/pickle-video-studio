'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '@/lib/editor-context';
import { TONES, VOICE_LANG, toneById, uid } from '@/lib/data';
import { LANG_LABEL, type Lang, type Tone } from '@/lib/types';
import { estimateDuration, listVoices, pickVoice, speak, type SpeakHandle } from '@/lib/tts';
import { Pill, SectionTitle, Segmented, Slider } from '../ui';

const SAMPLE = '실외기에서 나는 소리, 3분이면 원인을 찾을 수 있습니다.<0.6s> 팬 밸런스부터 확인하세요.';

export function TtsPanel() {
  const ed = useEditor();
  const selected = ed.project.clips.find((c) => c.id === ed.selectedId && c.track === 'voice');
  const [lang, setLang] = useState<Lang>('ko');
  const [tone, setTone] = useState<Tone>('doc');
  const [text, setText] = useState(SAMPLE);
  const [rate, setRate] = useState(0.96);
  const [pitch, setPitch] = useState(0.94);
  const [volume, setVolume] = useState(1);
  const [voiceURI, setVoiceURI] = useState<string>('');
  const [playing, setPlaying] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const handleRef = useRef<SpeakHandle | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const voices = useMemo(() => listVoices(lang), [lang, ed.voicesReady]);

  useEffect(() => {
    if (selected?.voice) {
      setLang(selected.voice.lang);
      setTone(selected.voice.tone);
      setText(selected.voice.text);
      setRate(selected.voice.rate);
      setPitch(selected.voice.pitch);
      setVolume(selected.voice.volume);
      setVoiceURI(selected.voice.voiceURI ?? '');
    }
  }, [selected?.id]);

  const dur = estimateDuration(text, rate, lang);

  const stop = () => {
    handleRef.current?.cancel();
    handleRef.current = null;
    audioRef.current?.pause();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlaying(false);
  };

  const preview = async () => {
    stop();
    setPlaying(true);
    if (ed.caps.tts !== 'browser') {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, lang, tone, rate, pitch, voiceId: undefined }),
        });
        const type = res.headers.get('content-type') ?? '';
        if (type.includes('audio')) {
          const blob = await res.blob();
          const audio = new Audio(URL.createObjectURL(blob));
          audioRef.current = audio;
          audio.onended = () => setPlaying(false);
          await audio.play();
          return;
        }
      } catch {
        /* 폴백 */
      }
    }
    handleRef.current = speak(text, { lang, rate, pitch, volume, voiceURI: voiceURI || undefined });
    void handleRef.current.done.then(() => setPlaying(false));
  };

  const applyTone = (t: Tone) => {
    const p = toneById(t);
    setTone(t);
    setRate(p.rate);
    setPitch(p.pitch);
    setVolume(p.volume);
  };

  const insertPause = (sec: number) => {
    const ta = taRef.current;
    const token = `<${sec}s>`;
    if (!ta) {
      setText((t) => t + token);
      return;
    }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    const next = text.slice(0, start) + token + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const addToTimeline = () => {
    if (!text.trim()) {
      ed.toast('대사나 나레이션을 입력하세요', 'warn');
      return;
    }
    const clip = {
      id: uid('t'),
      track: 'voice' as const,
      start: Math.round(ed.time.t * 20) / 20,
      duration: Math.max(0.8, Math.round(dur * 10) / 10),
      label: `성우 · ${toneById(tone).name}`,
      voice: { text, lang, tone, rate, pitch, volume, voiceURI: voiceURI || undefined },
    };
    ed.commit((p) => ({ ...p, clips: [...p.clips, clip] }));
    ed.select(clip.id);
    ed.toast(`성우 클립 ${dur.toFixed(1)}초를 추가했습니다`);
  };

  const updateSelected = () => {
    if (!selected) return;
    ed.commit((p) => ({
      ...p,
      clips: p.clips.map((c) =>
        c.id === selected.id
          ? { ...c, label: `성우 · ${toneById(tone).name}`, duration: Math.max(0.6, Math.round(dur * 10) / 10), voice: { text, lang, tone, rate, pitch, volume, voiceURI: voiceURI || undefined } }
          : c,
      ),
    }));
    ed.toast('성우 클립을 업데이트했습니다');
  };

  const providerLabel =
    ed.caps.tts === 'browser'
      ? '브라우저 음성 · API 키 연결 시 자동 전환'
      : ed.caps.tts === 'elevenlabs'
        ? 'ElevenLabs 음성 연결됨'
        : 'OpenAI 음성 연결됨';

  return (
    <div className="space-y-3.5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <SectionTitle>AI 성우</SectionTitle>
          <p className="-mt-1 text-[11px] leading-snug text-slate-500">감정 톤 · 호흡 · 속도/피치/강세를 조절해 낭독합니다.</p>
        </div>
        <Pill tone={ed.caps.tts === 'browser' ? 'warn' : 'ok'}>TTS</Pill>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-[10.5px] leading-snug text-slate-400">
        <span className="mr-1">{ed.caps.tts === 'browser' ? '🔈' : '🎧'}</span>
        {providerLabel}
      </div>

      <div>
        <div className="mb-1 text-[11px] font-medium text-slate-400">언어</div>
        <Segmented
          size="sm"
          value={lang}
          onChange={(v) => {
            setLang(v);
            setVoiceURI('');
          }}
          options={(Object.keys(LANG_LABEL) as Lang[]).map((l) => ({ value: l, label: LANG_LABEL[l] }))}
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-400">감정 톤</span>
          <span className="text-[10px] text-slate-600">{tonesHint(tone)}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTone(t.id)}
              className={`rounded-xl border px-2.5 py-2 text-left transition ${
                tone === t.id ? 'border-lime-400/50 bg-lime-400/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06]'
              }`}
            >
              <div className={`text-[11.5px] font-semibold ${tone === t.id ? 'text-lime-200' : 'text-slate-200'}`}>{t.name}</div>
              <div className="text-[9.5px] leading-tight text-slate-500">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-400">대사 / 나레이션</span>
          <span className="font-mono text-[10px] text-slate-500">{text.length}자</span>
        </div>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="field resize-none leading-relaxed"
          placeholder="읽을 문장을 입력하세요. <0.5s> 로 숨을 넣을 수 있습니다."
        />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {[0.3, 0.6, 1].map((s) => (
            <button key={s} type="button" onClick={() => insertPause(s)} className="chip">
              + 숨 {s}s
            </button>
          ))}
          <button type="button" onClick={() => setText((t) => t.replace(/\s+/g, ' ').trim())} className="chip">
            공백 정리
          </button>
        </div>
      </div>

      <div className="space-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
        <Slider label="속도" value={rate} min={0.5} max={1.7} step={0.01} onChange={setRate} format={(v) => `${v.toFixed(2)}x`} />
        <Slider label="피치" value={pitch} min={0.6} max={1.7} step={0.01} onChange={setPitch} />
        <Slider label="강세 · 음량" value={volume} min={0} max={1} step={0.01} onChange={setVolume} format={(v) => `${Math.round(v * 100)}%`} />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-violet-400/20 bg-violet-500/[0.07] px-2.5 py-2">
        <div>
          <div className="text-[10.5px] text-slate-400">예상 길이</div>
          <div className="font-mono text-[13px] font-semibold text-violet-200">{dur.toFixed(1)}초</div>
        </div>
        <div className="text-right text-[9.5px] leading-tight text-slate-500">
          {voices.length ? `${voices.length}개 음성` : '시스템 음성 사용'}
          <br />
          {VOICE_LANG[lang]}
        </div>
      </div>

      <div className="flex gap-1.5">
        <button type="button" onClick={playing ? stop : () => void preview()} className={`btn flex-1 ${playing ? '' : 'btn-primary'}`}>
          {playing ? '■ 중지' : '▶ 미리듣기'}
        </button>
        <button type="button" onClick={selected ? updateSelected : addToTimeline} className="btn flex-1">
          {selected ? '선택 클립 업데이트' : '+ 타임라인'}
        </button>
      </div>

      {voices.length > 1 && (
        <select
          value={voiceURI || (pickVoice(lang)?.voiceURI ?? '')}
          onChange={(e) => setVoiceURI(e.target.value)}
          className="field text-[11.5px]"
          aria-label="음성 선택"
        >
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} · {v.lang}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function tonesHint(tone: Tone) {
  const p = toneById(tone);
  return `${p.rate.toFixed(2)}x · 피치 ${p.pitch.toFixed(2)}`;
}
