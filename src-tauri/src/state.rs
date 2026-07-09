use std::sync::Mutex;

/// 앱 전역 상태. 상태 전이의 단일 소스는 Rust다.
#[derive(Debug, Default)]
pub struct AppState {
    /// true = 그리기 모드, false = 통과 모드
    pub drawing: bool,
    /// 마지막으로 오버레이가 덮은 모니터의 물리 원점. 바뀌면 이전 그림 좌표가 무효다.
    pub last_monitor_pos: Option<(i32, i32)>,
}

pub type SharedState = Mutex<AppState>;
