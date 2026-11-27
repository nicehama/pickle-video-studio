import type { Clip, Lang, Project } from './types';
import { subtitleText } from './renderer';

function srtTime(seconds: number) {
  const t = Math.max(0, seconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  const p = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

export function subtitleClips(project: Project) {
  return project.clips.filter((c) => c.track === 'subtitle').sort((a, b) => a.start - b.start);
}

export function toSrt(project: Project, lang: Lang): string {
  const rows = subtitleClips(project)
    .map((c: Clip) => ({ text: subtitleText(c, lang), start: c.start + (c.offsetMs ?? 0) / 1000, end: c.start + c.duration + (c.offsetMs ?? 0) / 1000 }))
    .filter((r) => r.text.trim());
  return rows
    .map((r, i) => `${i + 1}\n${srtTime(r.start)} --> ${srtTime(r.end)}\n${r.text.trim()}\n`)
    .join('\n');
}

export function downloadText(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
