import { DEFAULT_FRAMING, FRAMING_LIMIT, type Aspect, type Clip, type Framing, type Lang, type Project, type TrackId } from './types';

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

/* ------------------------------------------------------------------ */
/* 비율별 프레이밍 (16:9 · 9:16 따로 저장)                              */
/* ------------------------------------------------------------------ */
export const clampFraming = (f: Framing): Framing => ({
  x: Math.min(FRAMING_LIMIT.x, Math.max(-FRAMING_LIMIT.x, f.x)),
  y: Math.min(FRAMING_LIMIT.y, Math.max(-FRAMING_LIMIT.y, f.y)),
  scale: Math.min(FRAMING_LIMIT.scaleMax, Math.max(FRAMING_LIMIT.scaleMin, f.scale)),
});

export function framingFor(clip: Clip, aspect: Aspect): Framing {
  const f = clip.framing?.[aspect];
  return f ? { ...DEFAULT_FRAMING, ...f } : { ...DEFAULT_FRAMING };
}

/** 지정한 비율에만 프레이밍을 쓴다. 다른 비율의 값은 건드리지 않는다 */
export function setFraming(p: Project, id: string, aspect: Aspect, patch: Partial<Framing>): Project {
  const clip = p.clips.find((c) => c.id === id);
  if (!clip) return p;
  const next = clampFraming({ ...framingFor(clip, aspect), ...patch });
  return updateClip(p, id, { framing: { ...(clip.framing ?? {}), [aspect]: next } });
}

export function isFramed(clip: Clip, aspect: Aspect): boolean {
  const f = framingFor(clip, aspect);
  return Math.abs(f.x) > 0.001 || Math.abs(f.y) > 0.001 || Math.abs(f.scale - 1) > 0.001;
}

/* ------------------------------------------------------------------ */
/* 텍스트 기반 컷 편집 — 잘라낸 구간만큼 뒤 클립을 앞으로 당긴다(리플)  */
/* ------------------------------------------------------------------ */
const EPS = 0.0005;
const MIN_PIECE = 0.02;

/** 비율(0~1)로 자막 글자를 나눈다 — 단어 시간도 같은 비율로 계산해 두므로 컷 지점과 맞는다 */
function sliceText(text: string, a: number, b: number, snapWords = false): string {
  const len = text.length;
  if (!len) return text;
  let i0 = Math.max(0, Math.min(len, Math.round(a * len)));
  let i1 = Math.max(i0, Math.min(len, Math.round(b * len)));
  if (snapWords) {
    // 번역문은 글자가 달라 비율이 단어 중간에 떨어질 수 있으니 가까운 띄어쓰기로 맞춘다
    if (i0 > 0 && /\S/.test(text[i0 - 1] ?? ' ') && /\S/.test(text[i0] ?? ' ')) {
      const sp = text.indexOf(' ', i0);
      if (sp >= 0 && sp - i0 < 14) i0 = sp + 1;
    }
    if (i1 < len && /\S/.test(text[i1 - 1] ?? ' ') && /\S/.test(text[i1] ?? ' ')) {
      const sp = text.lastIndexOf(' ', i1);
      if (sp >= i0 && i1 - sp < 14) i1 = sp;
    }
  }
  return text.slice(i0, i1).replace(/^\s+|\s+$/g, '').replace(/\s{2,}/g, ' ');
}

function sliceTranslations(clip: Clip, a: number, b: number): Partial<Record<Lang, string>> | undefined {
  if (!clip.translations) return undefined;
  const out: Partial<Record<Lang, string>> = {};
  for (const [lang, value] of Object.entries(clip.translations)) {
    if (typeof value !== 'string') continue;
    const t = sliceText(value, a, b, true);
    if (t) out[lang as Lang] = t;
  }
  return out;
}

/** 단어 단위로 자를 때 쓰는 시간 — 글자 위치를 같은 비율로 시간에 대응시킨다 */
export function timeAtChar(clip: Clip, charIndex: number): number {
  const len = Math.max(1, (clip.text ?? '').length);
  return clip.start + (Math.min(len, Math.max(0, charIndex)) / len) * clip.duration;
}

export interface WordSpan {
  text: string;
  start: number;
  end: number;
}

