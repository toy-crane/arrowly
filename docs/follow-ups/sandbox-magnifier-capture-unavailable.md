# App Store 샌드박스 빌드에서 확대 도구가 화면을 읽지 못한다

**Symptom**: TestFlight로 설치한 App Store 빌드 1.0.0 (202610141301, `com.oddcorp.arrowly`, 샌드박스)에서 화면 기록 권한을 켜고 재시작한 뒤 확대 도구를 켜면 렌즈가 화면을 보여 주지 않고 "Magnifier stopped / Arrowly can no longer read this screen" 안내가 뜬다. [판매 스펙](../specs/paid-distribution/spec.md)의 샌드박스 인수 조건 "재시작 뒤 확대 렌즈가 현재 화면을 보여 준다"를 만족하지 못한다. 확대 도구는 v0.4.0(Developer ID, 샌드박스 없음)과 함께 출시되어 그 빌드에서는 동작했다.

**Observed evidence**: 2026-10-15, macOS 개발자 Mac, `/usr/bin/log show`로 확인.
- 12:46:29 tccd가 `kTCCServiceScreenCapture`의 `com.oddcorp.arrowly` 항목 변경을 기록했고, 재시작한 프로세스(pid 93619)의 12:46:40 화면 기록 사전 확인 결과는 `authValue=2`(허용)였다. 권한 거부가 아니다.
- 같은 시간대에 Arrowly의 샌드박스 거부는 `com.apple.Safari.SafeBrowsing.Service` mach-lookup, `AppleNVMeEANUC` iokit 등 캡처와 무관한 것뿐이었다.
- `open --stderr <file> -a /Applications/Arrowly.app`로 재실행(pid 94456, fd 2가 파일을 가리키는 것을 `lsof`로 확인)한 뒤 오류를 재현했지만 stderr는 비어 있었다. `capture_rgba`의 `eprintln!` 분기(`SCScreenshotManager::capture_image` 실패, RGBA 변환 실패)는 실행되지 않았다.
- 40분 동안 어떤 Arrowly 프로세스의 로그에도 replayd·ScreenCaptureKit 연결 기록이 없었다. 크레이트가 그 이름으로 로그를 남기지 않을 수 있어 확정 근거로 보지 않는다.
- 안내 문구 `magnifier.captureBody`는 `error:screen_capture_permission`과 `error:screen_capture_app_not_shareable`을 제외한 모든 실패(`error:screen_capture_unavailable`, `error:screen_capture_failed`, 문자열이 아닌 IPC 실패)에서 나온다.

**Suspected cause**: 로그가 없는 경로 중 하나로 추정한다. `src-tauri/src/magnifier.rs`의 `CAPTURE_UNAVAILABLE` 반환 지점(`overlay_display_id`, `SCShareableContent::get`, 표시 장치 ID 불일치, `SCContentFilter` 생성 실패) 또는 원시 바이트 `tauri::ipc::Response` 응답이 샌드박스 웹뷰에서 문자열이 아닌 오류로 실패하는 경우다. 아직 어느 것인지 구분하지 못했다.

**What was tried**: 권한 항목 재설정, 앱 재시작, 옛 빌드와 남은 LaunchAgent 정리. 권한은 허용 상태가 되었지만 증상은 그대로다. 소스와 entitlements는 바꾸지 않았다.

**Proposed next step**: `CAPTURE_UNAVAILABLE`의 각 반환 지점에 서로 다른 오류 코드나 `eprintln!`을 붙이고, `bash scripts/appstore.sh sandbox-run`으로 만든 샌드박스 앱을 터미널에서 stderr가 보이게 실행해 화면 기록 권한을 한 번 허용한 뒤 확대 도구를 켜서 실패 지점을 특정한다. 고친 뒤 판매 스펙의 샌드박스 인수 조건으로 다시 검증하고, 그 전까지 심사 중인 1.0.0은 승인되더라도 출시하지 않는다.
