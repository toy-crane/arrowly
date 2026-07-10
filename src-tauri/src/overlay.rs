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

    let board = {
        let state = app.state::<SharedState>();
        let mut s = state.lock().unwrap();
        s.drawing = drawing;
        s.board
    };
    // board 동봉 — 웹뷰가 리로드돼도 다음 모드 전환에서 보드 상태가 재동기화된다
    let _ = app.emit(
        "mode-changed",
        serde_json::json!({ "drawing": drawing, "board": board }),
    );
    crate::tray::sync(app);
}

/// 블랙보드 전이의 단일 소스. 보드를 먼저 켜고 emit한 뒤 그리기에 진입해야
/// 패널이 뜰 때 이미 검정이라 투명 플래시가 없다.
pub fn set_board(app: &AppHandle, on: bool) {
    {
        let state = app.state::<SharedState>();
        let mut s = state.lock().unwrap();
        if s.board == on {
            return;
        }
        s.board = on;
    }
    let _ = app.emit("board-changed", serde_json::json!({ "on": on }));
    crate::tray::sync(app);

    // 통과 모드에서 켜면 그리기 모드로 함께 진입한다. 진입이 거부되면(Esc 등록 실패)
    // 보드를 되돌려 트레이 체크가 유령으로 남지 않게 한다.
    if on && !app.state::<SharedState>().lock().unwrap().drawing {
        set_drawing(app, true);
        if !app.state::<SharedState>().lock().unwrap().drawing {
            app.state::<SharedState>().lock().unwrap().board = false;
            let _ = app.emit("board-changed", serde_json::json!({ "on": false }));
            crate::tray::sync(app);
        }
    }
}

/// 마커 버튼과 트레이 메뉴가 공유하는 블랙보드 토글 경로.
#[tauri::command]
pub fn toggle_board(app: AppHandle) {
    let on = app.state::<SharedState>().lock().unwrap().board;
    set_board(&app, !on);
}

/// 전역 블랙보드 단축키 동작. 통과 모드에서는 숨겨진 board 상태와 무관하게
/// 블랙보드로 진입하고, 그리기 중에는 배경만 토글한다.
pub fn activate_or_toggle_board(app: &AppHandle) {
    let (drawing, board) = {
        let state = app.state::<SharedState>();
        let s = state.lock().unwrap();
        (s.drawing, s.board)
    };
    if drawing {
        set_board(app, !board);
    } else if board {
        set_drawing(app, true);
    } else {
        set_board(app, true);
    }
}

/// Accessory(LSUIElement) 앱은 창을 만들어도 앱이 활성화되지 않아 창이 뒤에 숨는다.
/// 유틸리티 창을 앞으로 가져오려면 NSApplication을 명시적으로 활성화해야 한다.
#[cfg(target_os = "macos")]
fn activate_app() {
    use tauri_nspanel::objc2::MainThreadMarker;
    use tauri_nspanel::objc2_app_kit::NSApplication;
    if let Some(mtm) = MainThreadMarker::new() {
        NSApplication::sharedApplication(mtm).activate();
    }
}

const UTIL_LABELS: [&str; 2] = ["onboarding", "settings"];

/// 유틸 창이 모두 닫히면 Accessory로 복귀 — Dock 아이콘이 다시 사라진다.
pub fn on_util_window_destroyed(app: &AppHandle, closed_label: &str) {
    let any_open = UTIL_LABELS
        .iter()
        .any(|l| *l != closed_label && app.get_webview_window(l).is_some());
    if !any_open {
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    }
}

/// 일반 유틸리티 창(온보딩·설정)을 연다. 이미 있으면 앞으로 가져온다.
/// 창이 열려 있는 동안만 Regular 정책으로 전환해 Dock에 표시한다(메뉴바 유틸 표준 패턴 —
/// 앱 메뉴가 생겨 ⌘W 등 표준 동작이 살아나고, 마지막 창이 닫히면 Accessory로 복귀).
fn open_util_window(app: &AppHandle, label: &str, route: &str, w: f64, h: f64) {
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    #[cfg(target_os = "macos")]
    activate_app();

    if let Some(win) = app.get_webview_window(label) {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(
        app,
        label,
        WebviewUrl::App(format!("index.html{route}").into()),
    )
    .title("Arrowly")
    .inner_size(w, h)
    .resizable(false)
    .center()
    .build();
    match built {
        Ok(win) => {
            let _ = win.show();
            let _ = win.set_focus();
        }
        Err(e) => eprintln!("[arrowly] {label} 창 생성 실패: {e}"),
    }
}

/// 온보딩 창 (M8에서 3단계 튜토리얼 구현)
pub fn open_onboarding(app: &AppHandle) {
    open_util_window(app, "onboarding", "#/onboarding", 640.0, 480.0);
}

/// 단축키 설정 창
pub fn open_settings(app: &AppHandle) {
    open_util_window(app, "settings", "#/settings", 380.0, 400.0);
}

pub fn toggle(app: &AppHandle) {
    let drawing = app.state::<SharedState>().lock().unwrap().drawing;
    set_drawing(app, !drawing);
}
