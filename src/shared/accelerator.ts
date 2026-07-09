// Tauri global-shortcut accelerator 형식: 수식어 + e.code, "+"로 연결.
// 예) "Alt+Tab", "Alt+Backspace", "Shift+Cmd+KeyZ"

const MOD_KEYS = new Set([
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
  "ControlLeft",
  "ControlRight",
]);

function modifiers(e: KeyboardEvent): string[] {
  const m: string[] = [];
  if (e.ctrlKey) m.push("Control");
  if (e.altKey) m.push("Alt");
  if (e.shiftKey) m.push("Shift");
  if (e.metaKey) m.push("Cmd");
  return m;
}

/** keydown → accelerator 문자열. 수식어만 눌렸거나 키가 없으면 null. */
export function buildAccelerator(e: KeyboardEvent): string | null {
  if (MOD_KEYS.has(e.code) || !e.code) return null;
  return [...modifiers(e), e.code].join("+");
}

/** keydown이 주어진 accelerator와 일치하는가 (웹뷰 로컬 단축키 매칭용). */
export function matchesAccelerator(e: KeyboardEvent, accel: string): boolean {
  const parts = accel.split("+");
  const code = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1).map((s) => s.toLowerCase()));
  return (
    e.code === code &&
    e.ctrlKey === mods.has("control") &&
    e.altKey === (mods.has("alt") || mods.has("option")) &&
    e.shiftKey === mods.has("shift") &&
    e.metaKey === (mods.has("cmd") || mods.has("command") || mods.has("super"))
  );
}

const MOD_SYMBOL: Record<string, string> = {
  control: "⌃",
  ctrl: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
  cmd: "⌘",
  command: "⌘",
  super: "⌘",
};

const CODE_SYMBOL: Record<string, string> = {
  Tab: "⇥",
  Backspace: "⌫",
  Delete: "⌦",
  Enter: "↩",
  Space: "␣",
  Escape: "Esc", // ⎋ 기호는 인지도가 낮아 글자로 표기 (⇥·⌫ 등은 기호 유지)
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

function codeSymbol(code: string): string {
  if (CODE_SYMBOL[code]) return CODE_SYMBOL[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

/** accelerator → 심볼 토큰 배열 (표시용). "Alt+Tab" → ["⌥","⇥"] */
export function acceleratorSymbols(accel: string): string[] {
  const parts = accel.split("+");
  const code = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((s) => MOD_SYMBOL[s.toLowerCase()] ?? s);
  return [...mods, codeSymbol(code)];
}
