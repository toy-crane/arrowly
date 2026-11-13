import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  const store = {
    get: vi.fn(async (key: string) => values.get(key)),
    set: vi.fn(async (key: string, value: unknown) => void values.set(key, value)),
    save: vi.fn(async () => undefined),
    onKeyChange: vi.fn(async (key: string, cb: (value: unknown) => void) => {
      listeners.set(key, cb);
      return () => listeners.delete(key);
    }),
  };
  const listeners = new Map<string, (value: unknown) => void>();
  return { values, store, listeners, load: vi.fn(async () => store) };
});

vi.mock("@tauri-apps/plugin-store", () => ({ load: mocks.load, Store: class {} }));

import {
  DEFAULT_CONTROLS,
  DEFAULT_SHORTCUTS,
  loadControls,
  onControlsChanged,
  saveControls,
  loadMarkerPos,
  loadShortcuts,
  loadTool,
  saveColor,
  saveMarkerPos,
  saveOnboardingDone,
  saveShortcuts,
  saveTextSize,
  saveWidth,
  settingsStore,
} from "./settings";

describe("settings", () => {
  beforeEach(() => {
    mocks.values.clear();
    mocks.store.get.mockClear();
    mocks.store.set.mockClear();
    mocks.store.save.mockClear();
  });

  it("loads one shared Tauri store and sanitizes tool values", async () => {
    expect(await settingsStore()).toBe(await settingsStore());
    expect(mocks.load).toHaveBeenCalledWith("settings.json");
    await expect(loadTool()).resolves.toEqual({
      color: "#FF2D95",
      width: "medium",
      textSize: "small",
    });

    mocks.values.set("color", "#00AEEF");
    mocks.values.set("width", "thick");
    mocks.values.set("textSize", "large");
    await expect(loadTool()).resolves.toEqual({
      color: "#00AEEF",
      width: "thick",
      textSize: "large",
    });

    mocks.values.set("color", "invalid");
    // 프로토타입 상속 키도 설정 스키마의 유효한 키로 오인하면 안 된다.
    mocks.values.set("width", "constructor");
    mocks.values.set("textSize", "__proto__");
    await expect(loadTool()).resolves.toEqual({
      color: "#FF2D95",
      width: "medium",
      textSize: "small",
    });
  });

  it("persists tool and marker choices", async () => {
    await saveColor("#2ED573");
    await saveWidth("thin");
    await saveTextSize("xlarge");
    await saveMarkerPos({ xRatio: 0.25, yRatio: 0.75 });
    expect(mocks.values.get("color")).toBe("#2ED573");
    expect(mocks.values.get("width")).toBe("thin");
    expect(mocks.values.get("textSize")).toBe("xlarge");
    await expect(loadMarkerPos()).resolves.toEqual({ xRatio: 0.25, yRatio: 0.75 });
    expect(mocks.store.save).toHaveBeenCalledTimes(4);
  });

  it("returns null when a marker position has never been stored", async () => {
    await expect(loadMarkerPos()).resolves.toBeNull();
  });

  it("merges shortcut defaults and persists updates", async () => {
    mocks.values.set("shortcuts", { toggle: "Control+KeyD" });
    await expect(loadShortcuts()).resolves.toEqual({ ...DEFAULT_SHORTCUTS, toggle: "Control+KeyD" });
    const next = { toggle: "Alt+KeyD", board: "Alt+KeyB", clear: "Alt+KeyC", text: "KeyY" };
    await saveShortcuts(next);
    expect(mocks.values.get("shortcuts")).toEqual(next);
  });

  it("fills the text default for legacy three-key stores", async () => {
    // text 키 도입 전 스토어 — merge가 자동으로 기본값(KeyT)을 보완한다
    mocks.values.set("shortcuts", { toggle: "Alt+Tab", board: "Shift+Alt+Tab", clear: "Alt+Backspace" });
    await expect(loadShortcuts()).resolves.toEqual({
      toggle: "Alt+Tab",
      board: "Shift+Alt+Tab",
      clear: "Alt+Backspace",
      text: "KeyT",
    });
  });

  it("migrates a legacy KeyC text shortcut while preserving KeyE", async () => {
    const legacy = {
      toggle: "Alt+Tab",
      board: "Shift+Alt+Tab",
      clear: "Alt+Backspace",
      text: "KeyC",
    };
    mocks.values.set("shortcuts", legacy);

    await expect(loadShortcuts()).resolves.toEqual({ ...legacy, text: "KeyT" });
    expect(mocks.store.set).toHaveBeenCalledWith("shortcuts", { ...legacy, text: "KeyT" });
    expect(mocks.store.save).toHaveBeenCalledOnce();

    mocks.store.set.mockClear();
    mocks.store.save.mockClear();
    mocks.values.set("shortcuts", { ...legacy, text: "KeyE" });
    await expect(loadShortcuts()).resolves.toEqual({ ...legacy, text: "KeyE" });
    expect(mocks.store.set).not.toHaveBeenCalled();
    expect(mocks.store.save).not.toHaveBeenCalled();
  });

  it("marks onboarding complete", async () => {
    await saveOnboardingDone();
    expect(mocks.values.get("onboardingDone")).toBe(true);
    expect(mocks.store.save).toHaveBeenCalledOnce();
  });

  it("loads control keys with defaults and keeps a valid stored set", async () => {
    await expect(loadControls()).resolves.toEqual(DEFAULT_CONTROLS);
    const stored = { move: "Shift", duplicate: "Alt", delete: "Cmd", size: ["Alt"], color: "KeyQ" };
    mocks.values.set("controls", stored);
    await expect(loadControls()).resolves.toEqual(stored);
  });

  it("falls back per group when stored control keys break the rules", async () => {
    mocks.values.set("controls", {
      move: "Alt",
      duplicate: "Shift",
      delete: "Alt",
      size: ["Hyper"],
      color: "Escape",
    });
    await expect(loadControls()).resolves.toEqual(DEFAULT_CONTROLS);
    mocks.values.set("controls", { move: "Control", size: [], color: "KeyQ" });
    await expect(loadControls()).resolves.toEqual({ ...DEFAULT_CONTROLS, color: "KeyQ" });
    mocks.values.set("controls", "broken");
    await expect(loadControls()).resolves.toEqual(DEFAULT_CONTROLS);
  });

  it("persists control keys and notifies other windows of changes", async () => {
    const next = { ...DEFAULT_CONTROLS, duplicate: "Shift" as const };
    await saveControls(next);
    expect(mocks.values.get("controls")).toEqual(next);
    expect(mocks.store.save).toHaveBeenCalledOnce();

    const seen: unknown[] = [];
    const unlisten = await onControlsChanged((controls) => seen.push(controls));
    mocks.listeners.get("controls")?.(next);
    mocks.listeners.get("controls")?.(undefined);
    expect(seen).toEqual([next, DEFAULT_CONTROLS]);
    unlisten();
    expect(mocks.listeners.has("controls")).toBe(false);
  });

  it("keeps a KeyC text shortcut once the quick color palette uses another key", async () => {
    const shortcuts = { toggle: "Alt+Tab", board: "Shift+Alt+Tab", clear: "Alt+Backspace", text: "KeyC" };
    mocks.values.set("shortcuts", shortcuts);
    mocks.values.set("controls", { ...DEFAULT_CONTROLS, color: "KeyQ" });
    await expect(loadShortcuts()).resolves.toEqual(shortcuts);
    expect(mocks.store.set).not.toHaveBeenCalled();
  });
});
