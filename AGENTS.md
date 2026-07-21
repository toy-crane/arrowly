# Arrowly

macOS 화면 주석 오버레이 앱. 제품 경계는 `docs/specs/product-boundary/spec.md`, 기능 동작은 `docs/specs/`의 각 스펙을 참고한다.

## 스택

Tauri v2 + Vite/React/TypeScript + Bun. 타깃 macOS.

## 문서와 도메인 언어

- 도메인 용어의 단일 소스는 루트 `GLOSSARY.md`다. 스펙과 코드 설명에서 같은 개념에 다른 이름을 만들지 않는다.
- 제품 동작·상태 전이·인수 조건은 `docs/specs/<capability>/spec.md`에 둔다. 기능을 바꾸면 코드와 같은 커밋에서 해당 스펙을 갱신한다.
- 되돌리기 어렵고, 맥락 없이는 의외이며, 실제 대안 사이의 절충인 결정만 `docs/decisions/`에 기록한다.
- 화면·프로토타입 등 문서용 자산은 `docs/assets/` 또는 해당 기능 스펙 옆에 둔다. 앱 빌드 자산은 루트 `assets/`가 소유한다.
- 종합 `REQUIREMENTS.md`, `ARCHITECTURE.md`, `TESTING.md`, `PLAN.md`를 다시 만들지 않는다. 제품 계약은 기능 스펙, 기여 규칙은 이 파일, 구현 사실은 코드·테스트·설정에 둔다.
- 기능별 `plan.md`는 구현 중에만 둘 수 있으며 완료 후 삭제한다. 완료 이력은 Git이 소유한다.

## 프로젝트 구조와 프런트엔드 경계

```text
src/
├── main.tsx       # app: 해시 라우팅과 창별 마운트
├── overlay/       # feature: 주석 오버레이
├── onboarding/    # feature: 최초 실행 튜토리얼
├── settings/      # feature: 단축키 설정
└── shared/        # 공용 도메인과 leaf 유틸; feature를 모른다
    ├── drawing/
    ├── shortcuts/
    └── ipc/
```

- 파일은 기술 종류가 아니라 도메인 단위로 배치한다.
- 의존은 `app → feature → shared` 한 방향이다. feature 간 교차 import와 `shared`의 상향 import를 금지한다.
- `shared/drawing`, `shared/shortcuts`, `shared/ipc`는 `index.ts` 공개 API로만 import한다.
- 프런트 경계의 실행 가능한 단일 소스는 `.dependency-cruiser.cjs`다. 새 shared 도메인을 만들면 `no-barrel-bypass`에도 등록한다.
- 구조를 바꾸면 `bun run depcruise`를 실행한다. 위반은 `test:all`과 CI를 실패시킨다.

## Rust 경계

```text
src-tauri/src/
├── main.rs · lib.rs               # composition
├── shortcuts.rs · tray.rs         # OS adapter
├── overlay.rs                     # overlay core
├── state.rs · shortcut_policy.rs  # runtime-free policy
└── events.rs · hotkey.rs · store.rs · i18n.rs  # leaf
```

- 의존은 `composition → adapter → core → policy/leaf` 방향으로만 둔다.
- `overlay.rs`는 `shortcuts.rs`나 `tray.rs`를 참조하지 않는다. 어댑터는 상태 전이 이벤트를 구독해 현재 `SharedState`로 수렴한다.
- 순수 상태·단축키 정책은 Tauri 런타임에서 분리해 단위 테스트와 Rust 커버리지 게이트에 포함한다.
- 네이티브 AppKit·웹뷰·전역 단축키 어댑터는 모의 커버리지 수치로 대체하지 않고 관련 기능 스펙의 macOS 인수 조건으로 검증한다.
- `lib.rs`가 composition root고 `main.rs`는 shim이다. `#[tauri::command]`는 소유 모듈에 정의해 `generate_handler!`에 경로로 등록한다.

## Rust↔웹뷰와 설정 계약

