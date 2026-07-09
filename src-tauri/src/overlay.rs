use tauri::{App, AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};

use crate::state::SharedState;

pub const OVERLAY_LABEL: &str = "overlay";

tauri_panel! {
    panel!(OverlayPanel {
        config: {
            can_become_key_window: true,
            is_floating_panel: true
        }
    })
}

/// 오버레이 생성: 투명 웹뷰 창을 NSPanel로 변환.
/// nonactivating 패널이라 키 입력을 받아도 아래 앱의 활성 상태(메뉴바)를 뺏지 않는다.
pub fn create(app: &App) -> tauri::Result<()> {
    let win = WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("index.html".into()))
        .title("Arrowly Overlay")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .visible(false)
        .skip_taskbar(true)
        .focused(false)
        .build()?;

    // M2 스파이크: 주 모니터 전체를 덮는다 (커서 위치 기반 모니터 선택은 M4)
    if let Some(monitor) = win.primary_monitor()? {
        win.set_position(*monitor.position())?;
        win.set_size(*monitor.size())?;
    }

    let panel = win.to_panel::<OverlayPanel>()?;

    // borderless(0) + nonactivatingPanel(1<<7)
    panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());

    // 전체화면 Space 합류 + 모든 Space 표시 + Mission Control 제외 + ⌘Tab 순환 제외
    panel.set_collection_behavior(
        CollectionBehavior::new()
            .can_join_all_spaces()
            .stationary()
            .ignores_cycle()
            .full_screen_auxiliary()
            .into(),
    );

    // 레벨 실험: Floating(4) → ModalPanel(8) → MainMenu-1(23). 통과하는 가장 낮은 레벨 채택.
    panel.set_level(PanelLevel::Floating.value());

    // 키 입력을 받아야 하므로 "필요할 때만 키" 비활성화
    panel.set_becomes_key_only_if_needed(false);

    Ok(())
}

/// 그리기/통과 모드 토글.
/// M2 스파이크: 패널을 숨기지 않고 마우스 이벤트 무시만 전환한다(그림 유지 요구사항과 동일 구조).
pub fn toggle(app: &AppHandle) {
    let drawing = {
        let state = app.state::<SharedState>();
        let mut s = state.lock().unwrap();
        s.drawing = !s.drawing;
        s.drawing
    };

    if let Ok(panel) = app.get_webview_panel(OVERLAY_LABEL) {
        if drawing {
            panel.set_ignores_mouse_events(false);
            // nonactivating이므로 키를 가져도 아래 앱은 활성으로 남는다
            panel.show_and_make_key();
        } else {
            panel.set_ignores_mouse_events(true);
            panel.resign_key_window();
        }
    }

    let _ = app.emit("mode-changed", serde_json::json!({ "drawing": drawing }));
}
