//! 전역 단축키: 그리기 토글·블랙보드(상시)와 Esc(그리기 중에만 등록).
//! 전체 지우기는 오버레이 웹뷰 keydown이 처리한다.

use std::str::FromStr;

use tauri::{plugin::TauriPlugin, AppHandle, Emitter, Manager, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::state::SharedState;

pub const DEFAULT_TOGGLE: &str = "Alt+Tab";
pub const DEFAULT_BOARD: &str = "Shift+Alt+Tab";
pub const DEFAULT_CLEAR: &str = "Alt+Backspace";
const BOARD_FALLBACKS: [&str; 4] = [
    DEFAULT_BOARD,
    "Control+Cmd+KeyB",
    "Shift+Control+Cmd+KeyB",
    "Alt+Control+Cmd+KeyB",
];

fn current_toggle(app: &AppHandle) -> Option<Shortcut> {
    let accel = app
        .state::<SharedState>()
        .lock()
        .unwrap()
        .toggle_accel
        .clone();
    Shortcut::from_str(&accel).ok()
}

fn current_board(app: &AppHandle) -> Option<Shortcut> {
    let accel = app
        .state::<SharedState>()
        .lock()
        .unwrap()
        .board_accel
        .clone();
    Shortcut::from_str(&accel).ok()
}

fn escape_shortcut() -> Shortcut {
    Shortcut::new(None, Code::Escape)
}

fn parse_valid(accelerator: &str) -> Result<Shortcut, String> {
    let shortcut =
        Shortcut::from_str(accelerator).map_err(|_| "error:invalid_shortcut".to_string())?;
    validate_shortcut(&shortcut)?;
    Ok(shortcut)
}

fn validate_shortcut(shortcut: &Shortcut) -> Result<(), String> {
    if shortcut.key == Code::Escape {
        return Err("error:reserved_escape".into());
    }
    if shortcut.mods.is_empty() {
        return Err("error:modifier_required".into());
    }
    let command_undo = shortcut.key == Code::KeyZ
        && shortcut.mods.contains(Modifiers::SUPER)
        && !shortcut
            .mods
            .intersects(Modifiers::ALT | Modifiers::CONTROL);
    if command_undo {
        return Err("error:reserved_undo".into());
    }
    Ok(())
}

pub fn init() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let toggled = current_toggle(app).is_some_and(|s| s == *shortcut);
            let boarded = current_board(app).is_some_and(|s| s == *shortcut);
            let escaped = *shortcut == escape_shortcut();
            if !toggled && !boarded && !escaped {
                return;
            }
            // 플러그인 핸들러의 내부 뮤텍스에서 벗어난 뒤 이벤트 루프로 돌아간다.
            let handle = app.clone();
            std::thread::spawn(move || {
                let app = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    if toggled {
                        crate::overlay::toggle(&app);
                    } else if boarded {
                        crate::overlay::activate_or_toggle_board(&app);
                    } else {
                        crate::overlay::set_drawing(&app, false);
                    }
                });
            });
        })
        .build()
}

/// 기동 시 두 상시 전역 단축키를 등록한다. 블랙보드 등록 실패가 그리기 진입까지
/// 막지 않도록 그리기 토글을 우선 보존한다.
pub fn register_shortcuts(app: &AppHandle) -> Result<(), String> {
    let toggle = current_toggle(app).ok_or("invalid toggle shortcut format")?;
    let board = current_board(app).ok_or("invalid blackboard shortcut format")?;
    if toggle == board {
        return Err("toggle and blackboard shortcuts conflict".into());
    }
    let gs = app.global_shortcut();
    gs.register(toggle).map_err(|e| e.to_string())?;
    if let Err(e) = gs.register(board) {
        eprintln!("[arrowly] 블랙보드 전역 등록 실패: {e}");
    }
    Ok(())
}

pub fn register_escape(app: &AppHandle) -> Result<(), tauri_plugin_global_shortcut::Error> {
    app.global_shortcut().register(escape_shortcut())
}

pub fn unregister_escape(app: &AppHandle) {
    let _ = app.global_shortcut().unregister(escape_shortcut());
}

fn unregister_persistent(app: &AppHandle) {
    let gs = app.global_shortcut();
    if let Some(shortcut) = current_toggle(app) {
        let _ = gs.unregister(shortcut);
    }
    if let Some(shortcut) = current_board(app) {
        let _ = gs.unregister(shortcut);
    }
}

fn register_pair(app: &AppHandle, toggle: Shortcut, board: Shortcut) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.register(toggle)
        .map_err(|_| "error:shortcut_in_use".to_string())?;
    if gs.register(board).is_err() {
        let _ = gs.unregister(toggle);
        return Err("error:shortcut_in_use".into());
    }
    Ok(())
}

/// 레코더 검증: 상시 전역 키만 OS 등록 가능 여부를 검사한다.
#[tauri::command]
pub fn try_register_shortcut(
    app: AppHandle,
    id: String,
    accelerator: String,
) -> Result<(), String> {
    let shortcut = parse_valid(&accelerator)?;
    let (current, other) = match id.as_str() {
        "toggle" => (current_toggle(&app), current_board(&app)),
        "board" => (current_board(&app), current_toggle(&app)),
        _ => return Err("error:invalid_shortcut".into()),
    };
    if other.is_some_and(|s| s == shortcut) {
        return Err("error:duplicate_shortcut".into());
    }

    let gs = app.global_shortcut();
    if gs.is_registered(shortcut) {
        return if current.is_some_and(|s| s == shortcut) {
            Ok(())
        } else {
            Err("error:shortcut_in_use".into())
        };
    }
    gs.register(shortcut)
        .map_err(|_| "error:shortcut_in_use".to_string())?;
    let _ = gs.unregister(shortcut);
    Ok(())
}

