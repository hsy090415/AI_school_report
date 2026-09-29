import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "AI 보고서 분석 테스트",
  description: "보고서 파일 분석과 활동 기록 초안 생성을 검증하는 테스트 화면",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          color: "#172033",
          background: "#f3f5f9",
          fontFamily:
            'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Segoe UI", sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
