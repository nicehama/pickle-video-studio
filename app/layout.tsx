import type { Metadata, Viewport } from 'next';
import { EditorProvider } from '@/lib/editor-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pickle Studio — 블로 스타일 웹 영상편집기',
  description:
    'PC·모바일 겸용 웹 영상편집기 2차 프로토타입. 롱폼↔숏폼 원클릭 전환, AI 성우(TTS), 감정별 효과음, 다국어 자막, WebM 내보내기까지 브라우저에서 동작합니다.',
  applicationName: 'Pickle Studio',
  themeColor: '#07080d',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#07080d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="font-sans antialiased">
        <EditorProvider>{children}</EditorProvider>
      </body>
    </html>
  );
}
