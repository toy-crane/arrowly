use std::sync::Mutex;

/// 모드·획 유무 등 앱 전역 상태. 상태 전이의 단일 소스는 Rust다.
#[derive(Debug, Default)]
pub struct AppState {
    /// true = 그리기 모드, false = 통과 모드
    pub drawing: bool,
    /// 캔버스에 획이 하나 이상 있는지 (⌥⌫ 전역 등록 조건)
    pub strokes_present: bool,
}

pub type SharedState = Mutex<AppState>;
