//! macOS 로그인 항목 어댑터. App Sandbox에서도 허용되는 SMAppService로
//! 메뉴바의 "로그인 시 실행"을 등록·해제한다. 사용자가 메뉴에서 켤 때만 등록한다.

use crate::login_item_policy::{
    should_open_login_items_settings, toggle_action, LoginItemStatus, ToggleAction,
};

#[cfg(target_os = "macos")]
use objc2_service_management::{SMAppService, SMAppServiceStatus};

#[cfg(target_os = "macos")]
pub fn status() -> LoginItemStatus {
    // SAFETY: mainAppService와 status는 인자 없는 ServiceManagement 조회다.
    let raw = unsafe { SMAppService::mainAppService().status() };
    match raw {
        SMAppServiceStatus::Enabled => LoginItemStatus::Enabled,
        SMAppServiceStatus::RequiresApproval => LoginItemStatus::RequiresApproval,
        SMAppServiceStatus::NotFound => LoginItemStatus::NotFound,
        _ => LoginItemStatus::NotRegistered,
    }
}

#[cfg(not(target_os = "macos"))]
pub fn status() -> LoginItemStatus {
    LoginItemStatus::NotFound
}

/// 현재 상태의 반대로 바꾼다. 등록 뒤 macOS 승인이 필요하면 로그인 항목 설정을 연다.
#[cfg(target_os = "macos")]
pub fn toggle() {
    // SAFETY: 메인 앱 서비스 등록·해제와 설정 열기는 ServiceManagement 공개 API다.
    unsafe {
        let service = SMAppService::mainAppService();
        let result = match toggle_action(status()) {
            ToggleAction::Register => service.registerAndReturnError(),
            ToggleAction::Unregister => service.unregisterAndReturnError(),
        };
        if let Err(e) = result {
            eprintln!(
                "[arrowly] 로그인 항목 설정 실패: {}",
                e.localizedDescription()
            );
        }
        if should_open_login_items_settings(status()) {
            SMAppService::openSystemSettingsLoginItems();
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn toggle() {}
