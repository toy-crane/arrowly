#!/usr/bin/env bash
set -euo pipefail

if ! cargo llvm-cov --version >/dev/null 2>&1; then
  echo "cargo-llvm-cov is required: cargo install cargo-llvm-cov --locked" >&2
  exit 1
fi

# Tauri's MockRuntime deliberately does not execute native webviews or AppKit.
# Enforce coverage on the backend policy modules; native adapters are verified
# by the macOS acceptance criteria in the relevant docs/specs capability.
cargo llvm-cov \
  --manifest-path src-tauri/Cargo.toml \
  --summary-only \
  --ignore-filename-regex '(events|hotkey|i18n|lib|main|overlay|shortcuts|store|tray)\.rs$' \
  --fail-under-lines 90 \
  --fail-under-functions 90 \
  --fail-under-regions 90 \
  --fail-under-file-lines 90
