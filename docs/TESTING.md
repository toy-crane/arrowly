# Arrowly 테스트

## 기준

Tauri v2 공식 문서가 구분하는 세 계층을 따른다.

1. 프런트엔드 단위·상호작용 테스트: Vitest와 Tauri의 `@tauri-apps/api/mocks`를 사용한다.
2. Rust 단위·IPC 통합 테스트: 순수 정책 테스트와 `tauri::test::MockRuntime` 테스트를 사용한다.
3. macOS 네이티브 통합 테스트: 실제 앱에서 NSPanel, 전역 단축키, 트레이를 검증한다.

근거:

- [Tauri Tests](https://v2.tauri.app/develop/tests/)
- [Mock Tauri APIs](https://v2.tauri.app/develop/tests/mocking/)
- [tauri::test::mock_builder](https://docs.rs/tauri/latest/tauri/test/fn.mock_builder.html)
- [Tauri WebDriver](https://v2.tauri.app/develop/tests/webdriver/)
- [Vitest Coverage](https://vitest.dev/guide/coverage.html)

## 실행

```bash
# 최초 1회: Rust 커버리지 도구
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov --locked

# 전체 게이트
bun run test:all

# 개별 실행
bun run test
bun run test:coverage
bun run test:rust
bun run test:rust:coverage
```

## 커버리지 게이트

| 영역 | 포함 범위 | 최소 기준 |
|---|---|---|
| 프런트엔드 | `src/**/*.{ts,tsx}` | statements, branches, functions, lines 각각 90% |
| Rust 도메인 | `state.rs`, `shortcut_policy.rs` | regions, functions, lines 각각 90% 및 파일별 lines 90% |

프런트엔드는 프레임워크 부트스트랩인 `src/main.tsx`와 타입 선언인
`src/vite-env.d.ts`만 제외한다. 테스트 파일도 제품 코드 커버리지에서 제외한다.

Rust 수치에서 `lib.rs`, `overlay.rs`, `shortcuts.rs`, `tray.rs` 등의 네이티브
어댑터는 제외한다. Tauri 공식 설명대로 MockRuntime은 네이티브 웹뷰를 실행하지
않으며, Arrowly의 핵심 창 동작은 AppKit NSPanel과 실제 전역 단축키 등록에
의존하기 때문이다. 이 코드를 mock 호출 횟수로 덮어 수치를 높이지 않고, 아래의
실제 macOS 회귀 검증으로 다룬다. 어댑터가 계산하던 모니터·블랙보드 상태 전이와
단축키 정책은 `state.rs`, `shortcut_policy.rs`로 분리해 수치 게이트에 포함한다.

## 테스트 범위

- 획 시작·확정·취소, 점 클릭, Undo·Redo, redo 무효화, 전체 지우기
- 마크 유니언(펜·텍스트·도형) 렌더 디스패치, push의 redo 무효화, retractLast
- Catmull-Rom 기반 곡선 보간과 짧은 polyline
- Retina canvas backing, coalesced pointer input, 모드·전체 지우기 이벤트
- 타이핑 텍스트: 신규 진입·수동 줄바꿈·줄별 렌더/hit testing·2차원 캐럿·내용/크기 재편집·빈 값 삭제·확정/취소·IME 조합·편집 중 단축키 흡수
- 텍스트 이력: 추가·교체·이동·삭제 Undo/Redo, 내용+크기 한 단위, no-op 편집 제외, 겹친 텍스트의 최상위 선택
- 텍스트 이동: T 모드의 4px 클릭/드래그 분기, 잡은 지점 오프셋, live 미리보기, pointer cancel 복원, 이동 후 펜 복귀
- 텍스트 크기: 고정 5단계, 펜 두께 독립, 상하한 no-op, 기본값 저장과 새 초안/기존 편집의 저장 규칙
- 도형 분류기: 닫힘·모서리 판정, 사각형/타원, 열린 획 직선, 최소 크기 거부, 화살표 결과 없음, 튜닝 상수 계약
- 홀드 보정: 정지 감지·이동 리셋·진행 링 지연·직선 잠금과 끝점 조절·Shift 45° 제한·치환 커밋·undo 1단위·모드 전환 시 정리
- 단축키 생성·매칭·표시, 예약 키·중복·OS 충돌과 등록 복구
- 텍스트 키(4번째 재설정 단축키): 로컬 정책의 수식키 면제, 레거시 3키 스토어 기본값 보완, 온보딩·설정 창 4행 노출
- 색·굵기·텍스트 기본 크기·마커 위치·온보딩·단축키 설정 영속화
- 마커 팝오버, T split button, 편집/기본 크기 표시 전환, 바깥 클릭, 드래그 임계값과 화면 경계 clamp
- 오버레이의 그리기·블랙보드·텍스트 모드·마커·단축키 이벤트 동기화
- 온보딩 단계 잠금, 이전/다음 이동, 완료 저장과 창 닫기
- Rust 단축키 정책(전역·로컬), 기존 설정 마이그레이션, 모니터 변경, 블랙보드·2단계 Esc 상태표
- Tauri MockRuntime을 통한 IPC 성공·오류 응답

### 타이머 테스트 컨벤션

시간 의존 로직(홀드 스냅, 더블클릭)은 `Date.now()` + `setInterval` 기반으로 구현하고,
테스트는 fake timer를 **필요한 프리미티브로 제한해** 켠다 — 동기 rAF 스텁과의 충돌을 막는다.

```ts
vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
afterEach(() => vi.useRealTimers());
```

반복 `requestAnimationFrame` 스케줄을 검증하는 테스트는 스텁이 id 0을 반환해야 한다
(동기 스텁이 1을 반환하면 콜백 후 rafId가 덮여 다음 스케줄이 조기 반환된다 — DrawingCanvas.test.tsx hold-to-snap 참조).

## macOS 네이티브 회귀 검증

네이티브 계층을 변경할 때는 [PLAN의 M2 체크리스트](PLAN.md#M2-오버레이-패널-스파이크--리스크-게이트-)를
다시 실행한다. 특히 다음은 코드 커버리지로 대체할 수 없다.

- 투명 웹뷰와 전체화면 Space 표시
- 오버레이가 키를 받는 동안 아래 앱의 활성 상태 유지
- 메뉴바 클릭과 통과 모드의 클릭 전달
- 텍스트 편집 중 첫 Esc는 편집을 확정하고, 웹뷰가 멈춘 상태에서도 두 번째 Rust 전역 Esc로 탈출
- 실제 OS 전역 단축키 충돌과 복구
- 모니터 연결·해제, 해상도 변경, 잠자기 복귀

### M11 (타이핑 텍스트 · 홀드 스냅) 추가 항목

1. 그리기 ON → <kbd>T</kbd> → I-beam 커서 → 클릭 → 한글 2벌식으로 조합 입력(조합 중 밑줄·후보창 포함)이 정상 — **M11.3 IME 게이트, 실패 시 PLAN M11의 폴백 사다리**
2. <kbd>Shift+Enter</kbd>로 빈 줄을 포함한 수동 줄바꿈, <kbd>Enter</kbd>·바깥 클릭으로 확정 — 확정 클릭이 새 획을 시작하지 않고 모든 줄이 선택한 고정 크기로 렌더
3. 입력 중 <kbd>⌘Z</kbd> = 입력 전체 취소 / 첫 <kbd>Esc</kbd> = 현재 내용 확정·편집 종료 / 두 번째 <kbd>Esc</kbd> = 그리기 종료
4. 기존 여러 줄 텍스트 더블클릭 — 최상위 마크 선택, 클릭한 줄·글자 근처 캐럿, 원본 캔버스 중복 표시 없음, 위치·색 유지
5. <kbd>T</kbd> → 기존 텍스트 클릭은 편집, 4px 이상 드래그는 실시간 이동 — 놓으면 펜 모드 복귀, <kbd>⌘Z</kbd>/<kbd>⇧⌘Z</kbd>로 위치 복원/재적용
6. 블랙보드 ON 상태에서 1–5 동일 동작
7. 획 홀드 `450ms` — 닫힌 획은 사각형·타원으로 보정되고 열린 획은 시작점이 고정된 직선으로 잠김. 진행 링은 `150ms`부터 표시되고, 잠긴 뒤 포인터 이동은 끝점을 조절하며 <kbd>Shift</kbd>는 방향을 45° 단위로 제한. 홀드 전에 떼면 손으로 그린 화살표를 포함한 자유곡선 유지, 홀드한 열린 획은 화살표 머리 없이 직선으로 잠김, 보정 후 <kbd>⌘Z</kbd> 한 번에 제거
8. 트레이 "텍스트 입력" — 통과 모드에서 클릭 시 그리기+텍스트 모드 진입, 메뉴의 단축키 표기가 설정값 반영(단독 T 표기 확인)
9. 설정 창에 고정 ⌘+/⌘− 행, 온보딩 ③에 크기 변경·더블클릭 재편집 안내가 노출
10. 웹뷰 응답 중에는 첫 Esc로 편집 확정, 웹뷰를 멈춘 뒤에는 다음 Esc로 통과 모드 탈출