/// 세 단축키를 하나의 설정으로 적용한다. 새 전역 키 중 하나라도 실패하면
/// 두 기존 전역 키를 복구하고 state/store 갱신은 호출자까지 진행되지 않는다.
#[tauri::command]
pub fn apply_shortcuts(
    app: AppHandle,
    toggle: String,
    board: String,
    clear: String,
) -> Result<(), String> {
    let new_toggle = parse_valid(&toggle)?;
    let new_board = parse_valid(&board)?;
    let new_clear = parse_valid(&clear)?;
    if new_toggle == new_board || new_toggle == new_clear || new_board == new_clear {
        return Err("error:duplicate_shortcut".into());
    }

    let (old_toggle_text, old_board_text) = {
        let state = app.state::<SharedState>();
        let s = state.lock().unwrap();
        (s.toggle_accel.clone(), s.board_accel.clone())
    };
    let old_toggle = Shortcut::from_str(&old_toggle_text).ok();
    let old_board = Shortcut::from_str(&old_board_text).ok();

    unregister_persistent(&app);
    if let Err(error) = register_pair(&app, new_toggle, new_board) {
        if let (Some(old_toggle), Some(old_board)) = (old_toggle, old_board) {
            if let Err(restore_error) = register_pair(&app, old_toggle, old_board) {
                eprintln!("[arrowly] 기존 전역 단축키 복구 실패: {restore_error}");
            }
        }
        return Err(error);
    }

    {
        let state = app.state::<SharedState>();
        let mut s = state.lock().unwrap();
        s.toggle_accel = toggle;
        s.board_accel = board.clone();
        s.clear_accel = clear.clone();
    }
    let _ = app.emit(
        "shortcuts-changed",
        serde_json::json!({ "board": board, "clear": clear }),
    );
    crate::tray::sync(&app);
    Ok(())
}

/// 레코딩·온보딩 체험 중 두 상시 전역 키가 웹뷰 keydown을 가로채지 않게 한다.
#[tauri::command]
pub fn suspend_shortcuts(app: AppHandle) {
    unregister_persistent(&app);
}

/// 레코딩 취소나 유틸리티 창 종료 시 두 상시 전역 키를 멱등 복구한다.
#[tauri::command]
pub fn resume_shortcuts(app: AppHandle) {
    let Some(toggle) = current_toggle(&app) else {
        return;
    };
    let Some(board) = current_board(&app) else {
        return;
    };
    let gs = app.global_shortcut();
    if !gs.is_registered(toggle) {
        if let Err(e) = gs.register(toggle) {
            eprintln!("[arrowly] 그리기 토글 전역 복구 실패: {e}");
        }
    }
    if !gs.is_registered(board) {
        if let Err(e) = gs.register(board) {
            eprintln!("[arrowly] 블랙보드 전역 복구 실패: {e}");
        }
    }
}

/// 기존 설정과 겹치지 않는 블랙보드 초기값을 고른다. 기존 사용자 값이 항상 우선이다.
pub fn migrated_board_default(toggle: &str, clear: &str) -> String {
    BOARD_FALLBACKS
        .iter()
        .find(|candidate| **candidate != toggle && **candidate != clear)
        .unwrap_or(&DEFAULT_BOARD)
        .to_string()
}

/// 기동 시 settings.json의 accelerator를 state에 반영한다.
pub fn load_from_settings(
    app: &AppHandle,
    toggle: Option<String>,
    board: Option<String>,
    clear: Option<String>,
) {
    let state = app.state::<SharedState>();
    let mut s = state.lock().unwrap();
    if let Some(value) = toggle {
        s.toggle_accel = value;
    }
    if let Some(value) = board {
        s.board_accel = value;
    }
    if let Some(value) = clear {
        s.clear_accel = value;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn board_migration_preserves_existing_shortcuts() {
        assert_eq!(
            migrated_board_default(DEFAULT_BOARD, DEFAULT_CLEAR),
            "Control+Cmd+KeyB"
        );
        assert_eq!(
            migrated_board_default(DEFAULT_TOGGLE, DEFAULT_CLEAR),
            DEFAULT_BOARD
        );
        assert_eq!(
            migrated_board_default(DEFAULT_BOARD, "Control+Cmd+KeyB"),
            "Shift+Control+Cmd+KeyB"
        );
        assert_eq!(
            migrated_board_default(DEFAULT_BOARD, "Shift+Control+Cmd+KeyB"),
            "Control+Cmd+KeyB"
        );
    }

    #[test]
    fn validation_rejects_unsafe_shortcuts() {
        assert_eq!(parse_valid("KeyB").unwrap_err(), "error:modifier_required");
        assert_eq!(parse_valid("Cmd+KeyZ").unwrap_err(), "error:reserved_undo");
        assert_eq!(
            parse_valid("Shift+Cmd+KeyZ").unwrap_err(),
            "error:reserved_undo"
        );
        assert_eq!(
            parse_valid("Shift+Escape").unwrap_err(),
            "error:reserved_escape"
        );
    }

    #[test]
    fn default_shortcuts_are_valid() {
        for accelerator in [DEFAULT_TOGGLE, DEFAULT_BOARD, DEFAULT_CLEAR] {
            assert!(parse_valid(accelerator).is_ok(), "invalid default: {accelerator}");
        }
    }
}
