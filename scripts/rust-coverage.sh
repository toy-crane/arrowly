#!/usr/bin/env bash
set -euo pipefail

if ! cargo llvm-cov --version >/dev/null 2>&1; then
  echo "cargo-llvm-cov is required: cargo install cargo-llvm-cov --locked" >&2
  exit 1
fi

# Tauri's MockRuntime deliberately does not execute native webviews or AppKit.
# Enforce coverage on the backend domain modules; native adapters have the
# separate macOS regression checklist documented in docs/TESTING.md.
cargo llvm-cov \
  --manifest-path src-tauri/Cargo.toml \
  --summary-only \
  --ignore-filename-regex '(i18n|lib|main|overlay|shortcuts|tray)\.rs$' \
  --fail-under-lines 90 \
  --fail-under-functions 90 \
  --fail-under-regions 90 \
  --fail-under-file-lines 90
