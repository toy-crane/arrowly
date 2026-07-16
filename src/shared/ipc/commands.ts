import { invoke } from "@tauri-apps/api/core";
import type { GlobalShortcutId, Shortcuts } from "../settings";

// Rust #[tauri::command]와 1:1 대응하는 typed 래퍼.
// 커맨드명 문자열과 인자 형태(top-level 키)는 이 파일에만 존재한다 — src-tauri와 lockstep.

/** 마커 버튼·트레이가 공유하는 블랙보드 토글 (overlay.rs) */
export function toggleBoard(): Promise<void> {
  return invoke("toggle_board");
}

/** 텍스트 편집 세션과 Rust 전역 Esc의 1차 동작을 동기화한다 (overlay.rs). */
export function setTextEditing(editing: boolean): Promise<void> {
  return invoke("set_text_editing", { editing });
}

/** 레코딩·온보딩 체험 동안 상시 전역 키 해제 (shortcuts.rs) */
export function suspendShortcuts(): Promise<void> {
  return invoke("suspend_shortcuts");
}

/** 상시 전역 키 멱등 복구 (shortcuts.rs) */
export function resumeShortcuts(): Promise<void> {
  return invoke("resume_shortcuts");
}

/** 레코더 검증: 전역 등록 가능 여부만 검사 (shortcuts.rs) */
export function tryRegisterShortcut(id: GlobalShortcutId, accelerator: string): Promise<void> {
  return invoke("try_register_shortcut", { id, accelerator });
}

/** 세 단축키를 하나의 설정으로 원자 적용 (shortcuts.rs) — 인자는 top-level 키여야 한다 */
export function applyShortcuts(shortcuts: Shortcuts): Promise<void> {
  return invoke("apply_shortcuts", { ...shortcuts });
}
