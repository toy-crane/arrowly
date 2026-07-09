#!/usr/bin/env bash
# 아이콘 재생성 스크립트 — 필요: ImageMagick(brew install imagemagick), bun
# 원본 시안: assets/icon.svg(앱), assets/tray-template.svg(트레이 글리프)
# ImageMagick 내장 SVG 파서는 곡선 path를 렌더링하지 못하므로(빈 이미지),
# SVG를 거치지 않고 MVG draw 명령으로 동일한 path를 직접 그린다.
set -euo pipefail
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

P1="M21,85 C27,72 29,64 36,54 C41,46.5 47,41 54,36.5 C62,31.5 69,29 76,27.8"
P2="M60,14.5 C67,18 74,22.5 81,28.5"
P3="M82.5,25.5 C76.5,32.5 72,40.5 69.5,48"

# ── 앱 아이콘 (잉크 블록 타일 + 확정 글리프, 1024px) ─────────────────
magick -size 1024x1024 "gradient:#FFDF33-#F5C800" "$TMP/tile.png"
magick -size 1024x1024 xc:none -draw "fill black roundrectangle 0,0 1023,1023 232,232" "$TMP/mask.png"
magick "$TMP/tile.png" "$TMP/mask.png" -compose DstIn -composite "$TMP/block.png"
magick "$TMP/block.png" \
  -draw "scale 10.24,10.24 translate 2,-1.4 fill none stroke #1C1E24 stroke-width 9 stroke-opacity 0.3 stroke-linecap round path '$P1'" \
  -draw "scale 10.24,10.24 fill none stroke #1C1E24 stroke-width 10 stroke-linecap round path '$P1'" \
  -draw "scale 10.24,10.24 fill none stroke #1C1E24 stroke-width 10 stroke-linecap round path '$P2'" \
  -draw "scale 10.24,10.24 fill none stroke #1C1E24 stroke-width 10 stroke-linecap round path '$P3'" \
  "$TMP/icon-1024.png"
bun tauri icon "$TMP/icon-1024.png"
rm -rf src-tauri/icons/android src-tauri/icons/ios # macOS 전용

# ── 트레이 템플릿 (검정+알파, 36px) ──────────────────────────────────
magick -size 400x400 xc:none \
  -draw "scale 4,4 fill none stroke black stroke-width 10 stroke-linecap round path '$P1'" \
  -draw "scale 4,4 fill none stroke black stroke-width 10 stroke-linecap round path '$P2'" \
  -draw "scale 4,4 fill none stroke black stroke-width 10 stroke-linecap round path '$P3'" \
  -resize 36x36 src-tauri/icons/tray-Template.png

echo "done: src-tauri/icons/"
