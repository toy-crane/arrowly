import { describe, expect, it } from "vitest";
import {
  colorKeyPressed,
  controlSymbols,
  DEFAULT_CONTROLS,
  isGestureModifierKey,
  roleKeysOf,
  sizeStepOf,
  updateControls,
  type Controls,
} from "./controls";

function key(code: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent("keydown", { code, ...init });
}

const withShiftDuplicate: Controls = { ...DEFAULT_CONTROLS, duplicate: "Shift" };

describe("mark gesture keys", () => {
  it("defaults to Command move, Option-Command duplicate and Option delete", () => {
    expect(controlSymbols(DEFAULT_CONTROLS, "move")).toEqual(["⌘"]);
    expect(controlSymbols(DEFAULT_CONTROLS, "duplicate")).toEqual(["⌥", "⌘"]);
    expect(controlSymbols(DEFAULT_CONTROLS, "delete")).toEqual(["⌥"]);
    expect(controlSymbols(DEFAULT_CONTROLS, "size")).toEqual(["⌘", "±"]);
    expect(controlSymbols(DEFAULT_CONTROLS, "color")).toEqual(["C"]);
  });

  it("maps held modifiers to move, duplicate add-on and delete roles", () => {
    expect(roleKeysOf(key("MetaLeft", { metaKey: true, altKey: true }), DEFAULT_CONTROLS)).toEqual({
      move: true,
      extra: true,
      del: true,
    });
    expect(roleKeysOf(key("ShiftLeft", { metaKey: true, shiftKey: true }), withShiftDuplicate)).toEqual({
      move: true,
      extra: true,
      del: false,
    });
    expect(roleKeysOf(key("AltLeft", { altKey: true }), withShiftDuplicate)).toEqual({
      move: false,
      extra: false,
      del: true,
    });
  });

  it("treats only configured gesture modifiers as interaction keys", () => {
    expect(isGestureModifierKey("Meta", DEFAULT_CONTROLS)).toBe(true);
    expect(isGestureModifierKey("Alt", DEFAULT_CONTROLS)).toBe(true);
    expect(isGestureModifierKey("Shift", DEFAULT_CONTROLS)).toBe(false);
    expect(isGestureModifierKey("Shift", withShiftDuplicate)).toBe(true);
    expect(isGestureModifierKey("Control", withShiftDuplicate)).toBe(false);
    expect(isGestureModifierKey("a", withShiftDuplicate)).toBe(false);
  });

  it("moves the duplicate combination with a new move key", () => {
    const result = updateControls(DEFAULT_CONTROLS, "move", ["Shift"]);
    expect(result).toEqual({ ok: true, controls: { ...DEFAULT_CONTROLS, move: "Shift" } });
    if (result.ok) expect(controlSymbols(result.controls, "duplicate")).toEqual(["⌥", "⇧"]);
  });

  it("records a duplicate add-on key from the move key plus one modifier", () => {
    expect(updateControls(DEFAULT_CONTROLS, "duplicate", ["Shift", "Cmd"])).toEqual({
      ok: true,
      controls: withShiftDuplicate,
    });
  });

  it("rejects gesture combinations that break the mark gesture rule", () => {
    expect(updateControls(DEFAULT_CONTROLS, "duplicate", ["Alt"])).toEqual({
      ok: false,
      error: "duplicateNeedsMove",
    });
    expect(updateControls(DEFAULT_CONTROLS, "duplicate", ["Alt", "Shift"])).toEqual({
      ok: false,
      error: "duplicateNeedsMove",
    });
    expect(updateControls(DEFAULT_CONTROLS, "duplicate", ["Alt", "Shift", "Cmd"])).toEqual({
      ok: false,
      error: "duplicateNeedsMove",
    });
    expect(updateControls(DEFAULT_CONTROLS, "move", ["Alt"])).toEqual({
      ok: false,
      error: "gestureConflict",
    });
    expect(updateControls(withShiftDuplicate, "move", ["Shift"])).toEqual({
      ok: false,
      error: "gestureConflict",
    });
    expect(updateControls(DEFAULT_CONTROLS, "delete", ["Cmd"])).toEqual({
      ok: false,
      error: "gestureConflict",
    });
    expect(updateControls(DEFAULT_CONTROLS, "delete", ["Alt", "Shift"])).toEqual({
      ok: false,
      error: "singleModifier",
    });
    expect(updateControls(DEFAULT_CONTROLS, "move", ["Control"])).toEqual({
      ok: false,
      error: "controlNotAllowed",
    });
    expect(updateControls(DEFAULT_CONTROLS, "duplicate", ["Control", "Cmd"])).toEqual({
      ok: false,
      error: "controlNotAllowed",
    });
  });

  it("lets the delete key differ from the duplicate add-on key", () => {
    expect(updateControls(withShiftDuplicate, "delete", ["Alt"])).toEqual({
      ok: true,
      controls: withShiftDuplicate,
    });
  });
});

