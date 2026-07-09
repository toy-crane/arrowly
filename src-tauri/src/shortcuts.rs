//! 전역 단축키: 그리기 토글(상시)과 Esc(그리기 중에만 등록되는 탈출구).
//! 전체 지우기(⌥⌫)는 웹뷰 keydown이 처리하므로 전역 등록이 없다.
//! 토글 accelerator는 재설정 가능하며 현재 값은 state에 있다.

use std::str::FromStr;

use tauri::{plugin::TauriPlugin, AppHandle, Emitter, Manager, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

use crate::state::SharedState;

fn current_toggle(app: &AppHandle) -> Option<Shortcut> {
    let accel = app.state::<SharedState>().lock().unwrap().toggle_accel.clone();
    Shortcut::from_str(&accel).ok()
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
            let toggled = current_toggle(app).is_some_and(|s| s == *shortcut);
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

/// 현재 state의 토글 accelerator를 전역 등록.
pub fn register_toggle(app: &AppHandle) -> Result<(), String> {
    let shortcut = current_toggle(app).ok_or("잘못된 단축키 형식")?;
    app.global_shortcut().register(shortcut).map_err(|e| e.to_string())
}

pub fn register_escape(app: &AppHandle) -> Result<(), tauri_plugin_global_shortcut::Error> {
    app.global_shortcut().register(escape_shortcut())
}

pub fn unregister_escape(app: &AppHandle) {
    let _ = app.global_shortcut().unregister(escape_shortcut());
}

/// Esc는 항상 예약 키 — 재설정 대상에서 제외한다.
fn is_reserved(shortcut: &Shortcut) -> bool {
    shortcut.mods.is_empty() && shortcut.key == Code::Escape
}

/// 레코더 검증: accelerator를 임시 등록해보고 즉시 해제. 충돌 시 에러 메시지.
#[tauri::command]
pub fn try_register_shortcut(app: AppHandle, accelerator: String) -> Result<(), String> {
    let shortcut = Shortcut::from_str(&accelerator).map_err(|_| "인식할 수 없는 조합".to_string())?;
    if is_reserved(&shortcut) {
        return Err("Esc는 예약된 키예요".into());
    }
    let gs = app.global_shortcut();
    if gs.is_registered(shortcut) {
        // 이미 우리가(현재 토글로) 쓰고 있으면 통과, 아니면 다른 앱과 충돌
        let ours = current_toggle(&app).is_some_and(|s| s == shortcut);
        return if ours { Ok(()) } else { Err("이 조합은 다른 곳에서 사용 중이에요".into()) };
    }
    gs.register(shortcut).map_err(|_| "이 조합은 다른 곳에서 사용 중이에요".to_string())?;
    let _ = gs.unregister(shortcut);
    Ok(())
}

/// 새 단축키 적용: 토글을 (항상) 재등록하고 전체 지우기 라벨을 저장한다.
/// 레코딩 중 suspend된 상태에서도 호출되므로, 결과적으로 항상 토글이 등록되게 한다.
#[tauri::command]
pub fn apply_shortcuts(app: AppHandle, toggle: String, clear: String) -> Result<(), String> {
    let new_toggle = Shortcut::from_str(&toggle).map_err(|_| "인식할 수 없는 조합".to_string())?;
    if is_reserved(&new_toggle) {
        return Err("Esc는 예약된 키예요".into());
    }

    let gs = app.global_shortcut();
    let old = current_toggle(&app);
    if let Some(old) = old {
        let _ = gs.unregister(old);
    }
    if gs.is_registered(new_toggle) {
        let _ = gs.unregister(new_toggle);
    }
    if gs.register(new_toggle).is_err() {
        // 실패 시 이전 토글을 복구해 그리기 진입 경로를 살린다
        if let Some(old) = old {
            let _ = gs.register(old);
        }
        return Err("이 조합은 다른 곳에서 사용 중이에요".into());
    }

    {
        let state = app.state::<SharedState>();
        let mut s = state.lock().unwrap();
        s.toggle_accel = toggle;
        s.clear_accel = clear.clone();
    }
    // 전체 지우기는 오버레이 웹뷰가 keydown으로 처리하므로 새 accelerator를 알린다
    let _ = app.emit("shortcuts-changed", serde_json::json!({ "clear": clear }));
    crate::tray::sync(&app);
    Ok(())
}

/// 레코딩 중 토글을 임시 해제 — 등록된 전역 단축키는 OS가 가로채 웹뷰가 keydown을 못 받는다.
#[tauri::command]
pub fn suspend_toggle(app: AppHandle) {
    if let Some(s) = current_toggle(&app) {
        let _ = app.global_shortcut().unregister(s);
    }
}

/// 레코딩 취소 시 현재 토글을 다시 등록.
#[tauri::command]
pub fn resume_toggle(app: AppHandle) {
    if let Some(s) = current_toggle(&app) {
        let gs = app.global_shortcut();
        if !gs.is_registered(s) {
            let _ = gs.register(s);
        }
    }
}

/// 기동 시 settings.json에서 저장된 accelerator를 state에 반영.
pub fn load_from_settings(app: &AppHandle, toggle: Option<String>, clear: Option<String>) {
    let state = app.state::<SharedState>();
    let mut s = state.lock().unwrap();
    if let Some(t) = toggle {
        s.toggle_accel = t;
    }
    if let Some(c) = clear {
        s.clear_accel = c;
    }
}
