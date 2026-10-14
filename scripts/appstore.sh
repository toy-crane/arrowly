#!/usr/bin/env bash
# Mac App Store 빌드 도구.
#   sandbox-run : Apple Development로 서명한 샌드박스 앱을 만들어 로컬에서 실행한다(동작 검증용).
#   package     : Apple Distribution으로 서명한 universal 앱과 설치 패키지(.pkg)를 만든다.
#   validate    : 만든 .pkg를 App Store Connect 업로드 검사에 보낸다(제출하지 않음).
#   upload      : 만든 .pkg를 App Store Connect에 업로드한다.
# validate·upload는 ASC_KEY_ID, ASC_ISSUER_ID 환경 변수와
# ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8 키 파일을 사용한다.
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tauri_dir="$project_dir/src-tauri"
out_dir="$tauri_dir/target/appstore"
identifier="com.oddcorp.arrowly"
team_id="STRPJDK4MR"
profile_name="Arrowly Mac App Store"
app_identity="Apple Distribution: ODD Inc. ($team_id)"
installer_identity="3rd Party Mac Developer Installer: ODD Inc. ($team_id)"
pkg_path="$out_dir/Arrowly.pkg"
mode="${1:-}"

fail() {
  echo "$1" >&2
  exit 1
}

# Developer ID 공증 변수가 남아 있으면 Tauri가 App Store 빌드를 공증하려 한다.
unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID APPLE_API_KEY APPLE_API_ISSUER

profile_value() {
  plutil -extract "$2" raw -o - "$1" 2>/dev/null || true
}

# 이름·앱 ID·팀이 맞고 만료되지 않은 프로필 중 만료일이 가장 늦은 것을 고른다.
install_profile() {
  local dir="$HOME/Library/MobileDevice/Provisioning Profiles"
  local now found="" found_expiry=""
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local decoded
  decoded="$(mktemp)"
  for profile in "$dir"/*.provisionprofile; do
    [[ -e "$profile" ]] || continue
    security cms -D -i "$profile" >"$decoded" 2>/dev/null || continue
    [[ "$(profile_value "$decoded" Name)" == "$profile_name" ]] || continue
    [[ "$(profile_value "$decoded" Entitlements.com\\.apple\\.application-identifier)" == "$team_id.$identifier" ]] || continue
    [[ "$(profile_value "$decoded" TeamIdentifier.0)" == "$team_id" ]] || continue
    local expiry
    expiry="$(profile_value "$decoded" ExpirationDate)"
    [[ "$expiry" > "$now" ]] || continue
    if [[ -z "$found" || "$expiry" > "$found_expiry" ]]; then
      found="$profile"
      found_expiry="$expiry"
    fi
  done
  rm -f "$decoded"
  [[ -n "$found" ]] || fail "유효한 프로비저닝 프로필 '$profile_name'을 찾지 못했습니다: $dir"
  cp "$found" "$tauri_dir/appstore/embedded.provisionprofile"
}

require_identity() {
  security find-identity -v | grep -Fq "\"$1\"" || fail "키체인에 서명 인증서가 없습니다: $1"
}

sandbox_run() {
  local identity
  identity="$(security find-identity -v -p codesigning \
    | awk -F'"' '/"Apple Development:/{print $2; exit}')"
  [[ -n "$identity" ]] || fail "Apple Development 코드 서명 인증서를 찾지 못했습니다."
  pgrep -x arrowly >/dev/null && fail "실행 중인 Arrowly를 종료한 뒤 다시 실행하세요."

  local dev_config
  dev_config='{"identifier":"'"$identifier"'","bundle":{"macOS":{"minimumSystemVersion":"14.0","entitlements":"./appstore/Entitlements.sandbox-dev.plist"}}}'
  (
    cd "$project_dir"
    APPLE_SIGNING_IDENTITY="$identity" bunx tauri build --debug --bundles app --config "$dev_config"
  )
  local app="$tauri_dir/target/debug/bundle/macos/Arrowly.app"
  codesign --verify --deep --strict "$app"
  codesign -d --entitlements - "$app" 2>/dev/null | grep -q 'com.apple.security.app-sandbox' \
    || fail "샌드박스 entitlement가 서명에 없습니다: $app"
  echo "샌드박스 앱: $app"
  open "$app"
}

package() {
  require_identity "$app_identity"
  require_identity "$installer_identity"
  install_profile

  local build_number
  build_number="$(date +%Y%m%d%H%M)"
  (
    cd "$project_dir"
    APPLE_SIGNING_IDENTITY="$app_identity" bunx tauri build \
      --bundles app \
      --target universal-apple-darwin \
      --config src-tauri/tauri.appstore.conf.json \
      --config '{"bundle":{"macOS":{"bundleVersion":"'"$build_number"'"}}}'
  )

  local app="$tauri_dir/target/universal-apple-darwin/release/bundle/macos/Arrowly.app"
  codesign --verify --deep --strict "$app"
  local entitlements
  entitlements="$(codesign -d --entitlements - --xml "$app" 2>/dev/null)"
  grep -q 'com.apple.security.app-sandbox' <<<"$entitlements" || fail "샌드박스 entitlement가 없습니다."
  grep -q "$team_id.$identifier" <<<"$entitlements" || fail "application-identifier가 다릅니다."
  [[ -f "$app/Contents/embedded.provisionprofile" ]] || fail "프로비저닝 프로필이 앱에 들어 있지 않습니다."

  mkdir -p "$out_dir"
  rm -f "$pkg_path"
  xcrun productbuild --sign "$installer_identity" --component "$app" /Applications "$pkg_path"
  pkgutil --check-signature "$pkg_path" >/dev/null
  echo "App Store 패키지: $pkg_path (빌드 번호 $build_number)"
}

altool_package() {
  [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" ]] \
    || fail "ASC_KEY_ID와 ASC_ISSUER_ID 환경 변수가 필요합니다."
  [[ -f "$pkg_path" ]] || fail "먼저 package를 실행하세요: $pkg_path"
  xcrun altool "$1" --type macos --file "$pkg_path" \
    --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
}

case "$mode" in
  sandbox-run) sandbox_run ;;
  package) package ;;
  validate) altool_package --validate-app ;;
  upload) altool_package --upload-app ;;
  *) fail "사용법: scripts/appstore.sh sandbox-run|package|validate|upload" ;;
esac
