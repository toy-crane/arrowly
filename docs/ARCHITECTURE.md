# 아키텍처 — 도메인 경계와 의존 방향

이 문서는 Arrowly의 파일 구조, 레이어 모델, 네이밍 컨벤션의 단일 소스다.
새 코드를 어디에 둘지, 무엇을 import해도 되는지는 전부 여기서 판정한다.

## 원칙

- **도메인 단위 구성.** 기술 종류(components/, utils/)가 아니라 도메인(overlay, onboarding, …)으로 묶는다.
- **의존은 한 방향.** 상위 레이어만 하위를 import한다. 역참조(하위→상위)와 교차 참조(도메인↔도메인)는 금지.
- **경계는 도구로 강제.** 프런트는 dependency-cruiser가 위반을 빌드 실패로 만든다(`bun run depcruise`,
  `test:all`·CI 포함). Rust는 모듈 doc-comment와 이 문서가 규칙을 정의하고 리뷰로 지킨다.
- **Rust가 상태 전이의 단일 소스.** 웹뷰는 이벤트를 구독해 렌더링만 한다.

## 프런트엔드 (`src/`)

```
src/
├── main.tsx                 # app 레이어: 해시 라우팅으로 세 창 중 하나를 마운트
├── overlay/                 # feature: 상시 주석 오버레이 창
├── onboarding/              # feature: 최초 실행 튜토리얼 창
├── settings/                # feature: 단축키 설정 창
└── shared/                  # 공용 레이어 — feature를 모른다
    ├── drawing/             # 획 엔진 (StrokeStore·smoothing·types)
    ├── shortcuts/           # accelerator 유틸 + ShortcutEditor
    ├── ipc/                 # Rust↔웹뷰 계약 (커맨드·이벤트의 단일 소스)
    └── constants.ts · settings.ts · i18n.tsx   # leaf 유틸
```

### 의존 규칙 (dependency-cruiser가 강제)

| 규칙 | 내용 |
|---|---|
| `no-circular` | 순환 금지. `import type` 순환도 잡는다(`tsPreCompilationDeps`). |
| `no-cross-feature` | feature 도메인끼리는 서로 import 금지. 공용 코드는 `shared/`로 내린다(`src/` 하위 새 feature 폴더 자동 적용 — 폴더 열거 없음). |
| `shared-no-upward` | `shared/`는 feature·`main.tsx`를 import 금지(역참조 금지, 새 feature 폴더 자동 적용). |
| `no-barrel-bypass` | `shared/drawing`·`shared/shortcuts`·`shared/ipc`는 `index.ts` 공개 API로만 import. 내부 경로 침투 금지. |

테스트 파일(`*.test.tsx?`)은 통합 렌더 목적의 상향 import가 허용된다(순환 금지는 동일 적용).

### IPC 계약

- 커맨드명·이벤트명 문자열과 페이로드 타입은 `shared/ipc/`에만 존재한다.
  컴포넌트에서 `invoke()`/`listen()`을 직접 호출하지 않는다.
- 커맨드 인자는 Rust 파라미터와 같은 **top-level 키**로 전달한다(중첩 래핑 금지).
- Rust 쪽 커맨드·이벤트를 바꾸면 `shared/ipc/`를 같은 커밋에서 함께 바꾼다.

### settings.json 스키마

`src/shared/settings.ts`(웹뷰)와 `src-tauri/src/store.rs`(Rust)는 같은 settings.json의
양측 구현이다. **키를 추가/변경할 때는 두 파일을 반드시 함께 수정한다(lockstep).**

## Rust (`src-tauri/src/`)

```
src-tauri/src/
├── main.rs · lib.rs         # composition: 모듈 wiring, 플러그인, generate_handler!
├── shortcuts.rs · tray.rs   # adapters: OS 입력·메뉴 → core 호출
├── overlay.rs               # core: 창/모드/보드 전이의 단일 소스
├── state.rs · shortcut_policy.rs   # pure: Tauri 런타임 무관, 단위 테스트 대상(90% 게이트)
└── hotkey.rs · store.rs · i18n.rs  # leaf: OS/스토어 primitive
```

