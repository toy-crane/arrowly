use tauri::{App, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const OVERLAY_LABEL: &str = "overlay";

/// 오버레이 웹뷰 창 생성. M2에서 NSPanel 변환·모드 전환이 붙는다.
pub fn create(app: &App) -> tauri::Result<WebviewWindow> {
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
    Ok(win)
}
