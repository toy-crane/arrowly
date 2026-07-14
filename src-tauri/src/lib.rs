mod events;
mod hotkey;
mod i18n;
mod overlay;
mod shortcut_policy;
mod shortcuts;
mod state;
mod store;
mod tray;

use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(shortcuts::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_nspanel::init())
        .manage(state::SharedState::default())
        .invoke_handler(tauri::generate_handler![
            shortcuts::try_register_shortcut,
            shortcuts::apply_shortcuts,
            shortcuts::suspend_shortcuts,
            shortcuts::resume_shortcuts,
            overlay::toggle_board,
        ])
        .on_window_event(|window, event| {
            // 유틸 창(온보딩·설정)이 닫히면 Dock 표시를 원상 복구
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let label = window.label().to_string();
                if label == "onboarding" || label == "settings" {
                    // 레코딩·튜토리얼 체험 중 창이 닫혀도 전역 키가 유실되지 않게 복구한다.
                    shortcuts::resume_shortcuts(window.app_handle().clone());
                    overlay::on_util_window_destroyed(window.app_handle(), &label);
                }
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // settings.json의 저장된 단축키를 state에 반영한다. board가 없는 기존
            // 설정은 store 모듈이 충돌하지 않는 기본값으로 마이그레이션한다.
            if let Some(stored) = store::load_shortcuts_with_migration(app.handle()) {
                shortcuts::load_from_settings(app.handle(), stored.toggle, stored.board, stored.clear);
            }

            overlay::create(app)?;
            tray::create(app)?;
            if let Err(e) = shortcuts::register_shortcuts(app.handle()) {
                // 등록 실패로 앱을 죽이지 않는다 — 트레이 메뉴로 진입 가능
                eprintln!("[arrowly] 상시 전역 단축키 등록 실패: {e}");
            }

            // 첫 실행이면 온보딩을 띄운다
            if !store::read_onboarding_done(app.handle()) {
                overlay::open_onboarding(app.handle());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
