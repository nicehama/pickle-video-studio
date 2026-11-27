# Pickle Studio — 블로(Vrew) 스타일 웹 영상편집기 (1차 프로토타입)

PC·모바일 겸용 웹 영상편집기 1차 프로토타입입니다. 설치 없이 브라우저에서 바로 편집하고,
유튜브 롱폼(16:9)과 숏폼(9:16)을 한 번에 오가며, AI 성우·감정별 효과음·다국어 자막까지 한 화면에서 다룹니다.

- **배포 주소**: https://pickle-video-studio.vercel.app (Vercel · `main` 푸시 시 자동 재배포)
- **저장소**: https://github.com/nicehama/pickle-video-studio
- **스택**: Next.js 14 App Router · TypeScript · Tailwind CSS · Canvas 2D · Web Audio · Web Speech · MediaRecorder

## 1차 프로토타입에서 실제로 동작하는 것

### 1. PC · 모바일 반응형 편집 화면
- **PC(1024px+)**: 좌측 미디어 패널 + 중앙 프리뷰 캔버스 + 우측 도구(자막·성우·효과음) + 하단 5트랙 타임라인 + 단축키 안내.
- **모바일**: 상단 프리뷰 + 탭형 도구 + 접이식 타임라인. 클립 이동·트림 손잡이는 눈에 보이는 선은 얇지만 **터치 영역 44×44px**로 잡혀 있습니다.
- 단축키(PC): `Space` 재생/일시정지, `S` 재생 헤드에서 분할, `Delete` 선택 클립 삭제, `⌘/Ctrl+Z` 실행 취소, `⇧⌘Z` 다시 실행, `←/→` 0.5초 이동.

### 2. 롱폼(16:9) ↔ 숏폼(9:16) 원클릭 전환
- 상단 세그먼트로 즉시 전환. 클립·자막·시간 데이터는 그대로 유지되고 프리뷰 캔버스 해상도만 1280×720 ↔ 720×1280으로 바뀝니다.
- 숏폼에서는 **유튜브 쇼츠 안전영역 오버레이**(우측 버튼 영역 / 하단 설명·캡션 / 상단 상태바)를 켜고 끌 수 있습니다. 오버레이는 내보낼 때 자동으로 빠집니다.

### 3. 실제로 만질 수 있는 편집기
- 로컬 영상·오디오 업로드(파일은 브라우저 안에만 머묾) 또는 **내장 샘플 씬 6종**을 눌러 바로 편집 시작.
- 재생/일시정지/정지, 재생 헤드 이동, **컷 분할(S)**, **트림(양끝 핸들)**, **클립 이동(스냅 지원)**, **삭제**, **실행 취소/다시 실행**.
- 샘플과 절차적 씬은 `lib/renderer.ts`의 한 렌더러로 그려 프리뷰와 내보내기 결과가 같습니다.

### 4. AI 성우(TTS) 스튜디오
- 감정 톤 4종(차분함 · 활기참 · 다큐 · 쇼츠 텐션)이 속도/피치/음량 프리셋을 함께 바꿉니다.
- **호흡·쉼표 삽입**: `<0.5s>` 토큰을 넣으면 브라우저 음성이라도 문장 사이에 실제 침묵이 들어갑니다(SSML 미지원 우회).
- 속도·피치·강세 슬라이더, 예상 길이 계산, 미리듣기, 타임라인 삽입(성우 트랙).
- **어댑터 구조**: `GET /api/tts`가 `browser | elevenlabs | openai`를 알려 주고, `ELEVENLABS_API_KEY` 또는 `OPENAI_API_KEY`를 Vercel 환경변수에 넣으면 같은 화면이 그대로 신경망 음성으로 전환됩니다(클라이언트 코드 변경 없음).

### 5. 상황·감정 세분화 효과음(SFX) 스튜디오
- 3단 태그: **카테고리(동물/자연/생활/교통/기계/인간/추상) × 감정·뉘앙스(반가움/경계/놀람/긴장/편안/웃김/슬픔) × 강도·거리감(가까이·강하게/보통/멀리·약하게)**.
- 한 줄 프롬프트("강아지가 반가워해서 가까이서 짖는 소리")를 태그로 **자동 해석**하고, 같은 태그에서 결정적 난수로 **변주 4종**을 만듭니다.
- Web Audio 실시간 합성 → 파형 미리보기·미리듣기·타임라인 삽입. 성우 발화 구간과 겹치면 자동 **−8dB 덕킹**되고 타임라인에 `DUCK` 배지가 붙습니다.
- `ELEVENLABS_API_KEY`가 있으면 `/api/sfx`가 ElevenLabs 사운드 이펙트 API로 전환됩니다.

