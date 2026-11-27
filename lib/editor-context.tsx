'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { audioEngine, sfxParamFor } from './audio-engine';
import { createSampleProject, uid } from './data';
import { clipEnd, projectDuration } from './editor-ops';
import type { Clip, MediaAsset, Project, TrackId } from './types';
import { speak, type SpeakHandle } from './tts';

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

interface EditorApi {
  project: Project;
  commit: (fn: (p: Project) => Project, label?: string) => void;
  replaceProject: (p: Project) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
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
  const [caps, setCaps] = useState({ tts: 'browser', sfx: 'synth', translate: 'demo' });
  const [voicesReady, setVoicesReady] = useState(0);
  const videos = useRef<Map<string, HTMLVideoElement>>(new Map());
  const time = useMemo(() => new TimeStore(), []);
  const rafRef = useRef<number | null>(null);
  const lastTs = useRef<number>(0);
  const spokenRef = useRef<Set<string>>(new Set());
  const sfxRef = useRef<Set<string>>(new Set());
  const speakHandle = useRef<SpeakHandle | null>(null);

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

  /* ------------------------- 재생 루프 ------------------------- */
  const stopSpeaking = useCallback(() => {
    speakHandle.current?.cancel();
    speakHandle.current = null;
    audioEngine.setDucking(false);
  }, []);

  const pause = useCallback(() => {
    time.setPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopSpeaking();
    audioEngine.stopSfx();
    audioEngine.stopBgm();
    videos.current.forEach((v) => v.pause());
  }, [time, stopSpeaking]);

  const triggerAt = useCallback((t: number, prevT: number) => {
    const p = projectRef.current;
    const crossed = (start: number) => start > prevT - 0.0001 && start <= t + 0.0001;
    for (const c of p.clips) {
      if (c.track === 'voice' && crossed(c.start) && !spokenRef.current.has(c.id) && c.voice) {
        spokenRef.current.add(c.id);
        speakHandle.current = speak(c.voice.text, {
          lang: c.voice.lang,
          rate: c.voice.rate,
          pitch: c.voice.pitch,
          volume: c.voice.volume,
          voiceURI: c.voice.voiceURI,
        });
        audioEngine.setDucking(true);
      }
      if (c.track === 'sfx' && crossed(c.start) && !sfxRef.current.has(c.id) && c.sfx) {
        sfxRef.current.add(c.id);
        const { param, key } = sfxParamFor(c.sfx.category, c.sfx.emotion, c.sfx.intensity, c.sfx.variation);
        void audioEngine.playSfx(param, key);
      }
      if (c.track === 'bgm' && crossed(c.start) && p.music && c.bgmPreset) {
        audioEngine.startBgm(c.bgmPreset);
      }
    }
  }, []);

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
    // 시작 지점에 걸친 효과음은 즉시 울린다
    triggerAt(time.t + 0.05, time.t - 0.05);
    rafRef.current = requestAnimationFrame(tick);
  }, [pause, tick, time, triggerAt]);

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
      for (const file of list) {
        const url = URL.createObjectURL(file);
        const id = uid('asset');
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
      }
      setAssets((prev) => [...prev, ...added]);
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
