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
- Catmull-Rom 기반 곡선 보간과 짧은 polyline
- Retina canvas backing, coalesced pointer input, 모드·전체 지우기 이벤트
- 단축키 생성·매칭·표시, 예약 키·중복·OS 충돌과 등록 복구
- 색·굵기·마커 위치·온보딩·단축키 설정 영속화
- 마커 팝오버, 선택, 바깥 클릭, 드래그 임계값과 화면 경계 clamp
- 오버레이의 그리기·블랙보드·마커·단축키 이벤트 동기화
- 온보딩 단계 잠금, 이전/다음 이동, 완료 저장과 창 닫기
- Rust 단축키 정책, 기존 설정 마이그레이션, 모니터 변경, 블랙보드 상태표
- Tauri MockRuntime을 통한 IPC 성공·오류 응답

## macOS 네이티브 회귀 검증

네이티브 계층을 변경할 때는 [PLAN의 M2 체크리스트](PLAN.md#M2-오버레이-패널-스파이크--리스크-게이트-)를
다시 실행한다. 특히 다음은 코드 커버리지로 대체할 수 없다.

- 투명 웹뷰와 전체화면 Space 표시
- 오버레이가 키를 받는 동안 아래 앱의 활성 상태 유지
- 메뉴바 클릭과 통과 모드의 클릭 전달
- 웹뷰가 멈춘 상태에서도 Rust 전역 Esc로 탈출
- 실제 OS 전역 단축키 충돌과 복구
- 모니터 연결·해제, 해상도 변경, 잠자기 복귀
