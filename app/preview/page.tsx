import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '모바일 프리뷰 — Pickle Studio',
  robots: { index: false, follow: false },
};

/**
 * PC에서 모바일 레이아웃을 그대로 확인하기 위한 QA 화면.
 * 390×844(아이폰 14/15급) 뷰포트로 편집기를 iframe에 띄운다.
 */
export default function MobilePreviewPage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center gap-4 px-4 py-6">
      <div className="flex w-full max-w-3xl items-center justify-between">
        <div>
          <h1 className="text-[15px] font-bold text-white">모바일 프리뷰</h1>
          <p className="text-[11px] text-slate-500">390 × 844 뷰포트에서 실제 모바일 레이아웃을 확인합니다.</p>
        </div>
        <Link href="/" className="btn text-[12px]">
          편집기로
        </Link>
      </div>

      <div className="rounded-[2.4rem] border border-white/15 bg-ink-800 p-2.5 shadow-[0_40px_120px_-40px_rgba(0,0,0,1)]">
        <div className="relative h-[844px] w-[390px] overflow-hidden rounded-[2rem] bg-black">
          <iframe src="/" title="모바일 편집기" width={390} height={844} className="h-full w-full border-0" />
          <div className="pointer-events-none absolute left-1/2 top-2 h-[18px] w-[86px] -translate-x-1/2 rounded-full bg-black" />
        </div>
      </div>
      <p className="max-w-md text-center text-[10.5px] leading-relaxed text-slate-600">
        이 화면은 확인용입니다. 실제 휴대폰에서는 같은 주소를 열면 전체 화면으로 열립니다.
      </p>
    </main>
  );
}
