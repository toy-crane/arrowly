//! OS 등록과 독립적인 단축키 정책. UI와 전역 단축키 어댑터가 같은 규칙을 공유한다.

use std::str::FromStr;

use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

pub const DEFAULT_TOGGLE: &str = "Alt+Tab";
pub const DEFAULT_BOARD: &str = "Shift+Alt+Tab";
pub const DEFAULT_CLEAR: &str = "Alt+Backspace";
const BOARD_FALLBACKS: [&str; 4] = [
    DEFAULT_BOARD,
    "Control+Cmd+KeyB",
    "Shift+Control+Cmd+KeyB",
    "Alt+Control+Cmd+KeyB",
];

pub fn parse_valid(accelerator: &str) -> Result<Shortcut, String> {
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

/// 기존 설정과 겹치지 않는 블랙보드 초기값을 고른다. 기존 사용자 값이 항상 우선이다.
pub fn migrated_board_default(toggle: &str, clear: &str) -> String {
    BOARD_FALLBACKS
        .iter()
        .find(|candidate| **candidate != toggle && **candidate != clear)
        .unwrap_or(&DEFAULT_BOARD)
        .to_string()
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
    fn validation_rejects_invalid_and_unsafe_shortcuts() {
        assert_eq!(
            parse_valid("not a shortcut").unwrap_err(),
            "error:invalid_shortcut"
        );
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
    fn validation_accepts_defaults_and_non_reserved_modified_z() {
        for accelerator in [
            DEFAULT_TOGGLE,
            DEFAULT_BOARD,
            DEFAULT_CLEAR,
            "Alt+Cmd+KeyZ",
            "Control+Cmd+KeyZ",
        ] {
            assert!(parse_valid(accelerator).is_ok(), "invalid: {accelerator}");
        }
    }
}
