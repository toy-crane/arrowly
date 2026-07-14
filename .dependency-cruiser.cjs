/**
 * 프런트엔드 의존 경계 규칙 — docs/ARCHITECTURE.md의 레이어 모델을 기계로 강제한다.
 * 위반은 `bun run depcruise`(test:all·CI 포함)에서 빌드 실패다.
 *
 * 레이어: app(main.tsx) → features(overlay|onboarding|settings) → shared
 * 역방향·교차 참조 금지. 테스트 파일은 통합 렌더 목적의 상향 import를 허용한다.
 */
const TEST_FILES = "\\.(test|spec)\\.[jt]sx?$";

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "순환 의존 금지 — import type 순환도 잡는다(tsPreCompilationDeps)",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-cross-feature",
      severity: "error",
      comment:
        "feature 도메인끼리는 서로 import할 수 없다 — 공용 코드는 shared로 내린다 (src/ 하위 새 feature 폴더에 자동 적용)",
      from: {
        path: "^src/([^/]+)/",
        pathNot: `^src/shared/|${TEST_FILES}`,
      },
      to: {
        path: "^src/[^/]+/",
        pathNot: "^src/($1|shared)/",
      },
    },
    {
      name: "shared-no-upward",
      severity: "error",
      comment: "shared는 feature/app을 모른다 — 역참조 금지 (새 feature 폴더에 자동 적용)",
      from: {
        path: "^src/shared/",
        pathNot: TEST_FILES,
      },
      to: {
        path: "^src/[^/]+/|^src/main\\.tsx$",
        pathNot: "^src/shared/",
      },
    },
    {
      name: "no-barrel-bypass",
      severity: "error",
      comment: "shared 하위 도메인은 index.ts 공개 API로만 import한다 — 내부 경로 침투 금지",
      from: {
        path: "^src/",
        pathNot: "^src/shared/(drawing|shortcuts|ipc)/",
      },
      to: {
        path: "^src/shared/(drawing|shortcuts|ipc)/(?!index\\.ts$).+",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    // import type 엣지도 그래프에 포함 — 타입 전용 순환·역참조까지 차단한다
    tsPreCompilationDeps: true,
  },
};
