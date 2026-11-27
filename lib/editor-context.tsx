'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { audioEngine } from './audio-engine';
import { createEmptyProject, createSampleProject, uid } from './data';
import { clipEnd, projectDuration, setFraming } from './editor-ops';
import { clearAll, loadAssets, loadSaved, saveAsset, saveProject } from './persist';
import type { Clip, Framing, MediaAsset, Project, TrackId } from './types';
import { speak, type SpeakHandle } from './tts';
import { getVoiceAudio, lastVoiceError, peekVoiceBuffer, preloadVoice } from './voice-audio';
import { getSfxAudio, lastSfxError, peekSfxBuffer, preloadSfx } from './sfx-audio';

/* --------------------------------------------------------------- */
/* 재생 시간 스토어 — 60fps 갱신을 컨텍스트 밖으로 분리한다          */
/* --------------------------------------------------------------- */
export class TimeStore {
  t = 0;
  playing = false;
  private listeners = new Set<() => void>();
  private version = 0;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  set(t: number, notify = true) {
    this.t = t;
    if (notify) this.emit();
  }
  setPlaying(p: boolean) {
    this.playing = p;
    this.emit();
  }
  emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
}

export function useTime() {
  const ctx = useEditor();
  const v = useSyncExternalStore(ctx.time.subscribe, ctx.time.getVersion, () => 0);
  void v;
  return { t: ctx.time.t, playing: ctx.time.playing };
}

/* --------------------------------------------------------------- */
export interface Toast {
  id: number;
  text: string;
  kind?: 'ok' | 'warn' | 'info';
}

export type SaveState = 'loading' | 'saved' | 'saving' | 'error';

interface EditorApi {
  project: Project;
  commit: (fn: (p: Project) => Project, label?: string) => void;
  replaceProject: (p: Project) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** IndexedDB 자동 저장 상태 */
  saveState: SaveState;
  savedAt: number | null;
  hydrated: boolean;
  saveNow: () => void;
  resetProject: (kind: 'empty' | 'sample' | 'clear') => void;
  /** 드래그·슬라이더처럼 연속된 변경을 한 번의 실행 취소로 묶는다 */
  liveBegin: () => void;
  liveCommit: (fn: (p: Project) => Project) => void;
  liveEnd: () => void;
  setClipFraming: (clipId: string, patch: Partial<Framing>) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  assets: MediaAsset[];
  videos: React.MutableRefObject<Map<string, HTMLVideoElement>>;
  addFiles: (files: FileList | File[]) => Promise<void>;
  time: TimeStore;
  togglePlay: () => void;
  stop: () => void;
  seek: (t: number, keepPlaying?: boolean) => void;
  zoom: number;
  setZoom: (n: number) => void;
  caps: { tts: string; sfx: string; translate: string };
  toast: (text: string, kind?: Toast['kind']) => void;
  toasts: Toast[];
  duration: number;
  voicesReady: number;
}

