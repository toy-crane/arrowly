import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyShortcuts,
  captureMagnifierFrame,
  openScreenRecordingSettings,
  requestMagnifierAccess,
  resumeShortcuts,
  setTextEditing,
  suspendShortcuts,
  toggleBoard,
  tryRegisterShortcut,
  stopMagnifierCapture,
} from "./index";

describe("ipc commands", () => {
  const calls: { cmd: string; args: Record<string, unknown> }[] = [];

  beforeEach(() => {
    calls.length = 0;
    mockIPC((cmd, args) => void calls.push({ cmd, args: args as Record<string, unknown> }));
  });

  it("maps wrappers to Rust command names", async () => {
    await toggleBoard();
    await setTextEditing(true);
    await suspendShortcuts();
    await resumeShortcuts();
    expect(calls).toEqual([
      { cmd: "toggle_board", args: {} },
      { cmd: "set_text_editing", args: { editing: true } },
      { cmd: "suspend_shortcuts", args: {} },
      { cmd: "resume_shortcuts", args: {} },
    ]);
  });

  it("passes recorder arguments with exact top-level keys", async () => {
    await tryRegisterShortcut("board", "Control+Cmd+KeyB");
    expect(calls[0]).toEqual({
      cmd: "try_register_shortcut",
      args: { id: "board", accelerator: "Control+Cmd+KeyB" },
    });
  });

  it("spreads shortcuts as top-level keys for apply_shortcuts", async () => {
    const next = { toggle: "Alt+Tab", board: "Shift+Alt+Tab", clear: "Alt+Backspace", text: "KeyT" };
    await applyShortcuts(next);
    // Rust 파라미터는 top-level 키 — 중첩 래핑되면 조용히 깨진다
    expect(calls[0]).toEqual({ cmd: "apply_shortcuts", args: next });
  });

  it("keeps magnifier permission and capture arguments aligned with Rust", async () => {
    await requestMagnifierAccess();
    await captureMagnifierFrame({
      x: 12.5,
      y: 30,
      width: 174,
      height: 88,
      outputWidth: 696,
      outputHeight: 352,
    });
    await stopMagnifierCapture();
    await openScreenRecordingSettings();

    expect(calls).toEqual([
      { cmd: "request_magnifier_access", args: {} },
      {
        cmd: "capture_magnifier_frame",
        args: {
          x: 12.5,
          y: 30,
          width: 174,
          height: 88,
          outputWidth: 696,
          outputHeight: 352,
        },
      },
      { cmd: "stop_magnifier_capture", args: {} },
      { cmd: "open_screen_recording_settings", args: {} },
    ]);
  });
});
