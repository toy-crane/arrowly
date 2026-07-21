# Arrowly v1 구현 플랜

> 이 문서는 실행 지침서다. 각 마일스톤을 순서대로, 명시된 완료 기준을 통과한 뒤에만 다음으로 진행한다.
> 요구사항의 근거는 `docs/REQUIREMENTS.md`, 시각 스펙은 디자인 시안 v1(세션 아티팩트)이다.

---

## 🔑 사용자(toy-crane) 핵심 체크포인트

구현 AI가 아니라 **사용자가 직접** 해야 하는 일들. 이것만 보면 언제 무엇을 결정/검증해야 하는지 알 수 있다.

| 시점 | 할 일 | 내용 |
|---|---|---|
| 시작 전 | **Mac 개발 환경 준비** | Xcode Command Line Tools(`xcode-select --install`), Rust(`curl https://sh.rustup.rs -sSf \| sh`), Bun 설치. 확인: `cargo --version && bun --version` |
| M1 끝 | **빈 앱 실행 확인** | 리포를 pull 받아 `bun install && bun tauri dev`가 뜨는지 확인 |
| **M2 끝** | **⭐ Go/No-Go 판정 (가장 중요)** | 아래 "M2 판정 체크리스트" 6항목을 Mac에서 직접 실행. 하나라도 실패하면 구현을 멈추고 폴백 A/B를 선택해야 한다. **이 판정 전에는 M3 이후를 시작하지 않는다** |
| M3 끝 | **그리기 지연 체감 판정** | 실제 화면 녹화를 켜고 그려본 뒤 "지연이 녹화에 거슬리는가"를 판정. 거슬리면 네이티브 렌더러 전환 논의 |
| M4 끝 | **⌥Tab 실사용 충돌 확인** | 평소 쓰는 앱들에서 ⌥Tab이 막히는 곳이 있는지 확인. 있으면 기본값 재논의 |
| M8 끝 | **온보딩 20초 완주 테스트** | 첫 실행 흐름을 처음 보는 사람 입장으로 완주 |
| M10 전 | **Apple Developer Program 가입** | 연 $99. 서명·공증에 필수. 가입 전까지 M10은 문서 작성까지만 가능 |
| 아무 때나 | **PR 운영 결정** | 현재 문서+구현이 PR #3 하나에 쌓인다. 문서만 먼저 머지하고 싶으면 말할 것 |

### M2 판정 체크리스트 (사용자가 Mac에서 실행)

준비: `bun tauri dev`로 스파이크 빌드 실행, VS Code(또는 아무 앱)를 뒤에 띄워둔다.

1. [ ] 오버레이가 떠 있을 때 화면이 하얗게 덮이지 않고 **아래 화면이 그대로 보인다** (웹뷰 투명)
2. [ ] 그리기 ON 상태에서 ⌘Z를 누르면 **개발자 콘솔에 keydown 로그가 찍힌다** (패널이 키 입력 수신)
3. [ ] 그 상태에서 **VS Code의 메뉴바·창 제목이 활성(진한 색)으로 유지**된다 — 화면 상단 메뉴바가 VS Code 것 그대로여야 함
4. [ ] Safari를 전체화면으로 만든 뒤 그리기 ON → **전체화면 위에 오버레이가 뜬다**
5. [ ] 그리기 ON 상태에서 **메뉴바(시계 등)를 클릭할 수 있다**
6. [ ] 그리기 OFF(통과 모드)에서 **클릭이 아래 앱에 그대로 전달**된다

전부 통과 → M3 진행. 2 또는 3 실패 → **중단하고 선택**: (A) 포커스 탈취 수용(아래 앱이 비활성으로 보임, 녹화 품질 손해) / (B) ⌘Z·⇧⌘Z를 그림이 있는 동안만 전역 단축키로 등록(그 동안 다른 앱 undo 차단). 이벤트 탭(CGEventTap)은 어떤 경우에도 쓰지 않는다(권한·App Store 경로).

---

## 실행 원칙 (구현 AI를 위한 규칙)

