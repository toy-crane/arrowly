mod overlay;
mod shortcuts;
mod state;
mod tray;

use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_store::StoreExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(shortcuts::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_nspanel::init())
        .manage(state::SharedState::default())
        .invoke_handler(tauri::generate_handler![
            shortcuts::try_register_shortcut,
            shortcuts::apply_shortcuts,
            shortcuts::suspend_toggle,
            shortcuts::resume_toggle,
        ])
        .on_window_event(|window, event| {
            // 유틸 창(온보딩·설정)이 닫히면 Dock 표시를 원상 복구
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let label = window.label().to_string();
                if label == "onboarding" || label == "settings" {
                    overlay::on_util_window_destroyed(window.app_handle(), &label);
                }
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // settings.json의 저장된 단축키를 state에 반영한 뒤 등록
            if let Ok(store) = app.store("settings.json") {
                let sc = store.get("shortcuts");
                let field = |k: &str| {
                    sc.as_ref()
                        .and_then(|v| v.get(k))
                        .and_then(|v| v.as_str())
                        .map(String::from)
                };
                shortcuts::load_from_settings(app.handle(), field("toggle"), field("clear"));
            }

            overlay::create(app)?;
            tray::create(app)?;
            if let Err(e) = shortcuts::register_toggle(app.handle()) {
                // 등록 실패로 앱을 죽이지 않는다 — 트레이 메뉴로 진입 가능
                eprintln!("[arrowly] 그리기 토글 전역 등록 실패: {e}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
