import { describe, expect, it } from "vitest";
import { acceleratorSymbols, buildAccelerator, matchesAccelerator } from "./accelerator";

function key(code: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent("keydown", { code, ...init });
}

describe("accelerator", () => {
  it("builds accelerators in the stable modifier order", () => {
    expect(buildAccelerator(key("KeyK", { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true }))).toBe(
      "Control+Alt+Shift+Cmd+KeyK",
    );
    expect(buildAccelerator(key("Tab", { altKey: true }))).toBe("Alt+Tab");
  });

  it("ignores modifier-only and unidentified keys", () => {
    expect(buildAccelerator(key("AltLeft", { altKey: true }))).toBeNull();
    expect(buildAccelerator(key(""))).toBeNull();
  });

  it("matches exact key and modifier combinations including aliases", () => {
    expect(matchesAccelerator(key("KeyZ", { metaKey: true, shiftKey: true }), "Shift+Command+KeyZ")).toBe(true);
    expect(matchesAccelerator(key("KeyP", { altKey: true, metaKey: true }), "Option+Super+KeyP")).toBe(true);
    expect(matchesAccelerator(key("KeyP", { altKey: true }), "Alt+Cmd+KeyP")).toBe(false);
    expect(matchesAccelerator(key("KeyX", { ctrlKey: true }), "Control+KeyP")).toBe(false);
    expect(matchesAccelerator(key("KeyP", { shiftKey: true }), "KeyP")).toBe(false);
  });

  it("renders modifier, named, letter, digit and unknown key symbols", () => {
    expect(acceleratorSymbols("Control+Alt+Shift+Cmd+Tab")).toEqual(["⌃", "⌥", "⇧", "⌘", "⇥"]);
    expect(acceleratorSymbols("Ctrl+Option+Command+Super+Backspace")).toEqual(["⌃", "⌥", "⌘", "⌘", "⌫"]);
    expect(acceleratorSymbols("KeyA")).toEqual(["A"]);
    expect(acceleratorSymbols("Digit7")).toEqual(["7"]);
    expect(acceleratorSymbols("Escape")).toEqual(["Esc"]);
    expect(acceleratorSymbols("Cmd+Equal")).toEqual(["⌘", "+"]);
    expect(acceleratorSymbols("Cmd+Minus")).toEqual(["⌘", "−"]);
    expect(acceleratorSymbols("Delete")).toEqual(["⌦"]);
    expect(acceleratorSymbols("Enter")).toEqual(["↩"]);
    expect(acceleratorSymbols("Space")).toEqual(["␣"]);
    expect(acceleratorSymbols("ArrowUp")).toEqual(["↑"]);
    expect(acceleratorSymbols("ArrowDown")).toEqual(["↓"]);
    expect(acceleratorSymbols("ArrowLeft")).toEqual(["←"]);
    expect(acceleratorSymbols("ArrowRight")).toEqual(["→"]);
    expect(acceleratorSymbols("F12")).toEqual(["F12"]);
  });
});