- 커맨드·이벤트 문자열과 웹뷰 페이로드 타입은 `src/shared/ipc/`가 단일 소스다. 컴포넌트에서 `invoke()`·`listen()`을 직접 호출하지 않는다.
- Rust 이벤트명은 `src-tauri/src/events.rs` 상수만 사용한다. 양쪽 계약을 같은 커밋에서 바꾼다.
- 커맨드 인자는 Rust 파라미터와 같은 top-level 키로 전달한다. 중첩 래핑하지 않는다.
- `settings.json` 스키마는 `src/shared/settings.ts`와 `src-tauri/src/store.rs`를 lockstep으로 바꾼다. 파일명·Rust 키 문자열·마이그레이션은 `store.rs`가 소유한다.
- 기본 accelerator와 검증 규칙은 `src-tauri/src/shortcut_policy.rs`가 단일 소스다.

## 네이밍

- FE 파일은 kebab-case, 컴포넌트는 PascalCase, 테스트는 소스 옆 `*.test.ts(x)`를 사용한다.
- Rust 파일·커맨드는 snake_case, 상수는 SCREAMING_SNAKE_CASE다.
- 이벤트명은 kebab-case, JSON·스토어 키는 camelCase다.
- 배럴은 shared 도메인의 공개 API 경계에서만 사용한다.

## Tauri v2

- 이 프로젝트는 Tauri v2를 쓴다. v1 API를 생성하지 않는다.
- Tauri API는 학습 기억이 아니라 공식 `https://tauri.app/llms-full.txt`를 fetch해 v2 기준으로 확인한 뒤 작성한다.
- 창별 플러그인 권한은 `src-tauri/capabilities/default.json`에서 관리한다.

## 검증

- 프런트 단위·상호작용 테스트는 Vitest와 `@tauri-apps/api/mocks`를 사용한다.
- Rust 정책·IPC 테스트는 일반 단위 테스트와 `tauri::test::MockRuntime`을 사용한다.
- 실제 NSPanel, 전체화면 Space, 포커스 유지, 전역 단축키, 메뉴바, IME와 포인터 전달은 관련 스펙의 네이티브 인수 조건으로 검증한다.
- 프런트 커버리지 범위와 90% 게이트의 단일 소스는 `vitest.config.ts`, Rust 정책 모듈의 90% 게이트는 `scripts/rust-coverage.sh`다.
- 시간 의존 테스트는 fake timer 대상을 필요한 프리미티브로 제한하고 테스트 후 real timer로 복구한다. 동기 `requestAnimationFrame` 스텁과 섞을 때 예약 id가 덮이지 않는지 확인한다.
- 전체 검증은 `bun run test:all`로 dependency-cruiser, 프런트 커버리지, Rust 커버리지, 빌드를 함께 실행한다.

## 공통 에이전트 운영 규칙

- 이 파일은 Claude Code와 Codex가 함께 읽는 프로젝트 공통 지침의 원본이다.
- 공통 스킬은 `.agents/skills/<skill>/SKILL.md`만 수정한다. Claude Code의 `.claude/skills/`는 이 디렉터리를 가리키는 미러다.
- 에이전트별 설정은 각 도구의 전용 영역에 둔다. Claude Code 전용 설정은 `.claude/`, Codex 전용 설정은 사용자 Codex 설정에 둔다.
- 스킬이나 공통 규칙을 바꾼 뒤에는 `bun run agent:sync-check`를 실행한다.
- 변경을 마치면 관련 검증을 실행하고, 논리적 작업 단위별로 conventional commit을 만든다. 사용자가 요청하지 않은 원격 push는 하지 않는다.

## 기본 명령

- 개발 서버: `bun run dev`
- 프런트엔드 빌드/타입 검사: `bun run build`
- Tauri 개발 실행: `bun run tauri dev`
- 빠른 테스트: `bun run test`
- 의존 경계: `bun run depcruise`
- 전체 게이트: `bun run test:all`
- 개별 Rust 테스트: `bun run test:rust`
- Rust 커버리지 도구 최초 설치: `rustup component add llvm-tools-preview && cargo install cargo-llvm-cov --locked`
