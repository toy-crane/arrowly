//! settings.json 스키마의 단일 소스(Rust 측). 파일명·키 문자열은 이 모듈에만 존재한다.
//! 웹뷰 측 스키마는 `src/shared/settings.ts` — 두 파일은 반드시 함께 수정한다(lockstep).

use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

pub const SETTINGS_FILE: &str = "settings.json";
pub const KEY_SHORTCUTS: &str = "shortcuts";
pub const KEY_MARKER_HIDDEN: &str = "markerHidden";
pub const KEY_ONBOARDING_DONE: &str = "onboardingDone";
// 웹뷰가 소유하는 도구 기본값이지만 settings.json 스키마 lockstep을 위해 Rust에도 선언한다.
#[allow(dead_code)]
pub const KEY_TEXT_SIZE: &str = "textSize";

/// settings.json의 shortcuts 객체 (없는 필드는 None — 기본값 해석은 호출자 몫).
pub struct StoredShortcuts {
    pub toggle: Option<String>,
    pub board: Option<String>,
    pub clear: Option<String>,
    /// 없으면 AppState 기본값(KeyT) 유지 — 웹뷰 merge와 동일 규칙
    pub text: Option<String>,
}

/// shortcuts를 읽되, board가 없는 기존 설정과 삭제 도구 E를 텍스트에 할당한
/// 기존 설정을 안전한 기본값으로 마이그레이션해 저장까지 마친다.
pub fn load_shortcuts_with_migration(app: &AppHandle) -> Option<StoredShortcuts> {
    let store = app.store(SETTINGS_FILE).ok()?;
    let mut values = store
        .get(KEY_SHORTCUTS)
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    let field = |k: &str| values.get(k).and_then(|v| v.as_str()).map(String::from);
    let toggle = field("toggle");
    let clear = field("clear");
    let stored_text = field("text");
    let stored_board = field("board");
    let text = crate::shortcut_policy::migrated_text_shortcut(stored_text.as_deref());
    let mut changed = text != stored_text;
    if changed {
        values.insert("text".into(), serde_json::json!(text));
    }
    let board = if let Some(board) = stored_board {
        Some(board)
    } else {
        let migrated = crate::shortcut_policy::migrated_board_default(
            toggle
                .as_deref()
                .unwrap_or(crate::shortcut_policy::DEFAULT_TOGGLE),
            clear
                .as_deref()
                .unwrap_or(crate::shortcut_policy::DEFAULT_CLEAR),
        );
        values.insert("board".into(), serde_json::json!(migrated));
        changed = true;
        Some(migrated)
    };
    if changed {
        store.set(KEY_SHORTCUTS, serde_json::Value::Object(values));
        let _ = store.save();
    }
    Some(StoredShortcuts {
        toggle,
        board,
        clear,
        text,
    })
}

pub fn read_marker_hidden(app: &AppHandle) -> bool {
    app.store(SETTINGS_FILE)
        .ok()
        .and_then(|s| s.get(KEY_MARKER_HIDDEN))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub fn write_marker_hidden(app: &AppHandle, hidden: bool) {
    if let Ok(store) = app.store(SETTINGS_FILE) {
        store.set(KEY_MARKER_HIDDEN, serde_json::json!(hidden));
        let _ = store.save();
    }
}

pub fn read_onboarding_done(app: &AppHandle) -> bool {
    app.store(SETTINGS_FILE)
        .ok()
        .and_then(|s| s.get(KEY_ONBOARDING_DONE))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}
