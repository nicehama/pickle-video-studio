import type { Clip, Lang, Project, TrackId } from './types';

export const clipEnd = (c: Clip) => c.start + c.duration;

export function projectDuration(p: Project) {
  return Math.max(8, ...p.clips.map(clipEnd));
}

export function clipsOf(p: Project, track: TrackId) {
  return p.clips.filter((c) => c.track === track).sort((a, b) => a.start - b.start);
}

export function updateClip(p: Project, id: string, patch: Partial<Clip>): Project {
  return { ...p, clips: p.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

export function removeClip(p: Project, id: string): Project {
  return { ...p, clips: p.clips.filter((c) => c.id !== id) };
}

export function addClip(p: Project, clip: Clip): Project {
  return { ...p, clips: [...p.clips, clip] };
}

/** 재생 헤드 지점에서 클립을 자른다. 아무 클립도 지정하지 않으면 헤드를 지나는 모든 클립 */
export function splitAt(p: Project, time: number, id?: string): Project {
  const targets = p.clips.filter((c) => {
    if (id && c.id !== id) return false;
    if (time <= c.start + 0.05 || time >= clipEnd(c) - 0.05) return false;
    return true;
  });
  if (!targets.length) return p;
  const next: Clip[] = [];
  for (const c of p.clips) {
    if (!targets.includes(c)) {
      next.push(c);
      continue;
    }
    const left = { ...c, duration: time - c.start };
    const right: Clip = {
      ...c,
      id: `${c.id}_${Math.random().toString(36).slice(2, 6)}`,
      start: time,
      duration: clipEnd(c) - time,
      inPoint: c.track === 'video' ? (c.inPoint ?? 0) + (time - c.start) : c.inPoint,
    };
    next.push(left, right);
  }
  return { ...p, clips: next };
}

/** 시작·끝 핸들 트림. 영상은 inPoint도 함께 밀린다 */
export function trimClip(p: Project, id: string, edge: 'start' | 'end', newTime: number): Project {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return p;
  const MIN = 0.25;
  if (edge === 'end') {
    const duration = Math.max(MIN, newTime - c.start);
    return updateClip(p, id, { duration });
  }
  const end = clipEnd(c);
  const start = Math.min(newTime, end - MIN);
  const delta = start - c.start;
  return updateClip(p, id, {
    start: Math.max(0, start),
    duration: end - Math.max(0, start),
    inPoint: c.track === 'video' ? Math.max(0, (c.inPoint ?? 0) + delta) : c.inPoint,
  });
}

export function moveClip(p: Project, id: string, start: number, track?: TrackId): Project {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return p;
  return updateClip(p, id, { start: Math.max(0, start), track: track ?? c.track });
}

/** 성우가 말하는 구간과 겹치는 효과음은 덕킹 대상으로 표시한다 */
export function duckingFor(p: Project, clip: Clip): { ducked: boolean; overlap: number } {
  const voices = p.clips.filter((c) => c.track === 'voice');
  let overlap = 0;
  for (const v of voices) {
    const s = Math.max(clip.start, v.start);
    const e = Math.min(clipEnd(clip), clipEnd(v));
    if (e > s) overlap += e - s;
  }
  return { ducked: overlap > 0.05, overlap };
}
