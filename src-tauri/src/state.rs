use std::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlackboardAction {
    SetBoard(bool),
    EnterDrawing,
}

/// 앱 전역 상태. 상태 전이의 단일 소스는 Rust다.
#[derive(Debug)]
pub struct AppState {
    /// true = 그리기 모드, false = 통과 모드
    pub drawing: bool,
    /// 블랙보드(불투명 검정 배경). 그리기 OFF/ON을 넘나들며 유지되고, 영속화하지 않는다.
    pub board: bool,
    /// 마지막으로 오버레이가 덮은 모니터의 물리 원점. 바뀌면 이전 그림 좌표가 무효다.
    pub last_monitor_pos: Option<(i32, i32)>,
    /// 플로팅 마커 숨김 (트레이 토글, settings.json에 저장)
    pub marker_hidden: bool,
    /// 현재 그리기 토글 전역 단축키 accelerator (재설정 가능)
    pub toggle_accel: String,
    /// 현재 블랙보드 전역 단축키 accelerator (재설정 가능)
    pub board_accel: String,
    /// 현재 전체 지우기 accelerator (웹뷰 처리, 메뉴 라벨 표시용)
    pub clear_accel: String,
    /// 현재 텍스트 입력 accelerator (웹뷰 처리, 전역 미등록, 메뉴 라벨 표시용)
    pub text_accel: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            drawing: false,
            board: false,
            last_monitor_pos: None,
            marker_hidden: false,
            toggle_accel: "Alt+Tab".into(),
            board_accel: "Shift+Alt+Tab".into(),
            clear_accel: "Alt+Backspace".into(),
            text_accel: "KeyT".into(),
        }
    }
}

impl AppState {
    /// 모니터 원점을 갱신하고, 기존 좌표계가 무효가 됐는지 반환한다.
    pub fn update_monitor(&mut self, origin: (i32, i32)) -> bool {
        let changed = self
            .last_monitor_pos
            .is_some_and(|previous| previous != origin);
        self.last_monitor_pos = Some(origin);
        changed
    }

    /// 현재 블랙보드 단축키가 요청해야 할 상태 전이를 계산한다.
    pub fn blackboard_action(&self) -> BlackboardAction {
        if self.drawing {
            BlackboardAction::SetBoard(!self.board)
        } else if self.board {
            BlackboardAction::EnterDrawing
        } else {
            BlackboardAction::SetBoard(true)
        }
    }
}

pub type SharedState = Mutex<AppState>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_safe_and_transient() {
        let state = AppState::default();
        assert!(!state.drawing);
        assert!(!state.board);
        assert!(!state.marker_hidden);
        assert_eq!(state.last_monitor_pos, None);
        assert_eq!(state.toggle_accel, "Alt+Tab");
        assert_eq!(state.board_accel, "Shift+Alt+Tab");
        assert_eq!(state.clear_accel, "Alt+Backspace");
        assert_eq!(state.text_accel, "KeyT");
    }

    #[test]
    fn monitor_change_only_clears_after_a_real_origin_change() {
        let mut state = AppState::default();
        assert!(!state.update_monitor((0, 0)));
        assert!(!state.update_monitor((0, 0)));
        assert!(state.update_monitor((1920, 0)));
        assert_eq!(state.last_monitor_pos, Some((1920, 0)));
    }

    #[test]
    fn blackboard_action_covers_the_complete_state_table() {
        let mut state = AppState::default();
        assert_eq!(state.blackboard_action(), BlackboardAction::SetBoard(true));
        state.board = true;
        assert_eq!(state.blackboard_action(), BlackboardAction::EnterDrawing);
        state.drawing = true;
        assert_eq!(state.blackboard_action(), BlackboardAction::SetBoard(false));
        state.board = false;
        assert_eq!(state.blackboard_action(), BlackboardAction::SetBoard(true));
    }
}
