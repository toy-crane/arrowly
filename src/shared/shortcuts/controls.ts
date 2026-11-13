// 오버레이가 처리하는 조작 키(마크 제스처 수식키, 도구 크기 수식키, 빠른 색 팔레트 키).
// 조합 규칙의 결정 계약: docs/decisions/shortcut-policy.md

import {
  type Controls,
  DEFAULT_CONTROLS,
  type GestureModifier,
  isGestureModifier,
  isModifierName,
  type ModifierName,
} from "../settings";

export { DEFAULT_CONTROLS, isGestureModifier, isModifierName };
export type { Controls, GestureModifier, ModifierName };
export type ControlId = keyof Controls;

/** 탐색 상태가 쓰는 역할별 눌림 스냅숏. */
export type RoleKeys = { move: boolean; extra: boolean; del: boolean };

export type ControlError =
  | "singleModifier"
  | "controlNotAllowed"
  | "gestureConflict"
  | "duplicateNeedsMove"
  | "colorCharacter"
  | "colorTaken";

export type ControlUpdate = { ok: true; controls: Controls } | { ok: false; error: ControlError };

const MODIFIER_ORDER: ModifierName[] = ["Control", "Alt", "Shift", "Cmd"];
const SYMBOL: Record<ModifierName, string> = { Control: "⌃", Alt: "⌥", Shift: "⇧", Cmd: "⌘" };
const EVENT_KEY: Record<string, ModifierName> = {
  Control: "Control",
  Alt: "Alt",
  Shift: "Shift",
  Meta: "Cmd",
};

type ModifierEvent = Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

const isHeld = (e: ModifierEvent, name: ModifierName) =>
  name === "Control" ? e.ctrlKey : name === "Alt" ? e.altKey : name === "Shift" ? e.shiftKey : e.metaKey;

const ordered = (names: ModifierName[]) =>
  MODIFIER_ORDER.filter((name) => names.includes(name));

/** 이벤트의 수식키를 옮기기·복제 추가·지우기 역할로 옮긴다. */
export function roleKeysOf(e: ModifierEvent, controls: Controls): RoleKeys {
  return {
    move: isHeld(e, controls.move),
    extra: isHeld(e, controls.duplicate),
    del: isHeld(e, controls.delete),
  };
}

/** KeyboardEvent.key가 지금 설정된 마크 제스처 수식키 중 하나인가. */
export function isGestureModifierKey(eventKey: string, controls: Controls): boolean {
  const name = EVENT_KEY[eventKey];
  return name !== undefined && [controls.move, controls.duplicate, controls.delete].includes(name as GestureModifier);
}

/** 이벤트가 마크 제스처 수식키 중 하나라도 누르고 있는가. */
export function anyGestureModifierHeld(e: ModifierEvent, controls: Controls): boolean {
  const keys = roleKeysOf(e, controls);
  return keys.move || keys.extra || keys.del;
}

/** 도구 크기 조절 키면 +1/−1, 아니면 0. Shift는 지정되지 않았으면 무시한다. */
export function sizeStepOf(e: KeyboardEvent, controls: Controls): -1 | 0 | 1 {
  const direction =
    e.code === "Equal" || e.code === "NumpadAdd"
      ? 1
      : e.code === "Minus" || e.code === "NumpadSubtract"
        ? -1
        : 0;
  if (!direction) return 0;
  const matches = MODIFIER_ORDER.every((name) =>
    name === "Shift" && !controls.size.includes("Shift")
      ? true
      : isHeld(e, name) === controls.size.includes(name),
  );
  return matches ? direction : 0;
}

/** 빠른 색 팔레트 키를 수식키 없이 눌렀는가. */
export function colorKeyPressed(e: KeyboardEvent, controls: Controls): boolean {
  return (
    e.code === controls.color && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey
  );
}

/** 수식키 하나의 표시 기호. */
export const modifierSymbol = (name: ModifierName) => SYMBOL[name];

/** 표시용 키 기호. */
export function controlSymbols(controls: Controls, id: ControlId): string[] {
  switch (id) {
    case "move":
      return [SYMBOL[controls.move]];
    case "duplicate":
      return ordered([controls.move, controls.duplicate]).map((name) => SYMBOL[name]);
    case "delete":
      return [SYMBOL[controls.delete]];
    case "size":
      return [...ordered(controls.size).map((name) => SYMBOL[name]), "±"];
    case "color":
      return [characterLabel(controls.color)];
  }
}

const characterLabel = (code: string) =>
  code.startsWith("Key") ? code.slice(3) : code.startsWith("Digit") ? code.slice(5) : code;

const isCharacterCode = (code: string) => /^(Key[A-Z]|Digit[0-9])$/.test(code);

function gestureKey(held: ModifierName[]): GestureModifier | ControlError {
  if (held.includes("Control")) return "controlNotAllowed";
  if (held.length !== 1) return "singleModifier";
  return held[0] as GestureModifier;
}

/**
 * 한 행의 새 값을 검증해 다음 설정을 만든다. 수식키 행은 녹화된 수식키 목록,
 * 색 행은 accelerator 문자열(수식키가 섞이면 거부)을 받는다.
 */
export function updateControls(
  controls: Controls,
  id: ControlId,
  value: ModifierName[] | string,
  shortcuts: { text: string } = { text: "" },
): ControlUpdate {
  if (id === "color") {
    const code = String(value);
    if (!isCharacterCode(code)) return { ok: false, error: "colorCharacter" };
    if (code === shortcuts.text) return { ok: false, error: "colorTaken" };
    return { ok: true, controls: { ...controls, color: code } };
  }
  const held = ordered(value as ModifierName[]);
  if (id === "size") {
    if (held.length === 0) return { ok: false, error: "singleModifier" };
    return { ok: true, controls: { ...controls, size: held } };
  }
  if (id === "duplicate") {
    if (held.includes("Control")) return { ok: false, error: "controlNotAllowed" };
    const extra = held.filter((name) => name !== controls.move);
    if (held.length !== 2 || extra.length !== 1) return { ok: false, error: "duplicateNeedsMove" };
    return { ok: true, controls: { ...controls, duplicate: extra[0] as GestureModifier } };
  }
  const key = gestureKey(held);
  if (!isGestureModifier(key)) return { ok: false, error: key };
  if (id === "move") {
    if (key === controls.delete || key === controls.duplicate) {
      return { ok: false, error: "gestureConflict" };
    }
    return { ok: true, controls: { ...controls, move: key } };
  }
  if (key === controls.move) return { ok: false, error: "gestureConflict" };
  return { ok: true, controls: { ...controls, delete: key } };
}