1. **환경**: 이 세션류의 원격 컨테이너는 리눅스다. macOS 빌드·실행 불가. 할 수 있는 것: 코드 작성, `bun install`, `tsc --noEmit`, `bun run build`(vite). 할 수 없는 것: `bun tauri dev/build`, `cargo check`(macOS 전용 의존성). **Rust 코드는 컴파일 확인 없이 작성되므로, 마일스톤마다 사용자 Mac 검증을 요청하고 그 피드백으로 수정한다.**
2. **Tauri v2 원칙 (CLAUDE.md)**: 모든 Tauri API는 작성 직전에 공식 문서(`https://tauri.app/llms-full.txt` fetch 또는 docs.rs/tauri)로 v2 시그니처를 확인한다. `tauri::SystemTray`, `@tauri-apps/api/window`의 v1 형태가 보이면 잘못된 것이다.
3. **브랜치/커밋**: 브랜치 `claude/mac-app-unknowns-cldv6y`에 커밋·푸시(PR #3에 쌓임). 마일스톤당 최소 1커밋, prefix `feat:`/`chore:`/`docs:`.
4. **금지**: CGEventTap, 획 선택·이동·저장 기능, 다중 모니터 동시 지원, 자동 페이드, 자동 업데이터. (REQUIREMENTS 비목표)
5. **순서 강제**: M2 통과 판정 전에 M3+ 코드를 작성하지 않는다.

## 아키텍처 개요

```
┌─ Rust (src-tauri) ────────────────────────────┐
│ state.rs      앱 상태: 모드(그리기/통과), 획 유무, 설정 │
│ overlay.rs    NSPanel 생성·모드 전환·모니터 배치      │
│ shortcuts.rs  전역 단축키 등록/해제 (⌥Tab·⇧⌥Tab·Esc) │
│ tray.rs       메뉴바 아이콘·메뉴                     │
└──────────────┬────────────────────────────────┘
               │ emit / invoke
┌─ 웹뷰 (src) ──┴────────────────────────────────┐
│ overlay/   DrawingCanvas, Marker, CursorLayer   │
│ onboarding/ 3단계 튜토리얼 + 단축키 레코더           │
│ shared/    상수(5색·5굵기), store 헬퍼            │
└────────────────────────────────────────────────┘
```

### 이벤트·명령 계약 (전체 목록 — 이름을 바꾸지 말 것)

| 이름 | 방향 | 페이로드 | 시점 |
|---|---|---|---|
| `mode-changed` (event) | Rust→웹뷰 | `{ drawing: boolean }` | 토글·Esc 직후. `drawing:false` 수신 시 웹뷰는 live 획만 취소 — 그림 버퍼는 유지(숨김≠삭제) |
| `clear-all` (event) | Rust→웹뷰 | 없음 | 트레이 "전체 지우기" 클릭 시 (⌥⌫는 웹뷰 keydown이 직접 처리 — 전역 아님) |
| `marker-hidden-changed` (event) | Rust→웹뷰 | `{ hidden: boolean }` | 트레이 토글 시 |
| `toggle_drawing` (command) | 웹뷰→Rust | 없음 | 온보딩·마커에서 모드 전환 요청 |
| `try_register_shortcut` (command) | 웹뷰→Rust | `{ id: "toggle"\|"board", accelerator: string }` | 상시 전역 키 레코더 검증: 임시 register→unregister, `Result<(), String>` 반환 |
| `apply_settings` (command) | 웹뷰→Rust | 설정 객체 전체 | 온보딩 완료·설정 변경 시 |
| `shortcuts-changed` (event) | Rust→웹뷰 | `{ board, clear, text }` | `apply_shortcuts` 성공 직후 — 오버레이가 로컬 키(clear·text) 매칭 기준을 갱신 |
| `enter-text-mode` (event) | Rust→웹뷰 | 없음 | 트레이 "텍스트 입력" 클릭 시. 통과 모드였다면 Rust가 그리기 진입을 먼저 수행한 뒤 emit |
| `apply_shortcuts` (command) | 웹뷰→Rust | `{ toggle, board, clear, text }` | 단축키 저장 시. toggle·board는 전역 재등록, clear·text는 검증·보관만(전역 미등록) |

설정 저장은 웹뷰가 `@tauri-apps/plugin-store`로 직접 읽고 쓴다(파일 `settings.json`). Rust는 기동 시 같은 파일을 읽어 단축키를 등록한다.

### 설정 스키마 (settings.json)

```json
{
  "color": "#FF2D95",
  "width": "medium",
  "markerPos": { "xRatio": 0.04, "yRatio": 0.92 },
  "markerHidden": false,
  "shortcuts": { "toggle": "Alt+Tab", "board": "Shift+Alt+Tab", "clear": "Alt+Backspace", "text": "KeyT" },
  "onboardingDone": false
}
```

5색 상수: `#FFD400 #FF7A00 #FF2D95 #2ED573 #00AEEF`. 굵기 5단계(색과 같은 개수): 화면 짧은 변의 `xthin 0.25% / thin 0.4% / medium 0.55% / thick 0.75% / xthick 1.1%` (최소 2px), 기본 `medium`.

---

## M0. 확정 결정 기록

1. 디자인 아티팩트 섹션 01을 단일 확정 카드로 정리: "잉크 블록 + 2번 글리프(손맛 강화) 확정". 요약 표의 1행을 "확정"으로. 같은 파일 경로로 재배포(동일 URL 유지).
2. `docs/REQUIREMENTS.md` 앱 형태 섹션의 아이콘 항목 끝에 "(시안 2번 글리프로 최종 확정)" 추가.
3. 커밋 `docs: 아이콘 글리프 시안 2번으로 최종 확정` → push.

**확정 글리프 SVG (이후 M9의 원본 — 그대로 사용)**:
```svg
<!-- viewBox 0 0 100 100, 타일: #FFDF33→#F5C800 그라디언트, 획: #1C1E24 -->
<path d="M21 85 C27 72 29 64 36 54 C41 46.5 47 41 54 36.5 C62 31.5 69 29 76 27.8"
      fill="none" stroke="#1C1E24" stroke-width="9" stroke-linecap="round"
      opacity=".3" transform="translate(2 -1.4)"/>
<path d="M21 85 C27 72 29 64 36 54 C41 46.5 47 41 54 36.5 C62 31.5 69 29 76 27.8"
      fill="none" stroke="#1C1E24" stroke-width="10" stroke-linecap="round"/>
<path d="M60 14.5 C67 18 74 22.5 81 28.5" fill="none" stroke="#1C1E24" stroke-width="10" stroke-linecap="round"/>
<path d="M82.5 25.5 C76.5 32.5 72 40.5 69.5 48" fill="none" stroke="#1C1E24" stroke-width="10" stroke-linecap="round"/>
```

## M1. 프로젝트 스캐폴딩

1. 리포 루트에 기존 파일(docs/, CLAUDE.md, README.md, .claude/)이 있으므로, 임시 폴더에 생성 후 이동한다:
   ```bash
   cd /tmp && bunx create-tauri-app@latest arrowly-tmp --template react-ts --manager bun --yes
   rsync -a /tmp/arrowly-tmp/ /home/user/arrowly/ --exclude .git
   ```
   (create-tauri-app 플래그가 다르면 `--help`로 확인. 실패 시 수동으로 package.json/vite/src-tauri 구조를 작성해도 된다 — 표준 구조는 llms-full.txt에 있음)
2. `src-tauri/tauri.conf.json` 핵심 설정:
   ```json
   {
     "identifier": "com.toycrane.arrowly",
     "productName": "Arrowly",
     "app": {
       "macOSPrivateApi": true,
       "windows": []
     }
   }
   ```
   창은 conf가 아니라 Rust 코드에서 만든다(패널 변환이 필요하므로).
3. `src-tauri/Cargo.toml` 의존성:
   ```toml
   tauri = { version = "2", features = ["macos-private-api", "tray-icon", "image-png"] }
   tauri-plugin-global-shortcut = "2"
   tauri-plugin-store = "2"
   tauri-plugin-autostart = "2"
   tauri-nspanel = { git = "https://github.com/ahkohd/tauri-nspanel", branch = "v2" }
   objc2 = "0.5"
   objc2-app-kit = { version = "0.2", features = ["NSApplication", "NSWindow", "NSScreen"] }
   ```
   ⚠️ tauri-nspanel의 branch명과 objc2 버전은 구현 시점에 리포/crates.io에서 확인.
4. `src-tauri/capabilities/default.json`에 권한 추가: `core:default`, `global-shortcut:allow-register`, `global-shortcut:allow-unregister`, `global-shortcut:allow-is-registered`, `store:default`, `autostart:default` (정확한 permission 문자열은 각 플러그인 문서에서 확인).
5. `lib.rs` 골격: 플러그인 4개 등록, `setup`에서 `app.set_activation_policy(tauri::ActivationPolicy::Accessory)`, `overlay::create(app)?` 호출, 모듈 선언(`mod overlay; mod shortcuts; mod tray; mod state;`).
6. 프론트 디렉토리: `src/overlay/`, `src/onboarding/`, `src/shared/constants.ts`(5색·5굵기), 해시 라우팅(`location.hash === "#/onboarding"`이면 온보딩, 아니면 오버레이 UI 렌더).
7. 검증(로컬): `bun install && bunx tsc --noEmit && bun run build` 통과. 커밋 `feat: Tauri v2 프로젝트 스캐폴딩` → push → **사용자 Mac에서 `bun tauri dev` 확인 요청.**

## M2. 오버레이 패널 스파이크 — 리스크 게이트 ⭐

목표: "⌘Z 수신 + 아래 앱 활성 유지"의 양립을 실물로 판정. 임시 코드 허용.

1. `overlay.rs`에 창 생성:
   ```rust
   // 방향 제시 — 시그니처는 docs.rs에서 확인
   let win = tauri::WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("index.html".into()))
       .transparent(true).decorations(false).always_on_top(true)
       .visible(false).skip_taskbar(true).focused(false)
       .build()?;
   ```
2. `tauri-nspanel`로 패널 변환: `win.to_panel()?` 후
   - 스타일 마스크에 **nonactivatingPanel(= 1<<7, 값 128)** 추가
   - collection behavior 설정: `canJoinAllSpaces(1<<0) | stationary(1<<4) | ignoresCycle(1<<6) | fullScreenAuxiliary(1<<8)` → 값 `337`
   - `became_key_only_if_needed` 류 설정이 있으면 끔(키 입력을 받아야 함)
   ⚠️ 상수 값과 메서드명은 tauri-nspanel README + AppKit 문서에서 확인.
3. 창 레벨 실험 (메뉴바=mainMenu 레벨 24, 상태 아이콘=25):
   | 후보 레벨 | 기대 | 기록할 것 |
   |---|---|---|
   | 3 (floating) | 기본 후보 | 전체화면 위 표시 여부 |
   | 8 (modalPanel) | 3 실패 시 | 〃 + 메뉴바 클릭 가능 여부 |
   | 23 (mainMenu−1) | 최후 후보 | 〃 |
   fullScreenAuxiliary 덕에 낮은 레벨로도 전체화면 Space에 합류할 수 있다 — 가장 낮은 통과 레벨을 채택한다.
4. 웹뷰에 keydown 로거(`⌘Z` 감지 시 화면에 표시 + console.log), 배경 `transparent`, 테스트용 반투명 사각형 하나.
5. 임시 토글: 트레이 없이 임시 전역 단축키(⌥Tab)로 `set_ignore_cursor_events` + show/hide 전환.
6. 커밋 `feat: 오버레이 NSPanel 스파이크` → push → **사용자에게 "M2 판정 체크리스트" 실행 요청 → 결과에 따라 진행/중단.**

> **✅ 판정 결과 (2026-07-09, Go)**: 6항목 전부 통과. 레벨 **Floating(4)** 으로 전체화면 표시·메뉴바 클릭이 모두 충족돼 레벨 상향 불필요. 그리기 ON 중 ⌘Z가 패널로 라우팅되면서(TextEdit 언두 미발동으로 행동 증명) 아래 앱은 컬러 신호등·메뉴바 유지 — 패널이 key만 갖고 main은 아래 앱에 남는 구조 확인. 주의: 사용자 Mac의 ScreenBrush가 ⌥Tab을 자체 토글로 쓰므로(활성 탈취형) 테스트 전 종료 필요.

## M3. 그리기 엔진

파일: `src/overlay/DrawingCanvas.tsx`, `src/overlay/strokes.ts`, `src/overlay/smoothing.ts`

1. 타입:
   ```ts
   type Point = { x: number; y: number };            // CSS(logical) px
   type Stroke = { points: Point[]; color: string; width: number };
   ```
   전역 상태: `strokes: Stroke[]`, `redoStack: Stroke[]`, `live: Stroke | null`.
2. 캔버스 2장 겹침(base=확정 획, live=진행 중 획). 두 캔버스 모두:
   ```ts
   canvas.width = innerWidth * devicePixelRatio;
   canvas.height = innerHeight * devicePixelRatio;
   ctx.scale(devicePixelRatio, devicePixelRatio);
   ```
   `resize`·`mode-changed` 이벤트에서 재설정 후 base 전체 재렌더.
3. 입력 (Pointer Events):
   - `pointerdown`(마커 영역 제외): `live` 시작, `setPointerCapture`
   - `pointermove`: `e.getCoalescedEvents?.() ?? [e]`의 점들을 `live.points`에 push, 렌더는 rAF로 배칭(프레임당 1회, live 캔버스만 clear&redraw)
   - `pointerup`: live를 strokes에 push, base에 그 획만 추가 렌더(전체 재렌더 금지), live 클리어, `redoStack = []`
4. 렌더(`smoothing.ts`): 점 4개 미만이면 polyline. 이상이면 Catmull-Rom→cubic Bézier:
   ```
   각 구간 [p1,p2]에 대해 cp1 = p1 + (p2 − p0)/6, cp2 = p2 − (p3 − p1)/6
   ctx.bezierCurveTo(cp1, cp2, p2)
   ```
   공통 스타일: `lineCap="round"`, `lineJoin="round"`, `globalAlpha=1`(외곽선·그림자 금지).
5. 교정: `undo()`=strokes.pop→redoStack, `redo()`, `clearAll()`. base 재렌더는 undo/redo/clear에서만 전체 수행. ⌘Z/⇧⌘Z는 window keydown에서 처리(`e.metaKey && e.code==="KeyZ"`, shift로 분기), ⌥⌫도 window keydown에서 처리(전역 단축키 아님). `clear-all` 이벤트 리스너 연결. `mode-changed` `drawing:false` 수신 시 live 획만 취소 — 그림은 삭제하지 않는다(숨김 유지 정책). `drawing:true` 재진입 시 백킹 재설정 후 base 재렌더로 복원.
6. 검증: tsc·build 통과 후 커밋 `feat: 캔버스 그리기 엔진` → **사용자 Mac 체감 판정**(빠른 지그재그가 각지지 않는가, Retina에서 선명한가, 지연이 거슬리지 않는가).

## M4. 모드 토글과 전역 단축키

파일: `src-tauri/src/shortcuts.rs`, `overlay.rs` 확장

1. 상태 전이 표 (Rust가 단일 소스):
   | 현재 | 입력 | 동작 |
   |---|---|---|
   | 통과 | ⌥Tab | 그리기 ON 시퀀스 |
   | 그리기 | ⌥Tab 또는 Esc | 통과 모드 시퀀스 (그림은 유지한 채 숨김) |
   | 그리기 | ⌥⌫ (웹뷰 keydown, 전역 아님) | 웹뷰가 그림 전체 삭제, 모드 유지 |
2. 그리기 ON 시퀀스: ① `cursor_position()`으로 전역 커서 좌표 ② `available_monitors()`에서 좌표를 포함하는 모니터 선택 ③ 패널 프레임을 그 모니터 전체로 — 직전과 다른 모니터면 `clear-all` emit(이전 그림 좌표 무효) ④ Esc 전역 등록 ⑤ `set_ignore_cursor_events(false)` ⑥ `show()` ⑦ `emit("mode-changed", { drawing: true })` ⑧ 트레이 아이콘 상태 갱신. **④가 실패하면 ⑤~⑦을 하지 않고 에러 알림**(탈출구 없는 진입 금지).
3. 통과 모드 시퀀스: Esc 해제 → `set_ignore_cursor_events(true)` → 패널 hide → `emit("mode-changed", { drawing: false })` (웹뷰는 live 획만 취소, 그림 버퍼는 유지 — 숨김≠삭제).
4. 등록 수명: ⌥Tab=기동 시 상시(실패 시 트레이 메뉴로만 진입 가능하게 하고 배지·알림), Esc=그리기 ON 동안만. ⌥⌫은 전역 등록 없음(웹뷰 keydown 처리).
5. 커서(`src/overlay/cursor.ts`): 현재 색·굵기로 SVG를 data-URI로 만들어 `document.body.style.cursor`에 적용. 점(현재 색, 지름=굵기px×2, 최소 8) + 이중 링 — 흰 링(rgba(255,255,255,.95), 1.8px, 점+2.5px) 바깥에 어두운 헤어라인(rgba(0,0,0,.35), 1px). 통과 모드에선 `cursor: default` (어차피 이벤트 무시 상태). (커서 시안 A 확정)
6. 검증 커밋 `feat: 모드 토글·전역 단축키` → 사용자 Mac: REQUIREMENTS 구현 순서 4·5 기준 + "웹뷰 강제 정지(무한루프 주입) 상태에서도 Esc로 탈출됨".

## M5. 플로팅 마커

파일: `src/overlay/Marker.tsx`

- 시각 스펙(시안 §02, 크기 확대 + 팝오버 구조로 변경): 높이 44px 캡슐, `rgba(24,26,32,.88)` + 1px `rgba(255,255,255,.14)` 테두리, radius 999, 그림자 `0 4px 18px rgba(0,0,0,.35)`. 캡슐=색 점(20px)+구분선+굵기 획(34×7px), **위치·크기 불변**. 선택지는 캡슐 위 8px 팝오버(같은 재질, 중앙 정렬+화면 클램프, 최상단 근처면 아래로). 색 팝오버=5색 점, 현재 색만 중립 링(`outline 2px #E8EAF0, offset 2.5px`). 굵기 팝오버=5단계 가로 바(높이 3/5/7/9/12, 현재만 채움, 나머지 1.5px 테두리만).
- 상태머신: `collapsed | colors | widths`. 색 점 탭→colors 팝오버, 굵기 획 탭→widths 팝오버(열린 셀은 옅은 하이라이트), 항목 선택·같은 셀 재탭·바깥 pointerdown·그리기 시작→collapsed.
- 드래그: 마커 루트 `pointerdown`에서 시작(120ms/4px 이동 임계값으로 탭과 구분), 이동 후 `markerPos`(화면 비율)를 store에 저장.
- **hit-test 규칙**: 마커 내부에서 시작한 포인터 이벤트는 `stopPropagation()`으로 캔버스에 전달 금지 — 마커 위에서 획이 시작되면 안 된다.
- 표시 조건: `drawing && !markerHidden`. `marker-hidden-changed` 이벤트 구독.
- 커밋 `feat: 플로팅 마커` → 사용자 Mac: 시안 3상태와 비교, 색·굵기 변경이 커서와 다음 획에 즉시 반영.

## M6. 메뉴바 상주

파일: `src-tauri/src/tray.rs`

- `TrayIconBuilder` + 템플릿 아이콘(`icon_as_template(true)`, M9 전까지는 임시 글리프 PNG).
- 메뉴 구성(라벨의 단축키 표기는 store 값으로 생성, 변경 시 메뉴 재빌드):
  | id | 라벨 | 동작 |
  |---|---|---|
  | toggle | 그리기 시작/중지 ⌥⇥ | 토글 시퀀스 |
  | clear | 전체 지우기 ⌥⌫ | clear-all emit |
  | marker | 마커 숨기기 ✓ | markerHidden 토글+저장 |
  | autostart | 로그인 시 실행 ✓ | autostart 플러그인 enable/disable |
  | tutorial | 튜토리얼 다시 보기 | 온보딩 창 열기 |
  | quit | Arrowly 종료 | `app.exit(0)` |
- 트레이 아이콘은 상태와 무관하게 고정(화살표 글리프). 그리기 상태 표시는 플로팅 마커가 전담하므로 아이콘 변형을 두지 않는다(확정).
- 커밋 `feat: 메뉴바 트레이` → 사용자 Mac: Dock/⌘Tab에 안 보임, 메뉴로 전 기능 동작, 종료 확실.

## M7. 설정 영속화

- 웹뷰: `load("settings.json")`(plugin-store) 헬퍼를 `src/shared/settings.ts`로 감싸고 위 스키마의 기본값 정의. 변경 즉시 `set`+`save`.
- Rust: 기동 시 store 파일을 읽어 단축키 등록에 사용. 온보딩의 `apply_settings` command로 재등록.
- 커밋 `feat: 설정 영속화` → 재시작 후 색·굵기·마커 위치·단축키 유지 확인.

## M8. 온보딩 (3단계)

파일: `src/onboarding/*`, `overlay.rs`에 창 생성 함수 추가

- 창: 일반 WebviewWindow(`onboarding`), 640×480, 불투명, resizable(false), center. `onboardingDone=false`일 때 기동 시 생성. Accessory 정책에서 포커스가 안 오면 표시 직전 `app.show()`/activate 처리 확인.
- STEP 1 그려보기: 창 내 미니 캔버스(M3 엔진 재사용, 규모만 축소). 획 하나 그리면 "다음" 활성화.
- STEP 2 Esc·⌘Z·블랙보드 체험: 저장된 블랙보드 accelerator를 미니 캔버스에서 사용해 배경 전환과 획 유지를 확인한다. 체험 중에는 상시 전역 단축키를 잠시 해제하고, 단계가 끝나거나 창이 닫히면 복구한다.
- STEP 3 단축키 설정: 그리기 토글·블랙보드 토글·전체 지우기·텍스트 네 행을 레코딩한다(M11에서 텍스트 행 추가 — 온보딩·설정 창 동일 4행). 필드 포커스 상태에서 `keydown`을 캡처해 accelerator 문자열로 조립하고, 전역 충돌·중복·예약 키·수식키 없는 입력은 필드 아래 오류로 보여준다(텍스트 행만 수식키 없는 단독 키 허용 — 전역 미등록 키). 온보딩에서는 Reset을 숨기고, 마지막 줄에서 메뉴바의 단축키 설정 진입점을 안내한 뒤 `onboardingDone=true`를 저장하고 창을 닫는다.
- 조건부 권한 단계: 현 아키텍처에선 표시하지 않음. `steps` 배열에 자리만 남긴다.
- 커밋 `feat: 온보딩` → 사용자 Mac: 20초 완주, 재실행 시 안 뜸, 트레이 "튜토리얼 다시 보기"로 재진입.

## M9. 아이콘 자산

1. `assets/icon.svg`: M0의 확정 글리프 + 잉크 블록 타일(1024×1024, 모서리 반경 약 232px, 그라디언트 `#FFDF33→#F5C800`) — macOS가 마스크를 자동 적용하지 않으므로 반경 포함해 그린다.
2. `assets/tray-template.svg`: 글리프만 검정 단색(3획 버전 — 덧그은 획 제외, 소형에서 뭉개짐 방지).
3. 생성 스크립트 `scripts/gen-icons.sh`(사용자 Mac에서 실행):
   ```bash
   # 필요: brew install librsvg
   rsvg-convert -w 1024 -h 1024 assets/icon.svg -o /tmp/icon-1024.png
   bun tauri icon /tmp/icon-1024.png            # icns 등 일괄 생성
   rsvg-convert -w 18 -h 18 assets/tray-template.svg -o src-tauri/icons/tray-Template.png
   rsvg-convert -w 36 -h 36 assets/tray-template.svg -o src-tauri/icons/tray-Template@2x.png
   ```
4. tray.rs가 템플릿 PNG를 사용하도록 교체. 커밋 `feat: 앱·트레이 아이콘`.

## M10. 배포 준비

1. `rustup target add aarch64-apple-darwin x86_64-apple-darwin`, 빌드 `bun tauri build --target universal-apple-darwin`, bundle targets에 `dmg`.
2. 서명·공증(사용자 계정 필요): 환경변수 `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`(앱 암호), `APPLE_TEAM_ID` — Tauri 내장 공증 흐름 사용.
3. `docs/RELEASE.md` 작성: 인증서 발급 → 환경변수 → 빌드 → 공증 확인(`spctl -a -vv`) → DMG 배포 절차.
4. 커밋 `docs: 릴리스 가이드` / `chore: universal 빌드 설정`.

## M11. 타이핑 텍스트 + 도형 홀드 스냅

블랙보드 강의 인터뷰(REQUIREMENTS "타이핑 텍스트"·"그리기 > 도형 홀드 스냅")로 확정된 두 기능. 하위 단계: M11.1 문서 계약 → M11.2 마크 모델 → **M11.3 텍스트 에디터 (IME 게이트)** → M11.4 텍스트 키 배선 → M11.5 마커 T 셀·더블클릭 → M11.6 트레이 항목 → M11.7 도형 분류기 → M11.8 홀드 스냅 통합 → M11.9 테스트 문서.

### 마크 모델 (M11.2)

`strokes.ts`의 `Stroke`를 discriminated union `Mark`로 확장: `PenMark`(kind "pen", 기존 구조) / `TextMark`(kind "text", x·y·text·color·size) / `ShapeMark`(kind "shape", rect|ellipse|line geometry·color·width). undo 단위 = 마크 1개. `StrokeStore.push(mark)`는 redoStack을 비운다(commitLive와 동일 불변식). `retractLast()`는 redo에 넣지 않고 회수(더블클릭 점 회수 전용). `drawStroke`→`drawMark` 디스패치.

### 텍스트 상태 머신 (M11.3)

- `OverlayApp`이 `textMode` 소유(마커 하이라이트·커서), `DrawingCanvas`가 편집 세션(`editorPos`) 소유.
- `textMode && !editorPos` = 대기(I-beam 커서, 클릭=캐럿 배치, 드래그 무시) / `+editorPos` = 편집 중(DOM `<input>` — 한글 IME는 네이티브 input으로 처리).
- 확정 = Enter(조합 중 제외) 또는 바깥 클릭 → `TextMark` push + 증분 렌더 → 펜 복귀(one-shot). 취소 = 입력 중 ⌘Z(입력만 폐기, 그리기 유지). Esc = Rust 전역 그대로(그리기 종료 + 폐기, 특수처리 없음). 크기 = `textSizePx(widthKey)` (굵기 5단계 × TEXT_SIZE_FACTOR 5, 최소 14px), 색 = 현재 잉크.
- **keydown 우선순위(확정)**: 편집 요소 포커스 중에는 오버레이 window keydown이 즉시 return — undo·clear·텍스트 키 전부 타이핑으로 흡수된다. ⌘Z 취소는 에디터 자체 핸들러가 처리.

### 텍스트 키 (M11.4)

4번째 재설정 단축키 `shortcuts.text`, 기본 `KeyT`. clear와 같은 경로(검증·보관, 전역 미등록·오버레이 keydown 매칭). 정책: `parse_valid_local` — 로컬 키는 수식키 면제, Esc·⌘Z 계열·중복은 여전히 거부. 레거시 3키 스토어는 프런트 `DEFAULT_SHORTCUTS` merge가 자동 보완(`migrated_board_default`식 Rust 마이그레이션 불필요 — 단독 KeyT는 기존 3키와 충돌 불가).

### 더블클릭 진입 (M11.5)

`DBLCLICK_MS=350 / DBLCLICK_SLOP_PX=6 / CLICK_SLOP_PX=4`. 두 번째 클릭이 조건 충족 시 획을 시작하지 않고 pointerUp에서 직전 클릭 점 마크를 `retractLast()`로 회수 후 에디터를 연다. 트레이드오프: 첫 클릭 점이 최대 350ms 보였다 사라짐 — 거슬리면 대안(점 커밋 지연)으로 교체.

### 홀드 보정 (M11.7–8)

`shapes.ts` 순수 분류기 상수: `HOLD_MS=450 / RING_DELAY_MS=150 / STILL_RADIUS_PX=3.5 / MIN_SNAP_DIAG_PX=24 / CLOSED_GAP_RATIO=0.25 / MIN_CLOSED_PATH_RATIO=1.2 / CORNER_TURN_DEG=55 / MIN_RECT_CORNERS=3`. 파이프라인: bbox 최소치 → 호길이 리샘플 → 닫힘 판정 → 닫힌 획은 모서리 카운트 후 rect(축정렬 bbox) / ellipse(bbox 내접), 열린 획은 시작점을 고정한 line. 직선 잠금 뒤 포인터 이동은 끝점을 따라가고 <kbd>Shift</kbd>는 방향을 45° 단위로 제한한다. 화살표는 분류·자동 보정하지 않는다. 감도 튜닝은 사용자 Mac 체크리스트가 게이트이며, 세부 계약은 `docs/specs/line-lock-gesture/spec.md`를 따른다.

### ⭐ M11.3 IME 판정 게이트 (M2 방식 Go/No-Go)

non-activating panel에서 한글 조합 입력 검증 — 실패 상태로 M11.4+ 안착 금지:
1. 그리기 ON 위에서 T→클릭→2벌식 "안녕하세요" 조합(밑줄·후보창 포함) 정상
2. Enter 확정·바깥 클릭 확정, 확정 클릭이 획을 시작하지 않음
3. 입력 중 ⌘Z = 입력만 취소 / Esc = 그리기 종료+폐기

실패 시 폴백 사다리: (a) 편집 시작 시 `make_key_window()` 재호출 커맨드 → (b) 편집 중에만 활성화 수용(포커스 탈취는 입력 중 한정) → (c) 사용자 에스컬레이션(기능 차단).

**사전 리서치 결과 (2026-07, 실기기 확인 전 확률 평가)**:
- 성공 쪽 근거: ① Apple 문서상 IME 연결(NSTextInputContext)의 활성 조건은 "key window + first responder"이며 **앱 활성화는 요구되지 않음** — 우리 패널은 `show_and_make_key()`로 충족. ② Alfred/Raycast류 런처가 같은 구조(non-activating panel)에서 CJK 입력을 일상 처리 — AppKit 레벨 선례 실증. ③ tauri-nspanel #104는 "창 레벨 >20이 IME를 차단"을 보고하는데 우리는 Floating(3) — "창 레벨 안 올림" 결정이 IME도 지켜준다.
- 잔여 리스크: ① 런처 선례는 네이티브 텍스트 필드 기준 — **WKWebView 경유 조합의 직접 선례는 미발견**(이 마지막 조각이 게이트가 남는 이유). ② Electron #32307: 트레이 클릭으로 앱 활성화 없이 창을 띄우면 CJK IME가 아예 안 뜨는 전례(미해결 종료) — **트레이 "텍스트 입력" 진입 경로를 체크리스트에서 별도 확인**할 것. ③ styleMask를 생성 후 변경하면 내부 활성화 상태가 어긋나는 AppKit 버그(FB16484811) — M2에서 비활성 동작 자체는 검증됨.
- 실패 시 진단 순서: 트레이 진입 경로만 실패하면 `enter_text_mode`에서 key window 재요청(폴백 a와 동일 처방), 전 경로 실패면 폴백 사다리 순서대로.

---

## 리스크와 폴백

| 리스크 | 신호 | 대응 |
|---|---|---|
| M2 실패: 패널이 키를 못 받거나 아래 앱이 비활성화됨 | 판정 2·3 실패 | 중단. 사용자에게 폴백 A(포커스 탈취 수용)/B(⌘Z 조건부 전역 등록) 선택 요청 |
| tauri-nspanel 버전 비호환 | 컴파일 에러 | objc2로 직접 NSPanel 변환(스타일 마스크 128 추가) 구현으로 대체 |
| 리눅스에서 Rust 컴파일 확인 불가 | cargo check 실패 | 사용자 Mac 검증 루프로 대체(원칙 1) |
| ⌥Tab이 특정 앱 내부 단축키와 충돌 | 사용자 M4 체크 | 문서화된 한계 — 레코더로 재설정 |
| 웹뷰 그리기 지연이 체감됨 | 사용자 M3 판정 | 네이티브 렌더러 전환(REQUIREMENTS 배포 절 참조)을 앞당기는 논의 |

## 최종 통합 검증 (M10 후)

- REQUIREMENTS.md "구현 순서" 1~10의 검증 기준 전항목.
- 시안 대조: 마커 3상태, 커서 링, 온보딩 3화면, 트레이 글리프.
- 시나리오 테스트: "VS Code 위에 밑줄→통과 모드로 스크롤→⌥⌫→다시 그리기"를 실녹화로 1회.
