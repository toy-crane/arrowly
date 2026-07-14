//! Rust↔웹뷰 이벤트명의 단일 소스(Rust 측). 웹뷰 측은 src/shared/ipc/events.ts —
//! 두 파일은 반드시 함께 수정한다(lockstep). emit 지점과 tray 구독 리스트가 같은
//! 상수를 참조해, 이름 변경 시 한쪽만 고치는 사고를 원천 차단한다.

pub const MODE_CHANGED: &str = "mode-changed";
pub const BOARD_CHANGED: &str = "board-changed";
pub const CLEAR_ALL: &str = "clear-all";
pub const MARKER_HIDDEN_CHANGED: &str = "marker-hidden-changed";
pub const SHORTCUTS_CHANGED: &str = "shortcuts-changed";
pub const ENTER_TEXT_MODE: &str = "enter-text-mode";
