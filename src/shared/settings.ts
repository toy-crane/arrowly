import { load, Store } from "@tauri-apps/plugin-store";
import {
  Color,
  COLORS,
  DEFAULT_COLOR,
  DEFAULT_TEXT_SIZE,
  DEFAULT_WIDTH,
  TEXT_SIZE_KEYS,
  TextSizeKey,
  WIDTHS,
  WidthKey,
} from "./constants";

// 설정 파일 단일 진입점.
let storePromise: Promise<Store> | null = null;

export function settingsStore(): Promise<Store> {
  storePromise ??= load("settings.json");
  return storePromise;
}

export async function loadTool(): Promise<{
  color: Color;
  width: WidthKey;
  textSize: TextSizeKey;
}> {
  const store = await settingsStore();
  const color = await store.get<Color>("color");
  const width = await store.get<WidthKey>("width");
  const textSize = await store.get<TextSizeKey>("textSize");
  return {
    color: color && COLORS.includes(color) ? color : DEFAULT_COLOR,
    width: width && Object.prototype.hasOwnProperty.call(WIDTHS, width) ? width : DEFAULT_WIDTH,
    textSize: textSize && TEXT_SIZE_KEYS.includes(textSize) ? textSize : DEFAULT_TEXT_SIZE,
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

export async function saveTextSize(textSize: TextSizeKey): Promise<void> {
  const store = await settingsStore();
  await store.set("textSize", textSize);
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
  const shortcuts = { ...DEFAULT_SHORTCUTS, ...s };
  // 텍스트 키가 빠른 색 팔레트 키와 겹치는 기존 설정은 기본 텍스트 키로 옮긴다.
  const { color } = await loadControls();
  if (shortcuts.text === color) {
    const migrated = { ...shortcuts, text: DEFAULT_SHORTCUTS.text };
    await store.set("shortcuts", migrated);
    await store.save();
    return migrated;
  }
  return shortcuts;
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

/** 수식키 이름은 accelerator 문자열과 같은 표기를 쓴다. */
export type ModifierName = "Control" | "Alt" | "Shift" | "Cmd";
/** 마크 제스처에 쓸 수 있는 수식키. `⌃` 클릭은 macOS 보조 클릭이라 뺀다. */
export type GestureModifier = Exclude<ModifierName, "Control">;

/** 오버레이가 처리하는 조작 키. 조합 규칙은 shared/shortcuts의 updateControls가 소유한다. */
export type Controls = {
  /** 옮기기 키 */
  move: GestureModifier;
  /** 복제 추가 키 — 복제 = 옮기기 키 + 복제 추가 키 */
  duplicate: GestureModifier;
  /** 지우기 키 */
  delete: GestureModifier;
  /** 도구 크기 조절 수식키 (+/−와 함께) */
  size: ModifierName[];
  /** 빠른 색 팔레트 키 (e.code, 수식키 없음) */
  color: string;
};

export const DEFAULT_CONTROLS: Controls = {
  move: "Cmd",
  duplicate: "Alt",
  delete: "Alt",
  size: ["Cmd"],
  color: "KeyC",
};

const MODIFIER_NAMES: ModifierName[] = ["Control", "Alt", "Shift", "Cmd"];

export const isModifierName = (value: unknown): value is ModifierName =>
  typeof value === "string" && (MODIFIER_NAMES as string[]).includes(value);

export const isGestureModifier = (value: unknown): value is GestureModifier =>
  isModifierName(value) && value !== "Control";

/** 저장값을 검증한다. 규칙을 어긴 묶음(제스처·크기·색)은 그 묶음만 기본값으로 되돌린다. */
function sanitizeControls(raw: unknown): Controls {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const { move, duplicate } = value;
  const del = value.delete;
  const gesturesValid =
    isGestureModifier(move) &&
    isGestureModifier(duplicate) &&
    isGestureModifier(del) &&
    move !== duplicate &&
    move !== del;
  const gestures = gesturesValid
    ? { move, duplicate, delete: del }
    : { move: DEFAULT_CONTROLS.move, duplicate: DEFAULT_CONTROLS.duplicate, delete: DEFAULT_CONTROLS.delete };
  const size =
    Array.isArray(value.size) && value.size.length > 0 && value.size.every(isModifierName)
      ? MODIFIER_NAMES.filter((name) => (value.size as ModifierName[]).includes(name))
      : DEFAULT_CONTROLS.size;
  const color =
    typeof value.color === "string" && /^(Key[A-Z]|Digit[0-9])$/.test(value.color)
      ? value.color
      : DEFAULT_CONTROLS.color;
  return { ...gestures, size, color };
}

export async function loadControls(): Promise<Controls> {
  const store = await settingsStore();
  return sanitizeControls(await store.get("controls"));
}

export async function saveControls(controls: Controls): Promise<void> {
  const store = await settingsStore();
  await store.set("controls", controls);
  await store.save();
}

/** 설정 창에서 바뀐 조작 키를 다른 창(오버레이·온보딩)이 바로 받는다. */
export async function onControlsChanged(handler: (controls: Controls) => void): Promise<() => void> {
  const store = await settingsStore();
  return store.onKeyChange("controls", (value) => handler(sanitizeControls(value)));
}
