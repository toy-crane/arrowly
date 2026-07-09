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

    // 초기 프레임은 주 모니터. 그리기 ON 때마다 커서 모니터로 다시 잡는다.
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

    // M2 판정: Floating(4)으로 전체화면 표시·메뉴바 클릭 모두 통과 (상향 불필요)
    panel.set_level(PanelLevel::Floating.value());

    // 키 입력을 받아야 하므로 "필요할 때만 키" 비활성화
    panel.set_becomes_key_only_if_needed(false);

    Ok(())
}

/// 그리기 ON 시퀀스: 커서가 있는 모니터로 프레임 → Esc 등록 → 표시.
/// Esc 등록 실패 시 진입하지 않는다(탈출구 없는 진입 금지). 성공 여부를 반환.
fn enter_drawing(app: &AppHandle) -> bool {
    let Some(win) = app.get_webview_window(OVERLAY_LABEL) else {
        return false;
    };

    // 커서가 있는 모니터를 덮는다. 모니터가 바뀌었으면 이전 그림 좌표가 무효라 비운다.
    if let Ok(cursor) = app.cursor_position() {
        if let Ok(monitors) = win.available_monitors() {
            let target = monitors.iter().find(|m| {
                let p = m.position();
                let s = m.size();
                cursor.x >= p.x as f64
                    && cursor.x < (p.x + s.width as i32) as f64
                    && cursor.y >= p.y as f64
                    && cursor.y < (p.y + s.height as i32) as f64
            });
            if let Some(m) = target {
                let origin = (m.position().x, m.position().y);
                let state = app.state::<SharedState>();
                let monitor_changed = {
                    let mut s = state.lock().unwrap();
                    let changed = s.last_monitor_pos.is_some_and(|prev| prev != origin);
                    s.last_monitor_pos = Some(origin);
                    changed
                };
                let _ = win.set_position(*m.position());
                let _ = win.set_size(*m.size());
                if monitor_changed {
                    let _ = app.emit("clear-all", ());
                }
            }
        }
    }

    if let Err(e) = crate::shortcuts::register_escape(app) {
        eprintln!("[arrowly] Esc 전역 등록 실패 — 그리기 진입 중단: {e}");
        return false;
    }

    if let Ok(panel) = app.get_webview_panel(OVERLAY_LABEL) {
        panel.set_ignores_mouse_events(false);
        // nonactivating이므로 키를 가져도 아래 앱은 활성으로 남는다
        panel.show_and_make_key();
    }
    true
}

/// 통과 모드 시퀀스: Esc 해제 → 이벤트 무시 → 숨김. 그림 버퍼는 웹뷰가 유지한다(숨김≠삭제).
fn exit_drawing(app: &AppHandle) {
    crate::shortcuts::unregister_escape(app);
    if let Ok(panel) = app.get_webview_panel(OVERLAY_LABEL) {
        panel.set_ignores_mouse_events(true);
        panel.resign_key_window();
        panel.hide();
    }
}

/// 모드 전이의 단일 소스. 전이에 성공했을 때만 상태를 바꾸고 mode-changed를 emit한다.
pub fn set_drawing(app: &AppHandle, drawing: bool) {
    {
        let state = app.state::<SharedState>();
        let s = state.lock().unwrap();
        if s.drawing == drawing {
            return;
        }
    }

    let ok = if drawing {
        enter_drawing(app)
    } else {
        exit_drawing(app);
        true
    };
    if !ok {
        return;
    }

    app.state::<SharedState>().lock().unwrap().drawing = drawing;
    let _ = app.emit("mode-changed", serde_json::json!({ "drawing": drawing }));
}

pub fn toggle(app: &AppHandle) {
    let drawing = app.state::<SharedState>().lock().unwrap().drawing;
    set_drawing(app, !drawing);
}
