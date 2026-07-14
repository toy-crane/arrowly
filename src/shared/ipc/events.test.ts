import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  onBoardChanged,
  onClearAll,
  onMarkerHiddenChanged,
  onModeChanged,
  onShortcutsChanged,
} from "./index";

describe("ipc events", () => {
  beforeEach(() => {
    mockIPC(() => undefined, { shouldMockEvents: true });
  });

  it("delivers each Rust event payload to its typed handler", async () => {
    const mode = vi.fn();
    const board = vi.fn();
    const marker = vi.fn();
    const shortcuts = vi.fn();
    const clear = vi.fn();
    const unlisteners = await Promise.all([
      onModeChanged(mode),
      onBoardChanged(board),
      onMarkerHiddenChanged(marker),
      onShortcutsChanged(shortcuts),
      onClearAll(clear),
    ]);

    await emit("mode-changed", { drawing: true, board: false });
    await emit("board-changed", { on: true });
    await emit("marker-hidden-changed", { hidden: true });
    await emit("shortcuts-changed", { board: "Control+Cmd+KeyB", clear: "Alt+KeyC" });
    await emit("clear-all");

    expect(mode).toHaveBeenCalledWith({ drawing: true, board: false });
    expect(board).toHaveBeenCalledWith({ on: true });
    expect(marker).toHaveBeenCalledWith({ hidden: true });
    expect(shortcuts).toHaveBeenCalledWith({ board: "Control+Cmd+KeyB", clear: "Alt+KeyC" });
    expect(clear).toHaveBeenCalledWith();

    for (const unlisten of unlisteners) unlisten();
    await emit("clear-all");
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
