import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  const store = {
    get: vi.fn(async (key: string) => values.get(key)),
    set: vi.fn(async (key: string, value: unknown) => void values.set(key, value)),
    save: vi.fn(async () => undefined),
  };
  return { values, store, load: vi.fn(async () => store) };
});

vi.mock("@tauri-apps/plugin-store", () => ({ load: mocks.load, Store: class {} }));

import {
  DEFAULT_SHORTCUTS,
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
      textSize: "medium",
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
    mocks.values.set("width", "giant");
    mocks.values.set("textSize", "giant");
    await expect(loadTool()).resolves.toEqual({
      color: "#FF2D95",
      width: "medium",
      textSize: "medium",
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

  it("marks onboarding complete", async () => {
    await saveOnboardingDone();
    expect(mocks.values.get("onboardingDone")).toBe(true);
    expect(mocks.store.save).toHaveBeenCalledOnce();
  });
});