### 6. AI 자막 & 다국어 번역
- 줄별 편집, 숏폼(노랑 ExtraBold 1줄)/롱폼(흰색 하단 2줄) 프리셋, 글자 수 초과 경고, **2줄 나누기** 버튼.
- 한국어 원문 → 영어·일본어·스페인어 번역(`/api/translate`). 키가 없을 때는 표본 문장 사전으로 동작하고, 그 외 문장은 "API 키 필요"로 표시합니다.
- 줄마다 **±150ms 싱크 조정**과 오프셋 배지.
- 언어별 폰트 폴백 스택(일본어는 Hiragino/Noto Sans JP로 자동 폴백) 표시.
- **SRT 4개 언어 다운로드**(실제 `.srt` 파일 생성) — 자막 패널과 내보내기 모달 양쪽에서 가능.

### 7. 내보내기
- 해상도 1080p/720p/480p, 구간 지정, **−14 LUFS 근사 노멀라이즈**, **자막 번인** 토글.
- **MediaRecorder → WebM 실제 파일 생성**: 캔버스 30fps 캡처 + Web Audio 출력(효과음·BGM)을 함께 담고 진행률을 보여 줍니다.
  - 브라우저 음성(Web Speech)은 브라우저가 오디오를 캡처할 수 없어 WebM에 포함되지 않습니다(화면에 명시). 신경망 TTS 키를 연결하면 `/api/tts` 응답을 오디오로 섞는 확장 지점이 준비되어 있습니다.
- **현재 프레임 PNG** 저장.

## 구조

```
app/
  layout.tsx            메타·폰트(Pretendard)·에디터 프로바이더
  page.tsx              편집기 진입
  api/tts/route.ts      TTS 어댑터 (browser | elevenlabs | openai)
  api/sfx/route.ts      SFX 어댑터 (synth | elevenlabs)
  api/translate/route.ts 번역 (demo | openai)
components/
  Editor.tsx            전체 레이아웃·단축키·토스트·모달
  Preview.tsx           캔버스 프리뷰 · 재생 컨트롤 · 비율/안전영역
  Timeline.tsx          5트랙 타임라인 (이동·트림·분할·스냅·줌)
  ExportModal.tsx       WebM · PNG · SRT
  panels/               Media · Subtitle · TTS · SFX
lib/
  types.ts data.ts      모델 · 프리셋 · 샘플 프로젝트
  editor-context.tsx    상태·실행취소·재생 루프(시간 스토어 분리)
  editor-ops.ts         분할·트림·이동·덕킹 계산
  renderer.ts           캔버스 렌더러(프리뷰 = 내보내기)
  sfx.ts audio-engine.ts Web Audio 합성·BGM·덕킹
  tts.ts                Web Speech 낭독·길이 추정
  srt.ts                SRT 생성·다운로드
```

## 환경변수 (선택)

| 이름 | 효과 |
| --- | --- |
| `ELEVENLABS_API_KEY` | 성우·효과음이 ElevenLabs 신경망 API로 전환 (`ELEVENLABS_VOICE_ID` 선택) |
| `OPENAI_API_KEY` | 성우가 OpenAI TTS로, 번역이 GPT로 전환 (`OPENAI_TTS_VOICE`, `OPENAI_TEXT_MODEL` 선택) |

키가 없으면 전부 브라우저 안에서(Web Speech + Web Audio + 표본 사전) 동작합니다. 결제·유료 플랜은 쓰지 않습니다.

## 개발

```sh
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

## 다음 단계 후보

1. 신경망 TTS/SFX 키 연결 후 WebM 오디오 트랙에 성우 음성 합성.
2. 프로젝트 저장/불러오기(JSON 내보내기·불러오기) + IndexedDB 자동 저장.
3. 자막 타임코드 자동 인식(Whisper) → 자막 초안 생성.
4. 세로/가로 동시 렌더(한 프로젝트에서 두 비율 결과물).
