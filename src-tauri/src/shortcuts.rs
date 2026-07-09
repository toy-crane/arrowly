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
            // 핸들러는 플러그인 내부 뮤텍스를 쥔 채 호출되므로 여기서 register/unregister에
            // 재진입하면 데드락이다. run_on_main_thread는 메인 스레드에서 "인라인" 실행이라
            // 지연 효과가 없어, 별도 스레드를 거쳐 이벤트 루프 큐로 되돌아오게 한다.
            let handle = app.clone();
            std::thread::spawn(move || {
                let app = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    if toggled {
                        crate::overlay::toggle(&app);
                    } else {
                        crate::overlay::set_drawing(&app, false);
                    }
                });
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
