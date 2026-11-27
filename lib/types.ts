export type Aspect = '16:9' | '9:16';
export type TrackId = 'video' | 'subtitle' | 'voice' | 'sfx' | 'bgm';
export type Lang = 'ko' | 'en' | 'ja' | 'es';
export type Tone = 'calm' | 'bright' | 'doc' | 'shorts';
export type SubtitlePreset = 'shorts' | 'longform';

export interface MediaAsset {
  id: string;
  name: string;
  kind: 'local' | 'sample';
  src?: string;
  sceneKey?: string;
  duration: number;
  width?: number;
  height?: number;
}

export interface VoiceSpec {
  text: string;
  lang: Lang;
  tone: Tone;
  rate: number;
  pitch: number;
  volume: number;
  voiceURI?: string;
}

export interface SfxSpec {
  prompt: string;
  category: string;
  emotion: string;
  intensity: string;
  variation: number;
}

export interface Clip {
  id: string;
  track: TrackId;
  start: number;
  duration: number;
  label: string;
  /** video */
  mediaId?: string;
  inPoint?: number;
  sceneKey?: string;
  /** subtitle */
  text?: string;
  lang?: Lang;
  offsetMs?: number;
  translations?: Partial<Record<Lang, string>>;
  /** voice */
  voice?: VoiceSpec;
  /** sfx */
  sfx?: SfxSpec;
  /** bgm */
  bgmPreset?: string;
}

export interface Project {
  title: string;
  aspect: Aspect;
  clips: Clip[];
  safeZone: boolean;
  /** subtitle language being edited/displayed */
  lang: Lang;
  subtitlePreset: SubtitlePreset;
  music: boolean;
}

export const TRACKS: { id: TrackId; name: string; hint: string }[] = [
  { id: 'video', name: '영상', hint: '컷 · 트림' },
  { id: 'subtitle', name: '자막', hint: '자막 · 번역' },
  { id: 'voice', name: '성우', hint: 'AI TTS' },
  { id: 'sfx', name: '효과음', hint: 'SFX' },
  { id: 'bgm', name: 'BGM', hint: '배경 음악' },
];

export const TRACK_COLOR: Record<TrackId, { bg: string; border: string; text: string }> = {
  video: { bg: 'bg-sky-500/20', border: 'border-sky-400/50', text: 'text-sky-200' },
  subtitle: { bg: 'bg-lime-400/15', border: 'border-lime-400/50', text: 'text-lime-200' },
  voice: { bg: 'bg-violet-500/20', border: 'border-violet-400/50', text: 'text-violet-200' },
  sfx: { bg: 'bg-amber-500/20', border: 'border-amber-400/50', text: 'text-amber-200' },
  bgm: { bg: 'bg-teal-500/20', border: 'border-teal-400/50', text: 'text-teal-200' },
};

export const LANG_LABEL: Record<Lang, string> = { ko: '한국어', en: 'English', ja: '日本語', es: 'Español' };
export const LANG_SHORT: Record<Lang, string> = { ko: 'KO', en: 'EN', ja: 'JA', es: 'ES' };