const Ctx = createContext<EditorApi | null>(null);
export const useEditor = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('EditorProvider missing');
  return v;
};

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<Project>(() => createSampleProject());
  const [past, setPast] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [zoom, setZoom] = useState(64);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [caps, setCaps] = useState({ tts: '', sfx: '', translate: '' });
  const [voicesReady, setVoicesReady] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const liveBase = useRef<Project | null>(null);
  const liveTimer = useRef<number | null>(null);
  const videos = useRef<Map<string, HTMLVideoElement>>(new Map());
  const time = useMemo(() => new TimeStore(), []);
  const rafRef = useRef<number | null>(null);
  const lastTs = useRef<number>(0);
  const spokenRef = useRef<Set<string>>(new Set());
  const sfxRef = useRef<Set<string>>(new Set());
  const speakHandle = useRef<SpeakHandle | null>(null);
  const warnedVoice = useRef(false);
  const warnedSfx = useRef(false);
  const capsRef = useRef({ tts: '', sfx: '' });
  capsRef.current = { tts: caps.tts, sfx: caps.sfx };

  const projectRef = useRef(project);
  projectRef.current = project;

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, text, kind }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2800);
  }, []);

  const commit = useCallback((fn: (p: Project) => Project) => {
    const cur = projectRef.current;
    const next = fn(cur);
    if (next === cur) return;
    projectRef.current = next;
    setPast((h) => [...h.slice(-49), cur]);
    setFuture([]);
    setProject(next);
  }, []);

  const replaceProject = useCallback(
    (p: Project) => {
      const cur = projectRef.current;
      projectRef.current = p;
      setPast((h) => [...h.slice(-49), cur]);
      setFuture([]);
      setProject(p);
      time.set(0);
    },
    [time],
  );

  const undo = useCallback(() => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    const cur = projectRef.current;
    projectRef.current = prev;
    setPast((h) => h.slice(0, -1));
    setFuture((f) => [cur, ...f].slice(0, 50));
    setProject(prev);
  }, [past]);

  const redo = useCallback(() => {
    if (!future.length) return;
    const next = future[0];
    const cur = projectRef.current;
    projectRef.current = next;
    setFuture((f) => f.slice(1));
    setPast((h) => [...h, cur]);
    setProject(next);
  }, [future]);

  /* ------------------- 연속 변경(드래그) 한 번에 묶기 ------------------- */
  const liveEnd = useCallback(() => {
    if (liveTimer.current) {
      window.clearTimeout(liveTimer.current);
      liveTimer.current = null;
    }
    const base = liveBase.current;
    liveBase.current = null;
    if (base && base !== projectRef.current) {
      setPast((h) => [...h.slice(-49), base]);
      setFuture([]);
    }
  }, []);

  const liveBegin = useCallback(() => {
    if (!liveBase.current) liveBase.current = projectRef.current;
    if (liveTimer.current) {
      window.clearTimeout(liveTimer.current);
      liveTimer.current = null;
    }
  }, []);

  const liveCommit = useCallback(
    (fn: (p: Project) => Project) => {
      liveBegin();
      const next = fn(projectRef.current);
      if (next === projectRef.current) return;
      projectRef.current = next;
      setProject(next);
      if (liveTimer.current) window.clearTimeout(liveTimer.current);
      liveTimer.current = window.setTimeout(() => liveEnd(), 550);
    },
    [liveBegin, liveEnd],
  );

  const setClipFraming = useCallback(
    (clipId: string, patch: Partial<Framing>) => {
      liveCommit((p) => setFraming(p, clipId, p.aspect, patch));
    },
    [liveCommit],
  );

  /* ------------------------- 재생 루프 ------------------------- */
  const stopSpeaking = useCallback(() => {
    speakHandle.current?.cancel();
    speakHandle.current = null;
    audioEngine.stopVoice();
    audioEngine.stopElement();
    audioEngine.setDucking(false);
  }, []);

  /** 브라우저 내장 음성은 마지막 수단으로만 쓴다 */
  const speakFallback = useCallback((clip: Clip) => {
    const spec = clip.voice;
    if (!spec) return;
    speakHandle.current = speak(spec.text, {
      lang: spec.lang,
      rate: spec.rate,
      pitch: spec.pitch,
      volume: spec.volume,
      voiceURI: spec.voiceURI,
    });
    audioEngine.setDucking(true);
  }, []);

  /** 성우 클립 재생 — 캐시된 ElevenLabs 오디오 우선, 없으면 받아서, 그래도 안 되면 브라우저 음성 */
  const playVoiceClip = useCallback(
    (clip: Clip) => {
      const spec = clip.voice;
      if (!spec) return;
      const buffer = peekVoiceBuffer(spec);
      if (buffer) {
        audioEngine.playBuffer(buffer, { volume: spec.volume, kind: 'voice' });
        audioEngine.setDucking(true);
        return;
      }
      if (capsRef.current.tts === 'browser') {
        speakFallback(clip);
        return;
      }
      void getVoiceAudio(spec).then((res) => {
        if (!res) {
          speakFallback(clip);
          if (!warnedVoice.current) {
            warnedVoice.current = true;
            const why = lastVoiceError();
            toast(`성우 음성을 받지 못해 브라우저 음성으로 재생합니다${why ? ` (${why})` : ''}`, 'warn');
          }
          return;
        }
        if (!time.playing) return;
        if (time.t < clip.start || time.t > clipEnd(clip) - 0.12) return;
        audioEngine.playBuffer(res.buffer, { volume: spec.volume, offset: Math.max(0, time.t - clip.start), kind: 'voice' });
        audioEngine.setDucking(true);
      });
    },
    [speakFallback, time, toast],
  );

  const playSfxClip = useCallback(
    (clip: Clip) => {
      const spec = clip.sfx;
      if (!spec) return;
      const cached = peekSfxBuffer(spec);
      audioEngine.note('sfx-resolve', cached ? 'cache-hit' : 'fetch');
      if (cached) {
        audioEngine.playBuffer(cached, { kind: 'sfx' });
        return;
      }
      void getSfxAudio(spec).then((res) => {
        audioEngine.note('sfx-fetched', `${res.provider} playing=${time.playing}`);
        if (time.playing) audioEngine.playBuffer(res.buffer, { kind: 'sfx' });
        if (res.provider === 'synth' && !warnedSfx.current) {
          warnedSfx.current = true;
          const why = lastSfxError();
          toast(`ElevenLabs 효과음을 못 받아 합성음으로 재생합니다${why ? ` (${why})` : ''}`, 'warn');
        }
      });
    },
    [time, toast],
  );

  const pause = useCallback(() => {
    time.setPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopSpeaking();
    audioEngine.stopSfx();
    audioEngine.stopBgm();
    videos.current.forEach((v) => v.pause());
  }, [time, stopSpeaking]);

  const triggerAt = useCallback(
    (t: number, prevT: number) => {
      const p = projectRef.current;
      const crossed = (start: number) => start > prevT - 0.0001 && start <= t + 0.0001;
      for (const c of p.clips) {
        if (c.track === 'voice' && crossed(c.start) && !spokenRef.current.has(c.id) && c.voice) {
          spokenRef.current.add(c.id);
          playVoiceClip(c);
        }
        if (c.track === 'sfx' && crossed(c.start) && !sfxRef.current.has(c.id) && c.sfx) {
          sfxRef.current.add(c.id);
          audioEngine.note('sfx-trigger', `${c.label} @${c.start}`);
          playSfxClip(c);
        }
        if (c.track === 'bgm' && crossed(c.start) && p.music && c.bgmPreset) {
          audioEngine.startBgm(c.bgmPreset);
        }
      }
    },
    [playSfxClip, playVoiceClip],
  );

  const tick = useCallback(
    (ts: number) => {
      const p = projectRef.current;
      const total = projectDuration(p);
      const dt = lastTs.current ? Math.min(0.12, (ts - lastTs.current) / 1000) : 0;
      lastTs.current = ts;
      const prev = time.t;
      let next = prev + dt;
      if (next >= total) {
        next = total;
        time.set(next);
        pause();
        return;
      }
      time.set(next);
      triggerAt(next, prev);
      const voiceActive = p.clips.some((c) => c.track === 'voice' && next >= c.start && next < clipEnd(c));
      audioEngine.setDucking(voiceActive);
      rafRef.current = requestAnimationFrame(tick);
    },
    [pause, time, triggerAt],
  );

  const togglePlay = useCallback(() => {
    if (time.playing) {
      pause();
      return;
    }
    // iOS: 클릭 핸들러 안에서 동기적으로 오디오 잠금을 푼다 (fetch 뒤에는 늦다)
    audioEngine.syncUnlock();
    window.setTimeout(() => {
      const st = audioEngine.state;
      if (st !== 'running' && st !== 'none') {
        toast('소리가 안 들리면 아이폰 측면 무음 스위치를 끄고 볼륨을 올려 보세요', 'warn');
      }
    }, 600);
    const total = projectDuration(projectRef.current);
    if (time.t >= total - 0.05) time.set(0);
    spokenRef.current = new Set();
    sfxRef.current = new Set();
    audioEngine.ensure();
    time.setPlaying(true);
    lastTs.current = 0;
    const p = projectRef.current;
    if (p.music) {
      const bgm = p.clips.find((c) => c.track === 'bgm' && time.t >= c.start && time.t < clipEnd(c));
      if (bgm?.bgmPreset) audioEngine.startBgm(bgm.bgmPreset);
    }
    // 시작 지점에 걸친 효과음·성우는 즉시 울린다
    triggerAt(time.t + 0.05, time.t - 0.05);
    rafRef.current = requestAnimationFrame(tick);
  }, [pause, tick, time, toast, triggerAt]);

  const stop = useCallback(() => {
    pause();
    time.set(0);
  }, [pause, time]);

  const seek = useCallback(
    (t: number, keepPlaying = false) => {
      const wasPlaying = time.playing;
      if (wasPlaying && !keepPlaying) pause();
      time.set(Math.max(0, t));
      spokenRef.current = new Set();
      sfxRef.current = new Set();
      if (wasPlaying && keepPlaying) {
        lastTs.current = 0;
      }
    },
    [pause, time],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith('video/') || f.type.startsWith('audio/') || f.type.startsWith('image/'));
      if (!list.length) {
        toast('영상·오디오 파일만 올릴 수 있습니다', 'warn');
        return;
      }
      const added: MediaAsset[] = [];
      let unsaved = 0;
      for (const file of list) {
        const url = URL.createObjectURL(file);
        const id = `a${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 7)}`;
        const duration = await new Promise<number>((resolve) => {
          if (file.type.startsWith('video/')) {
            const v = document.createElement('video');
            v.preload = 'metadata';
            v.src = url;
            v.muted = true;
            v.playsInline = true;
            v.onloadedmetadata = () => {
              videos.current.set(id, v);
              resolve(Number.isFinite(v.duration) ? v.duration : 5);
            };
            v.onerror = () => resolve(5);
          } else if (file.type.startsWith('audio/')) {
            const a = document.createElement('audio');
            a.preload = 'metadata';
            a.src = url;
            a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 5);
            a.onerror = () => resolve(5);
          } else {
            const img = new Image();
            img.src = url;
            img.onload = () => resolve(5);
            img.onerror = () => resolve(5);
          }
        });
        added.push({ id, name: file.name, kind: 'local', src: url, duration });
        // 새로고침해도 남도록 파일 자체를 IndexedDB에 담는다 (용량 초과면 프로젝트만 저장)
        const ok = await saveAsset({ id, name: file.name, mime: file.type, duration, blob: file });
        if (!ok) unsaved++;
      }
      setAssets((prev) => [...prev, ...added]);
      if (unsaved) toast(`${unsaved}개 파일은 용량이 커서 다음 접속 시 다시 올려야 합니다`, 'warn');
      const first = added[0];
      commit((p) => ({
        ...p,
        clips: [
          ...p.clips,
          ...added.map((a, i) => ({
            id: uid('v'),
            track: 'video' as TrackId,
            start: i === 0 ? time.t : time.t + i * 0.01,
            duration: Math.max(1, Math.min(a.duration, 12)),
            label: a.name.replace(/\.[^.]+$/, '').slice(0, 18),
            mediaId: a.id,
            inPoint: 0,
          })),
        ],
      }));
      if (first) toast(`${added.length}개 파일을 타임라인에 추가했습니다`);
    },
    [commit, time, toast],
  );

  /* ------------------- 자동 저장 · 복원 (IndexedDB) ------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = await loadSaved();
        if (alive && saved) {
          const p = normalizeProject(saved.project);
          projectRef.current = p;
          setProject(p);
          setPast([]);
          setFuture([]);
          setSavedAt(saved.savedAt || Date.now());
          setSaveState('saved');
          // 전에 생성해 둔 성우·효과음 오디오를 메모리에 올려 재생을 바로 되게 한다
          p.clips.forEach((c) => {
            if (c.track === 'voice' && c.voice) void preloadVoice(c.voice);
            if (c.track === 'sfx' && c.sfx) void preloadSfx(c.sfx);
          });
          const stored = await loadAssets();
          if (alive && stored.length) {
            const restored: MediaAsset[] = [];
            for (const a of stored) {
              if (!a.blob) continue;
              const url = URL.createObjectURL(a.blob);
              if (a.mime?.startsWith('video/')) {
                const v = document.createElement('video');
                v.preload = 'metadata';
                v.src = url;
                v.muted = true;
                v.playsInline = true;
                videos.current.set(a.id, v);
              }
              restored.push({ id: a.id, name: a.name, kind: 'local', src: url, duration: a.duration });
            }
            if (restored.length) setAssets(restored);
          }
        }
      } catch {
        /* 저장된 프로젝트가 깨져 있으면 새 프로젝트로 시작한다 */
      }
      if (alive) setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* 프로젝트가 바뀔 때마다 0.6초 뒤에 자동 저장 */
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setSaveState('saving');
    const t = window.setTimeout(async () => {
      try {
        const at = await saveProject(project);
        if (cancelled) return;
        setSavedAt(at);
        setSaveState('saved');
      } catch {
        if (!cancelled) setSaveState('error');
      }
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [project, hydrated]);

  const saveNow = useCallback(() => {
    setSaveState('saving');
    saveProject(projectRef.current)
      .then((at) => {
        setSavedAt(at);
        setSaveState('saved');
      })
      .catch(() => setSaveState('error'));
  }, []);

  const resetProject = useCallback(
    (kind: 'empty' | 'sample' | 'clear') => {
      pause();
      time.set(0);
      setSelectedId(null);
      setPast([]);
      setFuture([]);
      liveBase.current = null;
      if (kind === 'clear') {
        void clearAll();
        assets.forEach((a) => a.src && URL.revokeObjectURL(a.src));
        videos.current.forEach((v) => v.pause());
        videos.current.clear();
        setAssets([]);
      }
      const p = kind === 'sample' ? createSampleProject() : createEmptyProject();
      projectRef.current = p;
      setProject(p);
      const persist = kind === 'clear' ? clearAll().then(() => saveProject(p)) : saveProject(p);
      persist
        .then((at) => {
          setSavedAt(at);
          setSaveState('saved');
        })
        .catch(() => setSaveState('error'));
    },
    [assets, pause, time],
  );

  /* --------------------- 서버 기능 지원 여부 --------------------- */
  useEffect(() => {
    let alive = true;
    fetch('/api/tts')
      .then((r) => r.json())
      .then((d) => alive && setCaps((c) => ({ ...c, tts: d.provider ?? 'browser' })))
      .catch(() => {});
    fetch('/api/sfx')
      .then((r) => r.json())
      .then((d) => alive && setCaps((c) => ({ ...c, sfx: d.provider ?? 'synth' })))
      .catch(() => {});
    fetch('/api/translate')
      .then((r) => r.json())
      .then((d) => alive && setCaps((c) => ({ ...c, translate: d.provider ?? 'demo' })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const update = () => setVoicesReady(window.speechSynthesis.getVoices().length);
    update();
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);

  const api: EditorApi = {
    project,
    commit,
    replaceProject,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    saveState,
    savedAt,
    hydrated,
    saveNow,
    resetProject,
    liveBegin,
    liveCommit,
    liveEnd,
    setClipFraming,
    selectedId,
    select: setSelectedId,
    assets,
    videos,
    addFiles,
    time,
    togglePlay,
    stop,
    seek,
    zoom,
    setZoom,
    caps,
    toast,
    toasts,
    duration: projectDuration(project),
    voicesReady,
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** 저장된 프로젝트를 읽을 때 빠진 필드를 보충한다(버전이 달라도 열리도록) */
function normalizeProject(p: Project): Project {
  const clips = (Array.isArray(p.clips) ? p.clips : [])
    .filter((c): c is Clip => !!c && typeof c.id === 'string' && typeof c.start === 'number' && typeof c.duration === 'number')
    .map((c) => ({ ...c, duration: Math.max(0.05, c.duration) }));
  return {
    title: typeof p.title === 'string' && p.title ? p.title : '저장된 프로젝트',
    aspect: p.aspect === '16:9' ? '16:9' : '9:16',
    clips,
    safeZone: p.safeZone !== false,
    lang: p.lang ?? 'ko',
    subtitlePreset: p.subtitlePreset === 'longform' ? 'longform' : 'shorts',
    music: p.music !== false,
  };
}
