import type { Clip, Lang, Project, SubtitlePreset, Tone } from './types';

/* ------------------------------------------------------------------ */
/* 샘플 씬 — 로컬 영상 없이도 바로 편집을 체험할 수 있는 절차적 영상   */
/* ------------------------------------------------------------------ */
export interface SceneDef {
  key: string;
  name: string;
  a: string; // 상단 색
  b: string; // 하단 색
  accent: string;
  motion: 'drift' | 'flow' | 'pulse' | 'grid';
  subject: string;
}

export const SCENES: SceneDef[] = [
  { key: 'dawn', name: '새벽 도시', a: '#060b1e', b: '#1d3357', accent: '#8fb6ff', motion: 'drift', subject: '실외기 실루엣' },
  { key: 'workshop', name: '정비 현장', a: '#171009', b: '#3d2a12', accent: '#ffb257', motion: 'pulse', subject: '공구 · 배관' },
  { key: 'sunset', name: '노을 하늘', a: '#2a0f1c', b: '#7a3b2e', accent: '#ffc59b', motion: 'flow', subject: '옥상 풍경' },
  { key: 'studio', name: '스튜디오', a: '#0d0f16', b: '#232a3a', accent: '#c6f24e', motion: 'grid', subject: '조명 · 크로마' },
  { key: 'neon', name: '네온 거리', a: '#12061f', b: '#3a1052', accent: '#ff6ad5', motion: 'drift', subject: '간판 불빛' },
  { key: 'forest', name: '숲 아침', a: '#06180f', b: '#1c3c28', accent: '#9ce8b2', motion: 'flow', subject: '나뭇잎' },
];

export const sceneByKey = (key?: string) => SCENES.find((s) => s.key === key);

/* ------------------------------------------------------------------ */
/* 성우(감정 톤) 프리셋                                                */
/* ------------------------------------------------------------------ */
export interface TonePreset {
  id: Tone;
  name: string;
  desc: string;
  rate: number;
  pitch: number;
  volume: number;
  pause: number; // 기본 숨 쉼 길이(초)
  voiceLangHint: string;
}

export const TONES: TonePreset[] = [
  { id: 'calm', name: '차분함', desc: '낮고 천천히, 설명형', rate: 0.92, pitch: 0.94, volume: 1, pause: 0.45, voiceLangHint: '부드러운 톤' },
  { id: 'bright', name: '활기참', desc: '밝게, 또박또박', rate: 1.08, pitch: 1.14, volume: 1, pause: 0.28, voiceLangHint: '밝은 톤' },
  { id: 'doc', name: '다큐', desc: '절제된 나레이션', rate: 0.96, pitch: 0.9, volume: 0.95, pause: 0.55, voiceLangHint: '중저음 나레이션' },
  { id: 'shorts', name: '쇼츠 텐션', desc: '빠르고 강한 후킹', rate: 1.22, pitch: 1.22, volume: 1, pause: 0.15, voiceLangHint: '강한 어택' },
];

export const toneById = (id: Tone) => TONES.find((t) => t.id === id) ?? TONES[0];

export const VOICE_LANG: Record<Lang, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  ja: 'ja-JP',
  es: 'es-ES',
};

/* ------------------------------------------------------------------ */
/* SFX 3단 태그                                                        */
/* ------------------------------------------------------------------ */
export const SFX_CATEGORIES = [
  { id: 'animal', name: '동물', icon: '🐾' },
  { id: 'nature', name: '자연', icon: '🌧' },
  { id: 'life', name: '생활', icon: '🔔' },
  { id: 'traffic', name: '교통', icon: '🚗' },
  { id: 'machine', name: '기계', icon: '⚙️' },
  { id: 'human', name: '인간', icon: '🗣' },
  { id: 'abstract', name: '추상', icon: '✨' },
];

