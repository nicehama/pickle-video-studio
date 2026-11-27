import { FONT_STACK, SUBTITLE_PRESETS, sceneByKey, SCENES } from './data';
import type { Clip, Lang, Project } from './types';

export interface FrameContext {
  project: Project;
  time: number;
  videos?: Map<string, HTMLVideoElement>;
  /** 내보내기에서는 false */
  showSafeZone?: boolean;
  showBadges?: boolean;
}

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function activeClipAt(project: Project, track: Clip['track'], time: number): Clip | undefined {
  return project.clips.find((c) => c.track === track && time >= c.start && time < c.start + c.duration);
}

function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, sceneKey: string | undefined, time: number) {
  const scene = sceneByKey(sceneKey) ?? SCENES[0];
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, scene.a);
  g.addColorStop(0.55, scene.b);
  g.addColorStop(1, scene.a);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const unit = Math.min(w, h);
  ctx.save();
  if (scene.motion === 'drift') {
    for (let i = 0; i < 7; i++) {
      const ph = (time * 0.12 + i * 0.37) % 1;
      const x = (0.15 + 0.7 * ((i * 0.31 + time * 0.03) % 1)) * w;
      const y = (0.2 + ph * 0.7) * h;
      const r = unit * (0.06 + (i % 3) * 0.03);
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, withAlpha(scene.accent, 0.35));
      rg.addColorStop(1, withAlpha(scene.accent, 0));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (scene.motion === 'flow') {
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      const baseY = h * (0.35 + i * 0.12);
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= w; x += w / 24) {
        const y = baseY + Math.sin(x / w * Math.PI * 2 + time * 0.6 + i) * unit * 0.035;
        ctx.lineTo(x, y);
      }
      ctx.lineWidth = unit * 0.012;
      ctx.strokeStyle = withAlpha(scene.accent, 0.16 + i * 0.03);
      ctx.stroke();
    }
  } else if (scene.motion === 'pulse') {
    const cx = w * 0.62;
    const cy = h * 0.42;
    for (let i = 0; i < 3; i++) {
      const p = ((time * 0.35 + i * 0.33) % 1);
      const r = unit * (0.12 + p * 0.55);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(scene.accent, 0.4 * (1 - p));
      ctx.lineWidth = unit * 0.01;
      ctx.stroke();
    }
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, unit * 0.5);
    rg.addColorStop(0, withAlpha(scene.accent, 0.35));
    rg.addColorStop(1, withAlpha(scene.accent, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.strokeStyle = withAlpha(scene.accent, 0.18);
    ctx.lineWidth = Math.max(1, unit * 0.002);
    const horizon = h * 0.52;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * unit * 0.02, horizon);
      ctx.lineTo(w / 2 + i * unit * 0.34, h);
      ctx.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const p = ((i / 10 + time * 0.12) % 1);
      const y = horizon + (h - horizon) * p * p;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  // 피사체 — 초점이 약간 나간 실루엣처럼 보이도록 블러 처리
  ctx.save();
  ctx.filter = `blur(${Math.max(2, unit * 0.006)}px)`;
  const sy = h * 0.6;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, w * 0.3, sy, w * 0.4, h * 0.19, unit * 0.018);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.arc(w * 0.36, sy + h * 0.02, unit * 0.085, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  roundRect(ctx, w * 0.33, sy + h * 0.02, w * 0.13, h * 0.045, unit * 0.01);
  ctx.fill();
  ctx.restore();

  // 빛줄기
  ctx.save();
  const beam = ctx.createLinearGradient(0, 0, w * 0.8, h);
  beam.addColorStop(0, withAlpha(scene.accent, 0.22));
  beam.addColorStop(0.5, withAlpha(scene.accent, 0.02));
  beam.addColorStop(1, withAlpha(scene.accent, 0));
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(w * 0.05, 0);
  ctx.lineTo(w * 0.55, 0);
  ctx.lineTo(w * 0.95, h);
  ctx.lineTo(w * 0.45, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 부유 입자 (결정적)
  ctx.save();
  for (let i = 0; i < 22; i++) {
    const px = ((i * 0.618 + time * (0.01 + (i % 5) * 0.004)) % 1) * w;
    const py = ((i * 0.377 + time * 0.008) % 1) * h;
    ctx.fillStyle = withAlpha('#ffffff', 0.05 + (i % 4) * 0.02);
    ctx.beginPath();
    ctx.arc(px, py, unit * (0.0015 + (i % 3) * 0.0012), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 비네트
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function withAlpha(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function drawCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, w: number, h: number) {
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  const pushChar = (chunk: string) => {
    if (current) lines.push(current);
    current = chunk;
  };
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
    }
    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      continue;
    }
    // 단어 하나가 너무 길면 글자 단위로 자른다 (한국어·일본어)
    let chunk = '';
    for (const ch of word) {
      if (ctx.measureText(chunk + ch).width > maxWidth) {
        pushChar(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = kept[maxLines - 1].replace(/.$/, '…');
  return kept;
}

export function subtitleText(clip: Clip, lang: Lang): string {
  if (lang === 'ko' || lang === clip.lang) return clip.text ?? '';
  return clip.translations?.[lang] ?? '';
}

function drawSubtitle(ctx: CanvasRenderingContext2D, w: number, h: number, project: Project, time: number) {
  const clip = activeClipAt(project, 'subtitle', time);
  if (!clip) return;
  const text = subtitleText(clip, project.lang);
  if (!text) return;
  const preset = SUBTITLE_PRESETS[project.subtitlePreset];
  const maxWidth = w * 0.84;
  const baseSize = Math.min(w, h) * preset.fontPx;
  let size = baseSize;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${preset.weight} ${size}px ${FONT_STACK[project.lang]}`;
  let lines = wrapText(ctx, text, maxWidth, preset.maxLines);
  // 한 줄로 다 들어가지 않으면 글자를 줄여 가며 맞춘다(말줄임 대신 가독성 우선)
  let guard = 0;
  while (lines.length && lines[lines.length - 1].endsWith('…') && size > baseSize * 0.62 && guard++ < 10) {
    size *= 0.93;
    ctx.font = `${preset.weight} ${size}px ${FONT_STACK[project.lang]}`;
    lines = wrapText(ctx, text, maxWidth, preset.maxLines);
  }
  const lineHeight = size * 1.2;
  const blockH = lines.length * lineHeight;
  const isShorts = project.subtitlePreset === 'shorts';
  const centerY = h * preset.y;
  const top = centerY - blockH / 2 + lineHeight / 2;

  lines.forEach((line, i) => {
    const y = top + i * lineHeight;
    if (isShorts) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = preset.outline;
      ctx.strokeText(line, w / 2, y);
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = size * 0.25;
      ctx.shadowOffsetY = size * 0.08;
      ctx.fillStyle = preset.color;
      ctx.fillText(line, w / 2, y);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    } else {
      const metrics = ctx.measureText(line);
      const padX = size * 0.5;
      const padY = size * 0.28;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, w / 2 - metrics.width / 2 - padX, y - size * 0.7 - padY, metrics.width + padX * 2, size * 1.35 + padY * 2, size * 0.3);
      ctx.fill();
      ctx.fillStyle = preset.color;
      ctx.fillText(line, w / 2, y);
    }
  });
  ctx.restore();
}

function drawSafeZone(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  const zones = [
    { x: w * 0.86, y: h * 0.55, w: w * 0.14, h: h * 0.3, label: '버튼 영역' },
    { x: 0, y: h * 0.86, w, h: h * 0.14, label: '설명 · 캡션' },
    { x: 0, y: 0, w, h: h * 0.07, label: '상태바' },
  ];
  ctx.setLineDash([Math.max(4, w * 0.008), Math.max(3, w * 0.006)]);
  ctx.lineWidth = Math.max(2, w * 0.004);
  for (const z of zones) {
    ctx.strokeStyle = 'rgba(255,92,122,0.85)';
    ctx.fillStyle = 'rgba(255,92,122,0.13)';
    ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.strokeRect(z.x, z.y, z.w, z.h);
    ctx.fillStyle = 'rgba(255,214,222,0.95)';
    const fs = Math.max(9, Math.min(w, h) * 0.026);
    ctx.font = `600 ${fs}px ${FONT_STACK.ko}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(z.label, z.x + fs * 0.5, z.y + fs * 0.5);
  }
  ctx.restore();
}

function drawBadges(ctx: CanvasRenderingContext2D, w: number, h: number, project: Project, time: number) {
  const active = activeClipAt(project, 'video', time);
  const fs = Math.max(10, Math.min(w, h) * 0.03);
  ctx.save();
  ctx.font = `600 ${fs}px ${FONT_STACK.ko}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const label = active ? `클립 · ${active.label}` : '클립 없음';
  const padding = fs * 0.55;
  const tw = ctx.measureText(label).width + padding * 2;
  ctx.fillStyle = 'rgba(8,10,16,0.62)';
  roundRect(ctx, fs * 0.7, fs * 0.7, tw, fs * 1.9, fs * 0.6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(label, fs * 0.7 + padding, fs * 0.7 + fs * 0.95);

  const tc = formatTimecode(time);
  ctx.font = `700 ${fs}px ui-monospace, SFMono-Regular, monospace`;
  const tcw = ctx.measureText(tc).width + padding * 2;
  ctx.fillStyle = 'rgba(198,242,78,0.16)';
  roundRect(ctx, w - fs * 0.7 - tcw, fs * 0.7, tcw, fs * 1.9, fs * 0.6);
  ctx.fill();
  ctx.fillStyle = '#d9ff7a';
  ctx.fillText(tc, w - fs * 0.7 - tcw + padding, fs * 0.7 + fs * 0.95);
  ctx.restore();
}

export function formatTimecode(t: number) {
  const total = Math.max(0, t);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const f = Math.floor((total % 1) * 30);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(m)}:${p(s)}:${p(f)}`;
}

export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, fc: FrameContext) {
  const { project, time } = fc;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, w, h);

  const videoClip = activeClipAt(project, 'video', time);
  const videoEl = videoClip?.mediaId ? fc.videos?.get(videoClip.mediaId) : undefined;
  if (videoEl && videoEl.readyState >= 2) {
    drawCover(ctx, videoEl, w, h);
  } else {
    drawScene(ctx, w, h, videoClip?.sceneKey, time);
  }

  drawSubtitle(ctx, w, h, project, time);

  if (project.aspect === '9:16' && fc.showSafeZone !== false) {
    drawSafeZone(ctx, w, h);
  }
  if (fc.showBadges) drawBadges(ctx, w, h, project, time);
}

export function timeAtX(x: number, pxPerSec: number, scroll: number) {
  return Math.max(0, (x + scroll) / pxPerSec);
}

export function xAtTime(t: number, pxPerSec: number, scroll: number) {
  return t * pxPerSec - scroll;
}

export const clampTime = (t: number, dur: number) => clamp(t, 0, dur);
