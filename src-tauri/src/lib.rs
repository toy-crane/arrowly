mod overlay;
mod shortcuts;
mod state;
mod tray;

use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(shortcuts::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_nspanel::init())
        .manage(state::SharedState::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            overlay::create(app)?;
            if let Err(e) = shortcuts::register_toggle(app.handle()) {
                // 등록 실패로 앱을 죽이지 않는다 — 트레이(M6) 진입 경로가 생길 때까지는 로그만
                eprintln!("[arrowly] ⌥Tab 전역 등록 실패: {e}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