describe("tool size modifier", () => {
  it("steps size with the configured modifier and plus or minus", () => {
    expect(sizeStepOf(key("Equal", { metaKey: true }), DEFAULT_CONTROLS)).toBe(1);
    expect(sizeStepOf(key("NumpadAdd", { metaKey: true }), DEFAULT_CONTROLS)).toBe(1);
    expect(sizeStepOf(key("Minus", { metaKey: true }), DEFAULT_CONTROLS)).toBe(-1);
    expect(sizeStepOf(key("NumpadSubtract", { metaKey: true }), DEFAULT_CONTROLS)).toBe(-1);
    // Shift는 `+`를 치는 자판 차이라 지정되지 않았으면 무시한다
    expect(sizeStepOf(key("Equal", { metaKey: true, shiftKey: true }), DEFAULT_CONTROLS)).toBe(1);
    expect(sizeStepOf(key("Equal", { metaKey: true, altKey: true }), DEFAULT_CONTROLS)).toBe(0);
    expect(sizeStepOf(key("Equal"), DEFAULT_CONTROLS)).toBe(0);
    expect(sizeStepOf(key("KeyA", { metaKey: true }), DEFAULT_CONTROLS)).toBe(0);
  });

  it("follows a changed size modifier", () => {
    const result = updateControls(DEFAULT_CONTROLS, "size", ["Alt"]);
    expect(result).toEqual({ ok: true, controls: { ...DEFAULT_CONTROLS, size: ["Alt"] } });
    if (!result.ok) return;
    expect(sizeStepOf(key("Equal", { altKey: true }), result.controls)).toBe(1);
    expect(sizeStepOf(key("Equal", { metaKey: true }), result.controls)).toBe(0);
    const shifted = updateControls(DEFAULT_CONTROLS, "size", ["Shift", "Cmd"]);
    if (!shifted.ok) throw new Error("expected ok");
    expect(sizeStepOf(key("Minus", { metaKey: true, shiftKey: true }), shifted.controls)).toBe(-1);
    expect(sizeStepOf(key("Minus", { metaKey: true }), shifted.controls)).toBe(0);
    expect(controlSymbols(shifted.controls, "size")).toEqual(["⇧", "⌘", "±"]);
  });

  it("requires at least one modifier", () => {
    expect(updateControls(DEFAULT_CONTROLS, "size", [])).toEqual({
      ok: false,
      error: "singleModifier",
    });
  });
});

describe("quick color palette key", () => {
  it("matches the configured key only without modifiers", () => {
    expect(colorKeyPressed(key("KeyC"), DEFAULT_CONTROLS)).toBe(true);
    expect(colorKeyPressed(key("KeyC", { shiftKey: true }), DEFAULT_CONTROLS)).toBe(false);
    expect(colorKeyPressed(key("KeyQ"), DEFAULT_CONTROLS)).toBe(false);
  });

  it("accepts a letter or digit that the text key does not use", () => {
    const result = updateControls(DEFAULT_CONTROLS, "color", "KeyQ", { text: "KeyT" });
    expect(result).toEqual({ ok: true, controls: { ...DEFAULT_CONTROLS, color: "KeyQ" } });
    if (result.ok) expect(colorKeyPressed(key("KeyQ"), result.controls)).toBe(true);
    expect(updateControls(DEFAULT_CONTROLS, "color", "Digit4", { text: "KeyT" }).ok).toBe(true);
  });

  it("rejects the text key, modifiers and non-character keys", () => {
    expect(updateControls(DEFAULT_CONTROLS, "color", "KeyT", { text: "KeyT" })).toEqual({
      ok: false,
      error: "colorTaken",
    });
    expect(updateControls(DEFAULT_CONTROLS, "color", "Alt+KeyQ", { text: "KeyT" })).toEqual({
      ok: false,
      error: "colorCharacter",
    });
    expect(updateControls(DEFAULT_CONTROLS, "color", "Escape", { text: "KeyT" })).toEqual({
      ok: false,
      error: "colorCharacter",
    });
  });
});
