#[cfg(target_os = "macos")]
use std::sync::{Arc, Mutex};

#[cfg(target_os = "macos")]
use core_graphics::access::ScreenCaptureAccess;
#[cfg(target_os = "macos")]
use screencapturekit::{
    cg::CGRect,
    screenshot_manager::{CGImageExt, SCScreenshotManager},
    shareable_content::SCShareableContent,
    stream::{configuration::SCStreamConfiguration, content_filter::SCContentFilter},
};
use tauri::AppHandle;
#[cfg(target_os = "macos")]
use tauri_nspanel::{objc2_foundation::NSString, ManagerExt};

const INVALID_CAPTURE_RECT: &str = "error:invalid_capture_rect";
const INVALID_CAPTURE_OUTPUT: &str = "error:invalid_capture_output";
const PERMISSION_DENIED: &str = "error:screen_capture_permission";
const CAPTURE_UNAVAILABLE: &str = "error:screen_capture_unavailable";
const CAPTURE_FAILED: &str = "error:screen_capture_failed";

#[derive(Debug, Clone, Copy, PartialEq)]
struct CaptureRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl CaptureRect {
    fn try_new(x: f64, y: f64, width: f64, height: f64) -> Result<Self, &'static str> {
        if [x, y, width, height].iter().any(|value| !value.is_finite())
            || width <= 0.0
            || height <= 0.0
        {
            return Err(INVALID_CAPTURE_RECT);
        }
        Ok(Self {
            x,
            y,
            width,
            height,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct CaptureOutput {
    width: u32,
    height: u32,
}

impl CaptureOutput {
    fn try_new(width: u32, height: u32) -> Result<Self, &'static str> {
        if width == 0 || height == 0 || width > 2048 || height > 2048 {
            return Err(INVALID_CAPTURE_OUTPUT);
        }
        Ok(Self { width, height })
    }

    fn byte_len(self) -> usize {
        self.width as usize * self.height as usize * 4
    }
}

#[cfg(target_os = "macos")]
#[derive(Default)]
struct NativeCaptureState {
    display_id: Option<u32>,
    filter: Option<Arc<SCContentFilter>>,
}

#[derive(Default)]
pub struct MagnifierState {
    #[cfg(target_os = "macos")]
    native: Mutex<NativeCaptureState>,
}

#[cfg(target_os = "macos")]
fn overlay_display_id(app: &AppHandle) -> Result<u32, &'static str> {
    let panel = app
        .get_webview_panel(crate::overlay::OVERLAY_LABEL)
        .map_err(|_| CAPTURE_UNAVAILABLE)?;
    let description = panel.as_panel().deviceDescription();
    let key = NSString::from_str("NSScreenNumber");
    let value = description.objectForKey(&key).ok_or(CAPTURE_UNAVAILABLE)?;
    // NSScreenNumber is an NSNumber containing the corresponding CGDirectDisplayID.
    let display_id: u32 = unsafe { tauri_nspanel::objc2::msg_send![&*value, unsignedIntValue] };
    Ok(display_id)
}

#[cfg(target_os = "macos")]
fn build_filter(display_id: u32) -> Result<SCContentFilter, &'static str> {
    let content = SCShareableContent::get().map_err(|_| CAPTURE_UNAVAILABLE)?;
    let displays = content.displays();
    let display = displays
        .iter()
        .find(|display| display.display_id() == display_id)
        .ok_or(CAPTURE_UNAVAILABLE)?;
    let applications = content.applications();
    let current_pid = std::process::id() as i32;
    let excluded: Vec<_> = applications
        .iter()
        .filter(|application| application.process_id() == current_pid)
        .collect();
    if excluded.is_empty() {
        // Capturing without excluding Arrowly would recursively include the lens and marker.
        return Err(CAPTURE_UNAVAILABLE);
    }
    SCContentFilter::create()
        .with_display(display)
        .with_excluding_applications(&excluded, &[])
        .try_build()
        .map_err(|_| CAPTURE_UNAVAILABLE)
}

#[cfg(target_os = "macos")]
fn capture_rgba(
    filter: &SCContentFilter,
    rect: CaptureRect,
    output: CaptureOutput,
) -> Result<Vec<u8>, &'static str> {
    if !ScreenCaptureAccess.preflight() {
        return Err(PERMISSION_DENIED);
    }
    let configuration = SCStreamConfiguration::new()
        .with_width(output.width)
        .with_height(output.height)
        .with_source_rect(CGRect::new(rect.x, rect.y, rect.width, rect.height))
        .with_scales_to_fit(true)
        .with_shows_cursor(false);
    let image =
        SCScreenshotManager::capture_image(filter, &configuration).map_err(|_| CAPTURE_FAILED)?;
    let bytes = image.rgba_data().map_err(|_| CAPTURE_FAILED)?;
    if bytes.len() != output.byte_len() {
        return Err(CAPTURE_FAILED);
    }
    Ok(bytes)
}

/// 권한을 요청하고 캡처 대상 디스플레이를 고정한다. 거부 시 기존 도구를 유지하도록 false를 반환한다.
#[tauri::command]
pub fn request_magnifier_access(
    app: AppHandle,
    state: tauri::State<'_, MagnifierState>,
) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let access = ScreenCaptureAccess;
        if !access.preflight() && !access.request() {
            return Ok(false);
        }
        let display_id = overlay_display_id(&app).map_err(str::to_string)?;
        let mut native = state.native.lock().unwrap();
        native.display_id = Some(display_id);
        native.filter = None;
        Ok(true)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, state);
        Err(CAPTURE_UNAVAILABLE.to_string())
    }
}

