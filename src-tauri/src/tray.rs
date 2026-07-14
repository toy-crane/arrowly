use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Listener, Manager, Wry,
};
use tauri_plugin_autostart::ManagerExt as _;

use crate::state::SharedState;

const TRAY_ID: &str = "main";
// 아이콘은 상태와 무관하게 고정 — 그리기 상태는 플로팅 마커가 표시한다
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray-Template.png");

pub fn create(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();

    // 저장된 markerHidden 복원
    let marker_hidden = crate::store::read_marker_hidden(handle);
    {
        let state = handle.state::<SharedState>();
        state.lock().unwrap().marker_hidden = marker_hidden;
    }

    let menu = build_menu(
        handle,
        false,
        false,
        marker_hidden,
        autostart_enabled(handle),
    )?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(TRAY_ICON)?)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle_menu(app, event.id.as_ref()))
        .build(app)?;

    // 상태 전이 이벤트를 구독해 메뉴를 재구성한다 — overlay/shortcuts는 tray를 모른다.
    // 리스너 콜백은 메인 스레드 밖에서 올 수 있어 메뉴 조작은 main thread로 넘긴다.
    // 불변식: sync는 이벤트 페이로드가 아닌 SharedState 현재값을 읽는다. 그래서 비동기
    // 갱신이라도 연쇄 전이(board→drawing)의 마지막 리스너가 최종 상태로 수렴한다.
    for event in [
        crate::events::MODE_CHANGED,
        crate::events::BOARD_CHANGED,
        crate::events::SHORTCUTS_CHANGED,
    ] {
        let handle = handle.clone();
        app.listen(event, move |_| {
            let app = handle.clone();
            let _ = handle.run_on_main_thread(move || sync(&app));
        });
    }

    Ok(())
}

/// 상태(그리기·블랙보드·마커·단축키·자동 실행)가 바뀔 때마다 메뉴를 다시 그린다.
/// 아이콘은 고정이라 건드리지 않는다.
fn sync(app: &AppHandle) {
    let (drawing, board, marker_hidden) = {
        let state = app.state::<SharedState>();
        let s = state.lock().unwrap();
        (s.drawing, s.board, s.marker_hidden)
    };
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Ok(menu) = build_menu(app, drawing, board, marker_hidden, autostart_enabled(app)) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn build_menu(
    app: &AppHandle,
    drawing: bool,
    board: bool,
    marker_hidden: bool,
    autostart_on: bool,
) -> tauri::Result<Menu<Wry>> {
    let (toggle_accel, board_accel, clear_accel) = {
        let state = app.state::<SharedState>();
        let s = state.lock().unwrap();
        (
            s.toggle_accel.clone(),
            s.board_accel.clone(),
            s.clear_accel.clone(),
        )
    };
    let tr = crate::i18n::tray();
    let toggle = MenuItem::with_id(
        app,
        "toggle",
        if drawing {
            tr.stop_drawing
        } else {
            tr.start_drawing
        },
        true,
        Some(toggle_accel.as_str()),
    )?;
    let board_item = CheckMenuItem::with_id(
        app,
        "board",
        tr.blackboard,
        true,
        board,
        Some(board_accel.as_str()),
    )?;
    let clear = MenuItem::with_id(app, "clear", tr.clear_all, true, Some(clear_accel.as_str()))?;
    let marker = CheckMenuItem::with_id(
        app,
        "marker",
        tr.hide_marker,
        true,
        marker_hidden,
        None::<&str>,
    )?;
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        tr.launch_at_login,
        true,
        autostart_on,
        None::<&str>,
    )?;
    let shortcuts = MenuItem::with_id(app, "shortcuts", tr.shortcut_settings, true, None::<&str>)?;
    let tutorial = MenuItem::with_id(app, "tutorial", tr.replay_tutorial, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", tr.quit, true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;

    Menu::with_items(
        app,
        &[
            &toggle,
            &board_item,
            &clear,
            &sep1,
            &marker,
            &autostart,
            &shortcuts,
            &sep2,
            &tutorial,
            &quit,
        ],
    )
}

fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "toggle" => crate::overlay::toggle(app),
        "board" => crate::overlay::toggle_board(app.clone()),
        "clear" => {
            let _ = app.emit(crate::events::CLEAR_ALL, ());
        }
        "marker" => toggle_marker_hidden(app),
        "autostart" => toggle_autostart(app),
        "shortcuts" => crate::overlay::open_settings(app),
        "tutorial" => crate::overlay::open_onboarding(app),
        "quit" => app.exit(0),
        _ => {}
    }
}

fn toggle_marker_hidden(app: &AppHandle) {
    let hidden = {
        let state = app.state::<SharedState>();
        let mut s = state.lock().unwrap();
        s.marker_hidden = !s.marker_hidden;
        s.marker_hidden
    };
    crate::store::write_marker_hidden(app, hidden);
    let _ = app.emit(
        crate::events::MARKER_HIDDEN_CHANGED,
        serde_json::json!({ "hidden": hidden }),
    );
    sync(app);
}

fn toggle_autostart(app: &AppHandle) {
    set_autostart(app, !autostart_enabled(app));
    sync(app);
}

fn set_autostart(app: &AppHandle, enabled: bool) {
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    if let Err(e) = result {
        eprintln!("[arrowly] 자동 실행 설정 실패: {e}");
    }
}

fn autostart_enabled(app: &AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}
