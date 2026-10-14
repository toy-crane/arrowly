//! 메뉴바 "로그인 시 실행" 항목의 런타임 독립 정책.
//! macOS 로그인 항목 상태를 메뉴 체크와 토글 동작으로 바꾼다.

/// macOS가 보고하는 앱 로그인 항목 상태.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoginItemStatus {
    NotRegistered,
    Enabled,
    RequiresApproval,
    NotFound,
}

/// 메뉴 항목을 눌렀을 때 할 일.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToggleAction {
    Register,
    Unregister,
}

/// 승인 대기도 사용자가 켠 상태라 체크로 보여 준다.
pub fn is_checked(status: LoginItemStatus) -> bool {
    matches!(
        status,
        LoginItemStatus::Enabled | LoginItemStatus::RequiresApproval
    )
}

/// 등록 직후 macOS 승인이 필요하면 시스템 설정의 로그인 항목을 연다.
pub fn should_open_login_items_settings(status_after_register: LoginItemStatus) -> bool {
    status_after_register == LoginItemStatus::RequiresApproval
}

pub fn toggle_action(status: LoginItemStatus) -> ToggleAction {
    if is_checked(status) {
        ToggleAction::Unregister
    } else {
        ToggleAction::Register
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_install_shows_login_item_unchecked() {
        assert!(!is_checked(LoginItemStatus::NotRegistered));
    }

    #[test]
    fn toggling_unregistered_login_item_registers_it() {
        assert_eq!(
            toggle_action(LoginItemStatus::NotRegistered),
            ToggleAction::Register
        );
    }

    #[test]
    fn enabled_login_item_is_checked_and_toggles_off() {
        assert!(is_checked(LoginItemStatus::Enabled));
        assert_eq!(
            toggle_action(LoginItemStatus::Enabled),
            ToggleAction::Unregister
        );
    }

    #[test]
    fn login_item_awaiting_approval_stays_checked_and_can_be_turned_off() {
        assert!(is_checked(LoginItemStatus::RequiresApproval));
        assert_eq!(
            toggle_action(LoginItemStatus::RequiresApproval),
            ToggleAction::Unregister
        );
    }

    #[test]
    fn only_awaiting_approval_after_registering_opens_login_items_settings() {
        assert!(should_open_login_items_settings(
            LoginItemStatus::RequiresApproval
        ));
        assert!(!should_open_login_items_settings(LoginItemStatus::Enabled));
        assert!(!should_open_login_items_settings(LoginItemStatus::NotFound));
    }

    #[test]
    fn missing_app_service_shows_unchecked() {
        assert!(!is_checked(LoginItemStatus::NotFound));
    }
}
