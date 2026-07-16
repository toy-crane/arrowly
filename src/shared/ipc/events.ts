import { listen, UnlistenFn } from "@tauri-apps/api/event";

// Rust가 emit하는 이벤트의 이름·페이로드 계약. 이벤트명 문자열은 이 파일에만 존재한다.
// Rust는 상태 전이의 단일 소스 — 웹뷰는 이 이벤트로만 상태를 동기화한다.

export type ModeChangedPayload = { drawing: boolean; board: boolean };
export type BoardChangedPayload = { on: boolean };
export type MarkerHiddenChangedPayload = { hidden: boolean };
export type ShortcutsChangedPayload = { board: string; clear: string; text: string };

export function onModeChanged(handler: (p: ModeChangedPayload) => void): Promise<UnlistenFn> {
  return listen<ModeChangedPayload>("mode-changed", (e) => handler(e.payload));
}

export function onBoardChanged(handler: (p: BoardChangedPayload) => void): Promise<UnlistenFn> {
  return listen<BoardChangedPayload>("board-changed", (e) => handler(e.payload));
}

export function onMarkerHiddenChanged(
  handler: (p: MarkerHiddenChangedPayload) => void,
): Promise<UnlistenFn> {
  return listen<MarkerHiddenChangedPayload>("marker-hidden-changed", (e) => handler(e.payload));
}

export function onShortcutsChanged(
  handler: (p: ShortcutsChangedPayload) => void,
): Promise<UnlistenFn> {
  return listen<ShortcutsChangedPayload>("shortcuts-changed", (e) => handler(e.payload));
}

export function onClearAll(handler: () => void): Promise<UnlistenFn> {
  return listen("clear-all", () => handler());
}

/** 트레이 "텍스트 입력" — Rust가 그리기 진입을 보장한 뒤 emit한다 */
export function onEnterTextMode(handler: () => void): Promise<UnlistenFn> {
  return listen("enter-text-mode", () => handler());
}

/** 편집 중 첫 전역 Esc — 현재 내용을 확정하고 텍스트 편집만 끝낸다. */
export function onFinishTextEditing(handler: () => void): Promise<UnlistenFn> {
  return listen("finish-text-editing", () => handler());
}
