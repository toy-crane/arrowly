use std::sync::Mutex;

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
    /// 현재 전체 지우기 accelerator (웹뷰 처리, 메뉴 라벨 표시용)
    pub clear_accel: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            drawing: false,
            board: false,
            last_monitor_pos: None,
            marker_hidden: false,
            toggle_accel: "Alt+Tab".into(),
            clear_accel: "Alt+Backspace".into(),
        }
    }
}

pub type SharedState = Mutex<AppState>;