/// 렌즈의 CSS 2x와 현재 Retina 배율을 반영한 RGBA 바이트를 raw IPC 응답으로 반환한다.
#[tauri::command]
pub async fn capture_magnifier_frame(
    state: tauri::State<'_, MagnifierState>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    output_width: u32,
    output_height: u32,
) -> Result<tauri::ipc::Response, String> {
    let rect = CaptureRect::try_new(x, y, width, height).map_err(str::to_string)?;
    let output = CaptureOutput::try_new(output_width, output_height).map_err(str::to_string)?;

    #[cfg(target_os = "macos")]
    {
        let (display_id, cached_filter) = {
            let native = state.native.lock().unwrap();
            (native.display_id, native.filter.clone())
        };
        let display_id = display_id.ok_or_else(|| CAPTURE_UNAVAILABLE.to_string())?;
        let filter = match cached_filter {
            Some(filter) => filter,
            None => {
                let filter = Arc::new(build_filter(display_id).map_err(str::to_string)?);
                let mut native = state.native.lock().unwrap();
                if native.display_id == Some(display_id) {
                    native.filter = Some(filter.clone());
                }
                filter
            }
        };
        let result =
            tauri::async_runtime::spawn_blocking(move || capture_rgba(&filter, rect, output)).await;
        match result {
            Ok(Ok(bytes)) => Ok(tauri::ipc::Response::new(bytes)),
            Ok(Err(error)) => {
                state.native.lock().unwrap().filter = None;
                Err(error.to_string())
            }
            Err(_) => Err(CAPTURE_FAILED.to_string()),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (state, rect, output);
        Err(CAPTURE_UNAVAILABLE.to_string())
    }
}

#[tauri::command]
pub fn stop_magnifier_capture(state: tauri::State<'_, MagnifierState>) {
    #[cfg(target_os = "macos")]
    {
        let mut native = state.native.lock().unwrap();
        native.display_id = None;
        native.filter = None;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = state;
}

#[tauri::command]
pub fn open_screen_recording_settings() -> Result<(), String> {
    std::process::Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .spawn()
        .map(|_| ())
        .map_err(|_| "error:open_screen_recording_settings".to_string())
}

#[cfg(test)]
mod tests {
    use super::{CaptureOutput, CaptureRect};
    use tauri::{webview::InvokeRequest, Manager};

    fn request(command: &str, body: serde_json::Value) -> InvokeRequest {
        InvokeRequest {
            cmd: command.into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            url: "tauri://localhost".parse().unwrap(),
            body: tauri::ipc::InvokeBody::Json(body),
            headers: Default::default(),
            invoke_key: tauri::test::INVOKE_KEY.to_string(),
        }
    }

    #[test]
    fn capture_rect_accepts_a_finite_positive_source() {
        let rect = CaptureRect::try_new(12.5, 30.0, 174.0, 88.0).unwrap();
        assert_eq!(
            (rect.x, rect.y, rect.width, rect.height),
            (12.5, 30.0, 174.0, 88.0)
        );
    }

    #[test]
    fn capture_rect_keeps_negative_origins_for_edge_centering() {
        let rect = CaptureRect::try_new(-87.0, -44.0, 174.0, 88.0).unwrap();
        assert_eq!((rect.x, rect.y), (-87.0, -44.0));
    }

    #[test]
    fn capture_rect_rejects_invalid_numbers_and_empty_sizes() {
        assert_eq!(
            CaptureRect::try_new(f64::NAN, 0.0, 1.0, 1.0),
            Err("error:invalid_capture_rect")
        );
        assert_eq!(
            CaptureRect::try_new(0.0, 0.0, 0.0, 1.0),
            Err("error:invalid_capture_rect")
        );
        assert_eq!(
            CaptureRect::try_new(0.0, 0.0, 1.0, -1.0),
            Err("error:invalid_capture_rect")
        );
    }

    #[test]
    fn capture_output_accepts_retina_size_and_rejects_unbounded_allocations() {
        assert_eq!(
            CaptureOutput::try_new(696, 352).unwrap().byte_len(),
            979_968
        );
        assert_eq!(
            CaptureOutput::try_new(0, 176),
            Err("error:invalid_capture_output")
        );
        assert_eq!(
            CaptureOutput::try_new(10_000, 10_000),
            Err("error:invalid_capture_output")
        );
    }

    #[test]
    fn mock_runtime_validates_capture_ipc_and_stops_the_native_session() {
        let app = tauri::test::mock_builder()
            .manage(super::MagnifierState::default())
            .invoke_handler(tauri::generate_handler![
                super::capture_magnifier_frame,
                super::stop_magnifier_capture
            ])
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();

        tauri::test::assert_ipc_response(
            &webview,
            request(
                "capture_magnifier_frame",
                serde_json::json!({
                    "x": 0,
                    "y": 0,
                    "width": 0,
                    "height": 88,
                    "outputWidth": 348,
                    "outputHeight": 176
                }),
            ),
            Err("error:invalid_capture_rect"),
        );
        tauri::test::assert_ipc_response(
            &webview,
            request(
                "capture_magnifier_frame",
                serde_json::json!({
                    "x": 0,
                    "y": 0,
                    "width": 174,
                    "height": 88,
                    "outputWidth": 0,
                    "outputHeight": 176
                }),
            ),
            Err("error:invalid_capture_output"),
        );

        app.state::<super::MagnifierState>()
            .native
            .lock()
            .unwrap()
            .display_id = Some(42);
        tauri::test::assert_ipc_response(
            &webview,
            request("stop_magnifier_capture", serde_json::json!({})),
            Ok(()),
        );
        assert_eq!(
            app.state::<super::MagnifierState>()
                .native
                .lock()
                .unwrap()
                .display_id,
            None
        );
    }
}
