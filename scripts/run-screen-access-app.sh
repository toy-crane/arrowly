#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_path="$project_dir/src-tauri/target/debug/bundle/macos/Arrowly.app"
expected_identifier="com.toycrane.arrowly"
identity="${APPLE_SIGNING_IDENTITY:-}"
mode="${1:-}"

if [[ -n "$mode" && "$mode" != "--build-only" ]]; then
  echo "지원하지 않는 인자입니다: $mode" >&2
  exit 1
fi

if [[ -z "$mode" ]] && pgrep -x arrowly >/dev/null; then
  echo "실행 중인 Arrowly를 종료한 뒤 다시 실행하세요." >&2
  exit 1
fi

if [[ -z "$identity" ]]; then
  identity="$(security find-identity -v -p codesigning \
    | awk -F'"' '/"Apple Development:/{print $2; exit}')"
fi

if [[ -z "$identity" ]]; then
  echo "Apple Development 코드 서명 인증서를 찾지 못했습니다." >&2
  echo "APPLE_SIGNING_IDENTITY를 지정하거나 키체인에 인증서를 설치하세요." >&2
  exit 1
fi

echo "화면 기록 권한 검증용 앱을 서명합니다: $identity"
(
  cd "$project_dir"
  APPLE_SIGNING_IDENTITY="$identity" bunx tauri build --debug --bundles app
)

codesign --verify --deep --strict "$app_path"
actual_identifier="$(codesign -dv --verbose=4 "$app_path" 2>&1 \
  | sed -n 's/^Identifier=//p')"
if [[ "$actual_identifier" != "$expected_identifier" ]]; then
  echo "서명 식별자가 다릅니다: $actual_identifier" >&2
  exit 1
fi

if [[ "$mode" == "--build-only" ]]; then
  echo "서명 앱 검증 완료: $app_path"
  exit 0
fi

open "$app_path"
