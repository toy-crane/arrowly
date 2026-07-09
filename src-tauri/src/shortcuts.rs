//! 전역 단축키. M2 스파이크: ⌥Tab 토글만 임시 등록 (Esc·⌥⌫·설정 연동은 M4).

use tauri::{plugin::TauriPlugin, AppHandle, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn toggle_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::ALT), Code::Tab)
}

pub fn init() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() == ShortcutState::Pressed && shortcut == &toggle_shortcut() {
                crate::overlay::toggle(app);
            }
        })
        .build()
}

pub fn register_toggle(app: &AppHandle) -> Result<(), tauri_plugin_global_shortcut::Error> {
    app.global_shortcut().register(toggle_shortcut())
}