### 의존 규칙

- **composition → adapters → core → pure/leaf** 방향으로만 참조한다.
- **core(`overlay.rs`)는 adapter(`shortcuts.rs`·`tray.rs`)를 절대 참조하지 않는다.**
  - Esc 등록은 `hotkey.rs`(leaf)가 소유한다 — overlay가 shortcuts를 역참조하지 않기 위한 분리다.
  - 트레이 메뉴 갱신은 tray가 `mode-changed`·`board-changed`·`shortcuts-changed`를
    구독해 스스로 수행한다(옵저버). 전이 함수에서 `tray::sync`를 직접 부르지 않는다.
- **tray sync 불변식:** `sync`는 이벤트 페이로드를 신뢰하지 않고 항상 `SharedState` 현재값을
  읽는다. 그래서 비동기 갱신이라도 연쇄 전이의 마지막 리스너가 최종 상태로 수렴한다.
  리스너 콜백은 메인 스레드 밖에서 오므로 메뉴 조작은 `run_on_main_thread`로 넘긴다.
- 기본 accelerator·검증 규칙의 단일 소스는 `shortcut_policy.rs`다. 다른 모듈에 복제하지 않는다.
- settings.json 파일명·키 문자열은 `store.rs`에만 둔다.

### Tauri v2 컨벤션

- `#[tauri::command]`는 소유 도메인 모듈 안에 정의하고, `lib.rs`의 `generate_handler!`에
  경로로 등록한다(별도 commands 모듈을 만들지 않는다).
- 창별 권한은 `capabilities/default.json`에서 관리한다. 새 플러그인 권한이 필요하면 여기에 추가한다.
- `lib.rs`가 composition root다(모바일 대응 표준 구조 — `main.rs`는 shim).
- Tauri API는 학습 기억이 아니라 공식 `https://tauri.app/llms-full.txt`로 v2 기준을 확인하고 작성한다.

## 네이밍

| 대상 | 규칙 | 예시 |
|---|---|---|
| FE 파일 전체 | kebab-case (Next.js 스타일) | `drawing-canvas.tsx`, `strokes.ts` |
| 컴포넌트 심볼 | PascalCase (JSX 규칙) | `export function DrawingCanvas` |
| 배럴 | 도메인 공개 API 경계에서만 `index.ts` | `shared/drawing/index.ts` |
| Rust 파일·커맨드 | snake_case | `shortcut_policy.rs`, `toggle_board` |
| 상수 | SCREAMING_SNAKE_CASE | `DEFAULT_TOGGLE`, `SETTINGS_FILE` |
| 이벤트명 | kebab-case | `mode-changed`, `board-changed` |
| JSON·스토어 키 | camelCase | `markerHidden`, `onboardingDone` |
| 테스트 | 소스 옆 colocate, `*.test.ts(x)` | `strokes.test.ts` |

## 새 코드를 어디에 두나

1. 한 창(feature)에서만 쓰는 코드 → 그 feature 폴더.
2. 두 feature 이상이 쓰는 코드 → `shared/` 하위 도메인(없으면 새로 만들고 `index.ts` 배럴 추가,
   `.dependency-cruiser.cjs`의 `no-barrel-bypass` 목록에 등록).
3. Rust 커맨드/이벤트 추가 → 소유 도메인 모듈 + `generate_handler!` + `shared/ipc/` 동시 수정.
4. 순수 정책 로직(Rust) → `shortcut_policy.rs`·`state.rs`처럼 런타임 무관 모듈로 두고 단위 테스트를
   붙인다(커버리지 게이트 대상). 네이티브 어댑터 코드는 `scripts/rust-coverage.sh`의 ignore 목록에
   추가하고 macOS 수동 체크리스트(docs/TESTING.md)로 검증한다.
5. 새 feature 폴더(창)를 추가하면 `no-cross-feature`/`shared-no-upward`는 자동 적용된다 —
   별도 등록 불필요. 단 `shared/` 하위 도메인 추가 시에는 2번의 `no-barrel-bypass` 등록이 여전히 필요하다.
