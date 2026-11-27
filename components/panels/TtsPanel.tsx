'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '@/lib/audio-engine';
import { useEditor } from '@/lib/editor-context';
import { TONES, VOICE_LANG, toneById, uid } from '@/lib/data';
import { LANG_LABEL, type Lang, type Tone, type VoiceSpec } from '@/lib/types';
import { estimateDuration, listVoices, pickVoice, speak, type SpeakHandle } from '@/lib/tts';
import { getVoiceAudio, lastVoiceError, peekVoiceBuffer, voiceCacheKey } from '@/lib/voice-audio';
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
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const handleRef = useRef<SpeakHandle | null>(null);
  const timerRef = useRef<number | null>(null);

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
    audioEngine.stopVoice();
    audioEngine.stopElement();
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlaying(false);
  };

  const spec = (): VoiceSpec => ({ text, lang, tone, rate, pitch, volume, voiceURI: voiceURI || undefined });

  /** 재생이 실제로 소리를 내는지 확인 — iOS 무음 스위치·잠금 상태면 안내하고 <audio>로 재시도 */
  const watchAudible = (blob?: Blob) => {
    window.setTimeout(() => {
      const st = audioEngine.state;
      if (st !== 'suspended' && st !== 'interrupted') return;
      if (blob) {
        void audioEngine.playBlobElement(blob, volume).then((ok) => {
          if (!ok) ed.toast('소리가 안 들리면 아이폰 측면 무음 스위치를 끄고 볼륨을 올려 주세요', 'warn');
        });
      } else {
        ed.toast('소리가 안 들리면 아이폰 측면 무음 스위치를 끄고 볼륨을 올려 주세요', 'warn');
      }
    }, 450);
  };

  const preview = async () => {
    // 클릭 직후 동기적으로 오디오 잠금을 푼다 (iOS Safari·인앱 브라우저 필수)
    audioEngine.syncUnlock();
    stop();
    setPlaying(true);
    setNote('');
    const s = spec();
    if (ed.caps.tts !== 'browser') {
      setBusy(true);
      setNote('ElevenLabs 음성 만드는 중…');
      const res = await getVoiceAudio(s);
      setBusy(false);
      if (res) {
        setNote(
          `${res.provider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI'} 음성 · ${res.buffer.duration.toFixed(1)}초${res.fromCache ? ' · 캐시 재사용' : ''}`,
        );
        audioEngine.playBuffer(res.buffer, { volume, kind: 'voice' });
        watchAudible(res.blob);
        timerRef.current = window.setTimeout(() => setPlaying(false), Math.max(400, res.buffer.duration * 1000));
        return;
      }
      const why = lastVoiceError();
      setNote(`ElevenLabs 음성을 못 받아 브라우저 음성으로 재생합니다${why ? ` · ${why}` : ''}`);
      ed.toast('ElevenLabs 음성을 못 받아 브라우저 음성으로 재생합니다', 'warn');
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

  /** 타임라인에 넣기 전에 실제 오디오를 만들어 길이를 맞춘다 (같은 문장은 캐시 재사용) */
  const prepareVoice = async (): Promise<{ spec: VoiceSpec; duration: number; provider: string }> => {
    const s = spec();
    let duration = Math.max(0.8, Math.round(dur * 10) / 10);
    let provider = 'browser';
    if (ed.caps.tts !== 'browser') {
      setBusy(true);
      setNote(
        peekVoiceBuffer(s) ? '저장된 ElevenLabs 음성을 쓰는 중…' : 'ElevenLabs 음성을 만드는 중… (몇 초 걸립니다)',
      );
      const res = await getVoiceAudio(s);
      setBusy(false);
      if (res) {
        duration = Math.max(0.3, Math.round(res.buffer.duration * 100) / 100);
        provider = res.provider;
        setNote(`${provider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI'} 음성 준비 완료 · ${duration.toFixed(1)}초`);
      } else {
        const why = lastVoiceError();
        setNote(`ElevenLabs 음성을 못 받아 브라우저 음성으로 넣습니다${why ? ` · ${why}` : ''}`);
        ed.toast('ElevenLabs 음성을 못 받아 브라우저 음성으로 넣습니다', 'warn');
      }
    }
    return { spec: { ...s, provider, audioKey: voiceCacheKey(s) }, duration, provider };
  };

  const addToTimeline = async () => {
    if (!text.trim()) {
      ed.toast('대사나 나레이션을 입력하세요', 'warn');
      return;
    }
    audioEngine.syncUnlock();
    const ready = await prepareVoice();
    const clip = {
      id: uid('t'),
      track: 'voice' as const,
      start: Math.round(ed.time.t * 20) / 20,
      duration: ready.duration,
      label: `성우 · ${toneById(tone).name}${ready.provider === 'browser' ? ' · 브라우저' : ''}`,
      voice: ready.spec,
    };
    ed.commit((p) => ({ ...p, clips: [...p.clips, clip] }));
    ed.select(clip.id);
    ed.toast(
      `${ready.provider === 'elevenlabs' ? 'ElevenLabs' : ready.provider === 'openai' ? 'OpenAI' : '브라우저'} 성우 ${ready.duration.toFixed(1)}초를 추가했습니다`,
      ready.provider === 'browser' ? 'warn' : 'ok',
    );
  };

  const updateSelected = async () => {
    if (!selected) return;
    audioEngine.syncUnlock();
    const ready = await prepareVoice();
    ed.commit((p) => ({
      ...p,
      clips: p.clips.map((c) =>
        c.id === selected.id
          ? {
              ...c,
              label: `성우 · ${toneById(tone).name}${ready.provider === 'browser' ? ' · 브라우저' : ''}`,
              duration: ready.duration,
              voice: ready.spec,
            }
          : c,
      ),
    }));
    ed.toast('성우 클립을 업데이트했습니다');
  };

  const providerLabel =
    ed.caps.tts === ''
      ? '음성 엔진 확인 중…'
      : ed.caps.tts === 'browser'
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
        <div className="mt-0.5 text-[10px] text-slate-500">같은 문장은 다시 만들지 않고 저장된 음성을 재사용합니다.</div>
        {note && <div className="mt-1 text-[10px] text-lime-200/90">{note}</div>}
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

      <p className="text-[10px] leading-snug text-slate-500">
        속도는 AI 음성 생성에 반영되고, 피치는 브라우저 음성에서만 적용됩니다. 생성된 음성은 타임라인 재생과 내보내기에 그대로 들어갑니다.
      </p>

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
        <button
          type="button"
          onClick={playing ? stop : () => void preview()}
          disabled={busy}
          className={`btn flex-1 ${playing ? '' : 'btn-primary'} disabled:opacity-60`}
        >
          {busy ? '⏳ 생성 중…' : playing ? '■ 중지' : '▶ 미리듣기'}
        </button>
        <button
          type="button"
          onClick={() => void (selected ? updateSelected() : addToTimeline())}
          disabled={busy}
          className="btn flex-1 disabled:opacity-60"
        >
          {busy ? '⏳ 생성 중…' : selected ? '선택 클립 업데이트' : '+ 타임라인'}
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
