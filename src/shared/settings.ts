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

export type Shortcuts = { toggle: string; clear: string };
export const DEFAULT_SHORTCUTS: Shortcuts = { toggle: "Alt+Tab", clear: "Alt+Backspace" };

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
