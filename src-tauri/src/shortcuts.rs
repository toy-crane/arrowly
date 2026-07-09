//! 전역 단축키: ⌥Tab(상시 토글)과 Esc(그리기 중에만 등록되는 탈출구).
//! ⌥⌫ 전체 지우기는 웹뷰 keydown이 처리하므로 전역 등록이 없다.

use tauri::{plugin::TauriPlugin, AppHandle, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn toggle_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::ALT), Code::Tab)
}

fn escape_shortcut() -> Shortcut {
    Shortcut::new(None, Code::Escape)
}

pub fn init() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let toggled = *shortcut == toggle_shortcut();
            let escaped = *shortcut == escape_shortcut();
            if !toggled && !escaped {
                return;
            }
            // 핸들러 안에서 register/unregister가 재진입되지 않도록 다음 틱으로 미룬다
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                if toggled {
                    crate::overlay::toggle(&handle);
                } else {
                    crate::overlay::set_drawing(&handle, false);
                }
            });
        })
        .build()
}

pub fn register_toggle(app: &AppHandle) -> Result<(), tauri_plugin_global_shortcut::Error> {
    app.global_shortcut().register(toggle_shortcut())
}

pub fn register_escape(app: &AppHandle) -> Result<(), tauri_plugin_global_shortcut::Error> {
    app.global_shortcut().register(escape_shortcut())
}

pub fn unregister_escape(app: &AppHandle) {
    let _ = app.global_shortcut().unregister(escape_shortcut());
}
