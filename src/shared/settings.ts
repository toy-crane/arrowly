import { load, Store } from "@tauri-apps/plugin-store";
import { Color, COLORS, DEFAULT_COLOR, DEFAULT_WIDTH, WIDTHS, WidthKey } from "./constants";

// 설정 파일 단일 진입점.
let storePromise: Promise<Store> | null = null;

export function settingsStore(): Promise<Store> {
  storePromise ??= load("settings.json");
  return storePromise;
}

export async function loadTool(): Promise<{ color: Color; width: WidthKey }> {
  const store = await settingsStore();
  const color = await store.get<Color>("color");
  const width = await store.get<WidthKey>("width");
  return {
    color: color && COLORS.includes(color) ? color : DEFAULT_COLOR,
    width: width && width in WIDTHS ? width : DEFAULT_WIDTH,
  };
}

export async function saveColor(color: Color): Promise<void> {
  const store = await settingsStore();
  await store.set("color", color);
  await store.save();
}

export async function saveWidth(width: WidthKey): Promise<void> {
  const store = await settingsStore();
  await store.set("width", width);
  await store.save();
}

export type MarkerPos = { xRatio: number; yRatio: number };

export async function loadMarkerPos(): Promise<MarkerPos | null> {
  const store = await settingsStore();
  return (await store.get<MarkerPos>("markerPos")) ?? null;
}

export async function saveMarkerPos(pos: MarkerPos): Promise<void> {
  const store = await settingsStore();
  await store.set("markerPos", pos);
  await store.save();
}

export type Shortcuts = { toggle: string; board: string; clear: string; text: string };
// text는 전역 미등록 로컬 키라 수식키 없는 단독 키를 기본값으로 쓴다.
// 레거시 3키 스토어는 loadShortcuts의 기본값 merge가 자동 보완한다.

/** OS 전역 등록 검증이 필요한 단축키 필드 — clear·text는 웹뷰 keydown 처리라 제외 */
export type GlobalShortcutId = Exclude<keyof Shortcuts, "clear" | "text">;
export const DEFAULT_SHORTCUTS: Shortcuts = {
  toggle: "Alt+Tab",
  board: "Shift+Alt+Tab",
  clear: "Alt+Backspace",
  text: "KeyT",
};

export async function loadShortcuts(): Promise<Shortcuts> {
  const store = await settingsStore();
  const s = await store.get<Partial<Shortcuts>>("shortcuts");
  return { ...DEFAULT_SHORTCUTS, ...s };
}

export async function saveShortcuts(shortcuts: Shortcuts): Promise<void> {
  const store = await settingsStore();
  await store.set("shortcuts", shortcuts);
  await store.save();
}

export async function saveOnboardingDone(): Promise<void> {
  const store = await settingsStore();
  await store.set("onboardingDone", true);
  await store.save();
}