/** 자막 한 줄을 단어와 시간으로 나눈다 (Vrew처럼 단어를 눌러 그 구간을 자른다) */
export function wordsOf(clip: Clip): WordSpan[] {
  const text = clip.text ?? '';
  const out: WordSpan[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ text: m[0], start: timeAtChar(clip, m.index), end: timeAtChar(clip, m.index + m[0].length) });
  }
  return out;
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  const clean = ranges
    .map(([a, b]) => [Math.max(0, Math.min(a, b)), Math.max(0, Math.max(a, b))] as [number, number])
    .filter(([a, b]) => b - a > 0.02)
    .sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const r of clean) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 0.001) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/**
 * 여러 구간을 한 번에 잘라낸다 (리플 컷).
 * 남는 구간과 자막 글자를 "원본 클립" 기준으로 한 번만 계산해, 컷을 여러 번 해도
 * 글자와 시간이 어긋나지 않는다. 잘린 뒤의 클립은 앞으로 당겨진다.
 */
export function cutRanges(p: Project, ranges: [number, number][]): Project {
  const merged = mergeRanges(ranges);
  if (!merged.length) return p;

  /** 원본 타임라인의 x가 컷 이후 어디로 가는지 */
  const shift = (x: number) => {
    let removed = 0;
    for (const [a, b] of merged) {
      if (b <= x + EPS) removed += b - a;
      else if (a < x - EPS) removed += Math.max(0, x - a);
      else break;
    }
    return Math.max(0, x - removed);
  };

  const next: Clip[] = [];
  for (const c of p.clips) {
    const cs = c.start;
    const ce = clipEnd(c);
    const hits = merged.filter(([a, b]) => b > cs + EPS && a < ce - EPS);
    if (!hits.length) {
      const start = shift(cs);
      next.push(Math.abs(start - cs) < EPS ? c : { ...c, start });
      continue;
    }

    // 이 클립에서 남는 시간 구간들
    const pieces: [number, number][] = [];
    let cursor = cs;
    for (const [a, b] of hits) {
      const s = Math.max(a, cs);
      const e = Math.min(b, ce);
      if (s > cursor + EPS) pieces.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < ce - EPS) pieces.push([cursor, ce]);

    const hasText = c.track === 'subtitle' && !!c.text;
    let first = true;
    for (const [a, b] of pieces) {
      const duration = b - a;
      if (duration < MIN_PIECE) continue;
      const ra = Math.min(1, Math.max(0, (a - cs) / Math.max(0.001, c.duration)));
      const rb = Math.min(1, Math.max(0, (b - cs) / Math.max(0.001, c.duration)));
      const text = hasText ? sliceText(c.text as string, ra, rb) : undefined;
      if (hasText && !text) continue;
      next.push({
        ...c,
        id: first ? c.id : `${c.id}_k${Math.random().toString(36).slice(2, 6)}`,
        start: shift(a),
        duration,
        inPoint: c.track === 'video' ? (c.inPoint ?? 0) + (a - cs) : c.inPoint,
        ...(hasText ? { text, translations: sliceTranslations(c, ra, rb) } : {}),
      });
      first = false;
    }
  }
  if (next.length === p.clips.length && next.every((c, i) => c === p.clips[i])) return p;
  return { ...p, clips: next };
}

/** 한 구간만 자르기 */
export function cutRange(p: Project, from: number, to: number): Project {
  return cutRanges(p, [[from, to]]);
}

/**
 * 무음 구간 — 자막·성우가 없는 시간대. 영상이 실제로 깔린 구간 안에서만 찾는다.
 * pad 만큼 양쪽을 남겨 말소리가 잘리지 않게 한다.
 */
export function silenceGaps(p: Project, minGap = 0.6, pad = 0.12): [number, number][] {
  const videos = clipsOf(p, 'video');
  if (!videos.length) return [];
  const spanStart = videos[0].start;
  const spanEnd = Math.max(...videos.map(clipEnd));
  const spans = p.clips
    .filter((c) => c.track === 'voice' || c.track === 'subtitle')
    .map((c) => [Math.max(spanStart, c.start), Math.min(spanEnd, clipEnd(c))] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  if (!spans.length) return [];
  const merged: [number, number][] = [];
  for (const sp of spans) {
    const last = merged[merged.length - 1];
    if (last && sp[0] <= last[1] + 0.02) last[1] = Math.max(last[1], sp[1]);
    else merged.push([sp[0], sp[1]]);
  }
  const gaps: [number, number][] = [];
  // 첫 소리 전 · 마지막 소리 뒤도 무음이지만 앞뒤를 다 자르면 영상이 붙어 버려 내부 갭만 다룬다
  for (let i = 1; i < merged.length; i++) {
    const a = merged[i - 1][1] + pad;
    const b = merged[i][0] - pad;
    if (b - a >= minGap) gaps.push([a, b]);
  }
  return gaps;
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
