//! OS 등록과 독립적인 단축키 정책. UI와 전역 단축키 어댑터가 같은 규칙을 공유한다.

use std::str::FromStr;

use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

pub const DEFAULT_TOGGLE: &str = "Alt+Tab";
pub const DEFAULT_BOARD: &str = "Shift+Alt+Tab";
pub const DEFAULT_CLEAR: &str = "Alt+Backspace";
/// 텍스트 키는 전역 미등록 로컬 키(오버레이 keydown)라 수식키 없는 단독 키가 기본이다.
pub const DEFAULT_TEXT: &str = "KeyT";
const BOARD_FALLBACKS: [&str; 4] = [
    DEFAULT_BOARD,
    "Control+Cmd+KeyB",
    "Shift+Control+Cmd+KeyB",
    "Alt+Control+Cmd+KeyB",
];

/// 전역 등록 키(그리기·블랙보드)와 clear의 기존 규칙: 수식키 필수.
pub fn parse_valid(accelerator: &str) -> Result<Shortcut, String> {
    parse_with(accelerator, true)
}

/// 전역 미등록 로컬 키(텍스트)용 규칙: 수식키 면제. Esc·⌘Z 계열은 여전히 거부한다.
pub fn parse_valid_local(accelerator: &str) -> Result<Shortcut, String> {
    parse_with(accelerator, false)
}

fn parse_with(accelerator: &str, require_modifier: bool) -> Result<Shortcut, String> {
    let shortcut =
        Shortcut::from_str(accelerator).map_err(|_| "error:invalid_shortcut".to_string())?;
    validate_shortcut(&shortcut, require_modifier)?;
    Ok(shortcut)
}

fn validate_shortcut(shortcut: &Shortcut, require_modifier: bool) -> Result<(), String> {
    if shortcut.key == Code::Escape {
        return Err("error:reserved_escape".into());
    }
    if require_modifier && shortcut.mods.is_empty() {
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

    #[test]
    fn local_validation_allows_modifierless_keys() {
        for accelerator in [DEFAULT_TEXT, "KeyY", "F6", "Alt+KeyT"] {
            assert!(
                parse_valid_local(accelerator).is_ok(),
                "invalid: {accelerator}"
            );
        }
        // 전역 규칙에서는 단독 키가 여전히 거부된다
        assert_eq!(
            parse_valid(DEFAULT_TEXT).unwrap_err(),
            "error:modifier_required"
        );
    }

    #[test]
    fn local_validation_still_rejects_reserved_keys() {
        assert_eq!(
            parse_valid_local("Escape").unwrap_err(),
            "error:reserved_escape"
        );
        assert_eq!(
            parse_valid_local("Cmd+KeyZ").unwrap_err(),
            "error:reserved_undo"
        );
        assert_eq!(
            parse_valid_local("Shift+Cmd+KeyZ").unwrap_err(),
            "error:reserved_undo"
        );
        assert_eq!(
            parse_valid_local("not a shortcut").unwrap_err(),
            "error:invalid_shortcut"
        );
    }
}
