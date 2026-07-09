use std::sync::Mutex;

/// 앱 전역 상태. 상태 전이의 단일 소스는 Rust다.
#[derive(Debug, Default)]
pub struct AppState {
    /// true = 그리기 모드, false = 통과 모드
    pub drawing: bool,
}

pub type SharedState = Mutex<AppState>;
