import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// 정적 산출물(dist/)만으로 현장 배포 — 절대 경로 대신 상대 경로로 빌드한다(base: "./").
// 그래야 python http.server / nginx 어느 쪽에서 서빙해도 하위 경로 문제가 없다.
export default defineConfig({
  plugins: [react()],
  base: "./",
  // 개발 서버는 loopback 전용 (LAN 노출은 현장 정적 서버의 몫 — ADR R-0004)
  server: { port: 8082, host: "0.0.0.0", strictPort: true },
  build: { outDir: "dist", sourcemap: false },
  test: {
    environment: "jsdom",
    globals: true,
    // 테스트 타임존을 UTC로 고정 — KST 표기가 브라우저 로컬 타임존과 무관함을
    // 검증하려면 테스트 런타임이 KST가 아니어야 한다(CDX-R3 확인 리뷰). 개발 PC가
    // KST라도 로컬-시간 회귀(Date#getHours 등)를 테스트가 잡을 수 있게 한다.
    env: { TZ: "UTC" },
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/main.tsx", "src/**/*.d.ts"],
      // perFile: 파일 하나만 커버리지가 낮아도 실패 — 후속 phase의 미테스트 모듈이
      // 기존 파일의 높은 커버리지에 가려지는 것을 막는다 (CDX-R1-12).
      thresholds: { perFile: true, lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
