use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Wry,
};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_store::StoreExt;

use crate::state::SharedState;

const TRAY_ID: &str = "main";
const ICON_OFF: &[u8] = include_bytes!("../icons/tray-Template.png");
const ICON_ON: &[u8] = include_bytes!("../icons/tray-on-Template.png");

pub fn create(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();

    // 저장된 markerHidden 복원
    let marker_hidden = load_marker_hidden(handle);
    {
        let state = handle.state::<SharedState>();
        state.lock().unwrap().marker_hidden = marker_hidden;
    }

    let menu = build_menu(handle, false, marker_hidden, autostart_enabled(handle))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(ICON_OFF)?)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle_menu(app, event.id.as_ref()))
        .build(app)?;

    Ok(())
}

/// 상태(그리기·마커·자동 실행)가 바뀔 때마다 메뉴와 아이콘을 다시 그린다.
pub fn sync(app: &AppHandle) {
    let (drawing, marker_hidden) = {
        let state = app.state::<SharedState>();
        let s = state.lock().unwrap();
        (s.drawing, s.marker_hidden)
    };
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Ok(menu) = build_menu(app, drawing, marker_hidden, autostart_enabled(app)) {
        let _ = tray.set_menu(Some(menu));
    }
    let bytes = if drawing { ICON_ON } else { ICON_OFF };
    if let Ok(img) = Image::from_bytes(bytes) {
        let _ = tray.set_icon(Some(img));
        // set_icon이 템플릿 플래그를 리셋할 수 있어 다시 켠다
        let _ = tray.set_icon_as_template(true);
    }
}

fn build_menu(
    app: &AppHandle,
    drawing: bool,
    marker_hidden: bool,
    autostart_on: bool,
) -> tauri::Result<Menu<Wry>> {
    let toggle = MenuItem::with_id(
        app,
        "toggle",
        if drawing { "그리기 중지" } else { "그리기 시작" },
        true,
        Some("Alt+Tab"),
    )?;
    let clear = MenuItem::with_id(app, "clear", "전체 지우기", true, Some("Alt+Backspace"))?;
    let marker = CheckMenuItem::with_id(app, "marker", "마커 숨기기", true, marker_hidden, None::<&str>)?;
    let autostart =
        CheckMenuItem::with_id(app, "autostart", "로그인 시 실행", true, autostart_on, None::<&str>)?;
    let tutorial = MenuItem::with_id(app, "tutorial", "튜토리얼 다시 보기", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Arrowly 종료", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;

    Menu::with_items(app, &[&toggle, &clear, &sep1, &marker, &autostart, &sep2, &tutorial, &quit])
}

fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "toggle" => crate::overlay::toggle(app),
        "clear" => {
            let _ = app.emit("clear-all", ());
        }
        "marker" => toggle_marker_hidden(app),
        "autostart" => toggle_autostart(app),
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
    if let Ok(store) = app.store("settings.json") {
        store.set("markerHidden", serde_json::json!(hidden));
        let _ = store.save();
    }
    let _ = app.emit("marker-hidden-changed", serde_json::json!({ "hidden": hidden }));
    sync(app);
}

fn toggle_autostart(app: &AppHandle) {
    let manager = app.autolaunch();
    let result = if manager.is_enabled().unwrap_or(false) {
        manager.disable()
    } else {
        manager.enable()
    };
    if let Err(e) = result {
        eprintln!("[arrowly] 자동 실행 설정 실패: {e}");
    }
    sync(app);
}

fn autostart_enabled(app: &AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

fn load_marker_hidden(app: &AppHandle) -> bool {
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("markerHidden"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}
