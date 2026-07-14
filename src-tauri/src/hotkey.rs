//! 전역 키 등록 primitive. 도메인 로직 없이 OS 등록/해제만 담당하는 leaf 모듈.
//! Esc를 언제 등록/해제할지는 overlay(core)가, 눌림 인식·디스패치는 shortcuts(adapter)가
//! 결정한다 — 이 모듈은 둘이 공유하는 OS 조작만 소유한다(overlay↔shortcuts 순환 절단 목적).

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut};

/// Esc는 예약 탈출구 — 그리기 중에만 등록되는 transient 키.
pub fn escape_shortcut() -> Shortcut {
    Shortcut::new(None, Code::Escape)
}

pub fn register_escape(app: &AppHandle) -> Result<(), tauri_plugin_global_shortcut::Error> {
    app.global_shortcut().register(escape_shortcut())
}

pub fn unregister_escape(app: &AppHandle) {
    let _ = app.global_shortcut().unregister(escape_shortcut());
}