export const SFX_EMOTIONS = [
  { id: 'happy', name: '반가움' },
  { id: 'guard', name: '경계' },
  { id: 'startle', name: '놀람' },
  { id: 'tense', name: '긴장' },
  { id: 'calm', name: '편안' },
  { id: 'funny', name: '웃김' },
  { id: 'sad', name: '슬픔' },
];

export const SFX_INTENSITIES = [
  { id: 'near', name: '가까이 · 강하게', gain: 1, distance: 0 },
  { id: 'mid', name: '보통 거리', gain: 0.72, distance: 0.25 },
  { id: 'far', name: '멀리 · 약하게', gain: 0.45, distance: 0.6 },
];

export const VARIATION_COUNT = 4;

export interface PromptGuess {
  category: string;
  emotion: string;
  intensity: string;
  note: string;
}

const CATEGORY_WORDS: Record<string, string[]> = {
  animal: ['강아지', '개', '고양이', '새', '까마귀', '벌', '말', '늑대', '동물', '짖', '야옹', '으르렁'],
  nature: ['비', '바람', '천둥', '파도', '숲', '물', '빗소리', '번개', '새벽'],
  life: ['문', '초인종', '컵', '유리', '종이', '발소리', '전화', '알람', '타이머', '뚝뚝'],
  traffic: ['차', '자동차', '브레이크', '경적', '지하철', '오토바이', '기차', '엔진'],
  machine: ['모터', '실외기', '에어컨', '드릴', '펌프', '기계', '공구', '진공', '컴프레서'],
  human: ['한숨', '웃음', '숨', '기침', '속삭', '군중', '박수', '아이'],
  abstract: ['긴장', '라이저', '임팩트', '전환', '글리치', '서브', '스팅', '우우웅'],
};

const EMOTION_WORDS: Record<string, string[]> = {
  happy: ['반가', '기쁘', '신나', '즐거', '환호', '웃으며', '들뜬'],
  guard: ['경계', '으르렁', '낮게', '위협', '조심', '살금'],
  startle: ['놀라', '깜짝', '툭', '갑자기', '충격'],
  tense: ['긴장', '불안', '조여', '위기', '서늘'],
  calm: ['잔잔', '편안', '평온', '느긋', '부드럽'],
  funny: ['웃김', '우스', '귀여', '장난', '뿅'],
  sad: ['슬프', '쓸쓸', '애절', '무겁', '한숨'],
};

export function parsePrompt(prompt: string): PromptGuess {
  const text = prompt.trim();
  let category = 'life';
  let emotion = 'calm';
  let intensity = 'mid';
  const hits: string[] = [];
  for (const [cat, words] of Object.entries(CATEGORY_WORDS)) {
    if (words.some((w) => text.includes(w))) {
      category = cat;
      hits.push(cat);
      break;
    }
  }
  for (const [emo, words] of Object.entries(EMOTION_WORDS)) {
    if (words.some((w) => text.includes(w))) {
      emotion = emo;
      hits.push(emo);
      break;
    }
  }
  if (/가까|바로 옆|크게|강하게|시끄/.test(text)) intensity = 'near';
  else if (/멀리|작게|은은|희미|뒤에서/.test(text)) intensity = 'far';
  const note = hits.length
    ? `${hits.map((h) => (SFX_CATEGORIES.find((c) => c.id === h)?.name ?? SFX_EMOTIONS.find((e) => e.id === h)?.name ?? h)).join(' × ')} 로 해석했습니다.`
    : '태그 단어를 찾지 못해 기본값(생활 × 편안 × 보통)으로 해석했습니다.';
  return { category, emotion, intensity, note };
}

