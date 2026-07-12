import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it } from "vitest";
import { applyShortcuts, resumeShortcuts, suspendShortcuts, toggleBoard, tryRegisterShortcut } from "./index";

describe("ipc commands", () => {
  const calls: { cmd: string; args: Record<string, unknown> }[] = [];

  beforeEach(() => {
    calls.length = 0;
    mockIPC((cmd, args) => void calls.push({ cmd, args: args as Record<string, unknown> }));
  });

  it("maps wrappers to Rust command names", async () => {
    await toggleBoard();
    await suspendShortcuts();
    await resumeShortcuts();
    expect(calls.map(({ cmd }) => cmd)).toEqual(["toggle_board", "suspend_shortcuts", "resume_shortcuts"]);
  });

  it("passes recorder arguments with exact top-level keys", async () => {
    await tryRegisterShortcut("board", "Control+Cmd+KeyB");
    expect(calls[0]).toEqual({
      cmd: "try_register_shortcut",
      args: { id: "board", accelerator: "Control+Cmd+KeyB" },
    });
  });

  it("spreads shortcuts as top-level keys for apply_shortcuts", async () => {
    const next = { toggle: "Alt+Tab", board: "Shift+Alt+Tab", clear: "Alt+Backspace" };
    await applyShortcuts(next);
    // Rust 파라미터는 top-level 키 — 중첩 래핑되면 조용히 깨진다
    expect(calls[0]).toEqual({ cmd: "apply_shortcuts", args: next });
  });
});