/* ------------------------------------------------------------------ */
/* 자막 프리셋                                                         */
/* ------------------------------------------------------------------ */
export const SUBTITLE_PRESETS: Record<SubtitlePreset, {
  name: string;
  desc: string;
  maxChars: number;
  maxLines: number;
  fontPx: number;
  weight: number;
  color: string;
  outline: string;
  y: number;
}> = {
  shorts: {
    name: '숏폼 강조',
    desc: 'Pretendard ExtraBold · 노랑 강조 · 1~2줄',
    maxChars: 14,
    maxLines: 2,
    fontPx: 0.072,
    weight: 800,
    color: '#ffe14d',
    outline: '#111',
    y: 0.42,
  },
  longform: {
    name: '롱폼 기본',
    desc: '깔끔한 흰색 · 하단 2줄',
    maxChars: 28,
    maxLines: 2,
    fontPx: 0.044,
    weight: 600,
    color: '#ffffff',
    outline: '#000',
    y: 0.845,
  },
};

/* 언어별 폰트 폴백 스택 */
export const FONT_STACK: Record<Lang, string> = {
  ko: 'Pretendard Variable, Pretendard, system-ui, sans-serif',
  en: 'Pretendard Variable, Pretendard, system-ui, sans-serif',
  ja: 'Pretendard Variable, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif',
  es: 'Pretendard Variable, Pretendard, system-ui, sans-serif',
};

/* ------------------------------------------------------------------ */
/* 내보내기 해상도                                                     */
/* ------------------------------------------------------------------ */
export const RESOLUTIONS = {
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
} as const;
export type ResolutionKey = keyof typeof RESOLUTIONS;

export const BGM_PRESETS = [
  { id: 'calm', name: '잔잔한 패드', desc: '낮은 사인 패드 · 다큐 톤' },
  { id: 'bright', name: '밝은 팝', desc: '경쾌한 아르페지오' },
  { id: 'tense', name: '긴장감', desc: '저음 드론 · 서스펜스' },
  { id: 'cinema', name: '시네마틱', desc: '넓은 화음 · 상승' },
];

/* ------------------------------------------------------------------ */
/* 데모 번역 사전 — API 키가 없을 때 쓰는 표본 번역                    */
/* ------------------------------------------------------------------ */
export const DEMO_TRANSLATIONS: { ko: string; en: string; ja: string; es: string }[] = [
  {
    ko: '새벽 6시, 실외기 소리가 달라졌습니다.',
    en: 'At 6 a.m., the outdoor unit started to sound different.',
    ja: '朝6時、室外機の音が変わりました。',
    es: 'A las 6 de la mañana, la unidad exterior empezó a sonar distinto.',
  },
  {
    ko: '3분이면 원인을 찾을 수 있습니다.',
    en: 'Three minutes is all it takes to find the cause.',
    ja: '3分で原因が見つかります。',
    es: 'Tres minutos bastan para encontrar la causa.',
  },
  {
    ko: '소음의 90%는 팬 밸런스에서 시작됩니다.',
    en: '90% of noise starts with fan balance.',
    ja: '騒音の90%はファンバランスから始まります。',
    es: 'El 90% del ruido empieza en el balance del ventilador.',
  },
  {
    ko: '오늘 작업, 순서대로 보여드립니다.',
    en: "Here's today's job, step by step.",
    ja: '今日の作業を順番にお見せします。',
    es: 'Les muestro el trabajo de hoy, paso a paso.',
  },
  {
    ko: '구독과 좋아요는 큰 힘이 됩니다.',
    en: 'A like and subscribe help a lot.',
    ja: 'いいねとチャンネル登録が力になります。',
    es: 'Un like y una suscripción ayudan mucho.',
  },
];

/* ------------------------------------------------------------------ */
/* 샘플 프로젝트                                                       */
/* ------------------------------------------------------------------ */
/* SSR/CSR 렌더가 같은 id를 만들도록 결정적 카운터를 쓴다 */
let seq = 0;
export const uid = (prefix = 'c') => `${prefix}${(seq++).toString(36)}`;

export function createSampleProject(): Project {
  const clips: Clip[] = [
    { id: uid('v'), track: 'video', start: 0, duration: 6, label: '새벽 도시', sceneKey: 'dawn', mediaId: 'sample:dawn', inPoint: 0 },
    { id: uid('v'), track: 'video', start: 6, duration: 7, label: '정비 현장', sceneKey: 'workshop', mediaId: 'sample:workshop', inPoint: 0 },
    { id: uid('v'), track: 'video', start: 13, duration: 7, label: '노을 하늘', sceneKey: 'sunset', mediaId: 'sample:sunset', inPoint: 0 },

    { id: uid('s'), track: 'subtitle', start: 0.6, duration: 3.6, label: '인트로', lang: 'ko', text: DEMO_TRANSLATIONS[0].ko, offsetMs: 0, translations: { en: DEMO_TRANSLATIONS[0].en, ja: DEMO_TRANSLATIONS[0].ja, es: DEMO_TRANSLATIONS[0].es } },
    { id: uid('s'), track: 'subtitle', start: 4.4, duration: 3.4, label: '후킹', lang: 'ko', text: DEMO_TRANSLATIONS[1].ko, offsetMs: 0, translations: { en: DEMO_TRANSLATIONS[1].en, ja: DEMO_TRANSLATIONS[1].ja, es: DEMO_TRANSLATIONS[1].es } },
    { id: uid('s'), track: 'subtitle', start: 8.2, duration: 4.2, label: '원인', lang: 'ko', text: DEMO_TRANSLATIONS[2].ko, offsetMs: -150, translations: { en: DEMO_TRANSLATIONS[2].en, ja: DEMO_TRANSLATIONS[2].ja, es: DEMO_TRANSLATIONS[2].es } },
    { id: uid('s'), track: 'subtitle', start: 13.6, duration: 4.6, label: '아웃트로', lang: 'ko', text: DEMO_TRANSLATIONS[3].ko, offsetMs: 0, translations: { en: DEMO_TRANSLATIONS[3].en, ja: DEMO_TRANSLATIONS[3].ja, es: DEMO_TRANSLATIONS[3].es } },

    { id: uid('t'), track: 'voice', start: 0.8, duration: 3.8, label: '성우 · 다큐', voice: { text: DEMO_TRANSLATIONS[0].ko, lang: 'ko', tone: 'doc', rate: 0.96, pitch: 0.9, volume: 0.95 } },
    { id: uid('t'), track: 'voice', start: 8.4, duration: 4.2, label: '성우 · 차분', voice: { text: DEMO_TRANSLATIONS[2].ko, lang: 'ko', tone: 'calm', rate: 0.92, pitch: 0.94, volume: 1 } },

    { id: uid('f'), track: 'sfx', start: 6.0, duration: 1.4, label: '모터 웅웅', sfx: { prompt: '실외기 모터가 낮게 웅웅거리는 소리', category: 'machine', emotion: 'tense', intensity: 'near', variation: 1 } },
    { id: uid('f'), track: 'sfx', start: 12.6, duration: 0.9, label: '공구 툭', sfx: { prompt: '공구를 내려놓는 또각 소리', category: 'life', emotion: 'startle', intensity: 'mid', variation: 0 } },

    { id: uid('m'), track: 'bgm', start: 0, duration: 20, label: '잔잔한 패드', bgmPreset: 'calm' },
  ];
  return {
    title: '실외기 소음, 3분 만에 원인 찾기',
    aspect: '9:16',
    clips,
    safeZone: true,
    lang: 'ko',
    subtitlePreset: 'shorts',
    music: true,
  };
}

export function createEmptyProject(): Project {
  return {
    title: '새 프로젝트',
    aspect: '9:16',
    clips: [
      { id: uid('v'), track: 'video', start: 0, duration: 5, label: '스튜디오', sceneKey: 'studio', mediaId: 'sample:studio', inPoint: 0 },
      { id: uid('s'), track: 'subtitle', start: 0.4, duration: 3, label: '자막 1', lang: 'ko', text: '첫 문장을 입력하세요', offsetMs: 0 },
    ],
    safeZone: true,
    lang: 'ko',
    subtitlePreset: 'shorts',
    music: false,
  };
}
