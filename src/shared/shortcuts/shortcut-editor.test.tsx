import { mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsApp } from "../../settings/settings-app";
import { DEFAULT_CONTROLS } from "../settings";
import { ShortcutEditor } from "./shortcut-editor";

const settings = vi.hoisted(() => ({
  loadShortcuts: vi.fn(),
  saveShortcuts: vi.fn(),
  loadControls: vi.fn(),
  saveControls: vi.fn(),
}));

vi.mock("../settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../settings")>();
  return {
    ...actual,
    loadShortcuts: settings.loadShortcuts,
    saveShortcuts: settings.saveShortcuts,
    loadControls: settings.loadControls,
    saveControls: settings.saveControls,
  };
});

const defaults = { toggle: "Alt+Tab", board: "Shift+Alt+Tab", clear: "Alt+Backspace", text: "KeyT" };

function field(label: string): HTMLButtonElement {
  return screen.getByRole("button", { name: label });
}

function row(label: string): HTMLElement {
  return field(label).closest("[data-row]") as HTMLElement;
}

function pressModifiers(...keys: ("Meta" | "Alt" | "Shift" | "Control")[]) {
  const flags = { metaKey: false, altKey: false, shiftKey: false, ctrlKey: false };
  const flag = { Meta: "metaKey", Alt: "altKey", Shift: "shiftKey", Control: "ctrlKey" } as const;
  for (const key of keys) {
    flags[flag[key]] = true;
    fireEvent.keyDown(window, { key, code: `${key}Left`, ...flags });
  }
  fireEvent.keyUp(window, { key: keys[keys.length - 1], code: `${keys[keys.length - 1]}Left`, ...flags, [flag[keys[keys.length - 1]]]: false });
}

describe("ShortcutEditor", () => {
  const calls: { cmd: string; args: Record<string, unknown> }[] = [];
  let failCommand: string | null;

  beforeEach(() => {
    calls.length = 0;
    failCommand = null;
    settings.loadShortcuts.mockReset().mockResolvedValue(defaults);
    settings.saveShortcuts.mockReset().mockResolvedValue(undefined);
    settings.loadControls.mockReset().mockResolvedValue(DEFAULT_CONTROLS);
    settings.saveControls.mockReset().mockResolvedValue(undefined);
    mockIPC((cmd, args) => {
      calls.push({ cmd, args: args as Record<string, unknown> });
      if (cmd === failCommand) throw "error:shortcut_in_use";
    });
  });

  it("groups every editable control under drawing, marks and tools with key symbols only", async () => {
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Start or stop drawing")).toHaveTextContent("⌥⇥"));

    const groups = screen.getAllByRole("group").map((group) => ({
      name: group.getAttribute("aria-label"),
      rows: within(group)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    }));
    expect(groups).toEqual([
      { name: "Drawing", rows: ["Start or stop drawing", "Turn blackboard on or off", "Clear all marks"] },
      { name: "Marks", rows: ["Move a mark", "Duplicate a mark", "Delete one mark"] },
      { name: "Tools", rows: ["Write text", "Adjust tool size", "Choose color"] },
    ]);
    expect(field("Move a mark")).toHaveTextContent(/^⌘$/);
    expect(field("Duplicate a mark")).toHaveTextContent(/^⌥⌘$/);
    expect(field("Delete one mark")).toHaveTextContent(/^⌥$/);
    expect(field("Adjust tool size")).toHaveTextContent(/^⌘±$/);
    expect(field("Choose color")).toHaveTextContent(/^C$/);
    // 기본값 행에는 되돌리기 버튼이 없다
    expect(screen.queryByRole("button", { name: "Default" })).not.toBeInTheDocument();
  });

  it("records global and local shortcuts, ignores modifier-only input, and supports cancel", async () => {
    const user = userEvent.setup();
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Start or stop drawing")).toHaveTextContent("⌥"));

    await user.click(field("Start or stop drawing"));
    expect(field("Start or stop drawing")).toHaveTextContent("Enter a new combination");
    fireEvent.keyDown(window, { code: "AltLeft", altKey: true });
    expect(field("Start or stop drawing")).toHaveTextContent("Enter a new combination");
    fireEvent.keyDown(window, { code: "KeyD", altKey: true });
    await waitFor(() => expect(settings.saveShortcuts).toHaveBeenCalledWith({ ...defaults, toggle: "Alt+KeyD" }));
    expect(calls.some(({ cmd }) => cmd === "try_register_shortcut")).toBe(true);
    expect(calls.some(({ cmd }) => cmd === "apply_shortcuts")).toBe(true);

    await user.click(field("Clear all marks"));
    fireEvent.keyDown(window, { code: "KeyC", altKey: true });
    await waitFor(() => expect(settings.saveShortcuts).toHaveBeenLastCalledWith({ ...defaults, toggle: "Alt+KeyD", clear: "Alt+KeyC" }));
    const clearTry = calls.find(({ cmd, args }) => cmd === "try_register_shortcut" && args.id === "clear");
    expect(clearTry).toBeUndefined();

    await user.click(field("Turn blackboard on or off"));
    fireEvent.keyDown(window, { code: "Escape" });
    await waitFor(() => expect(calls.filter(({ cmd }) => cmd === "resume_shortcuts").length).toBeGreaterThan(0));

    await user.click(field("Turn blackboard on or off"));
    await user.click(field("Turn blackboard on or off"));
    expect(calls.filter(({ cmd }) => cmd === "resume_shortcuts").length).toBeGreaterThan(1);
  });

  it("shows local validation for modifier, undo and duplicate rules", async () => {
    const user = userEvent.setup();
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Start or stop drawing")).toHaveTextContent("⌥"));

    await user.click(field("Start or stop drawing"));
    fireEvent.keyDown(window, { code: "KeyD" });
    expect(await screen.findByText("Add at least one modifier key.")).toBeInTheDocument();

    await user.click(field("Clear all marks"));
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
    expect(
      await screen.findByText("This shortcut is already used for Undo. Try another combination."),
    ).toBeInTheDocument();

    await user.click(field("Turn blackboard on or off"));
    fireEvent.keyDown(window, { code: "Tab", altKey: true });
    expect(
      await screen.findByText("This shortcut is already assigned. Try another combination."),
    ).toBeInTheDocument();
  });

  it("allows a plain key for the text shortcut only", async () => {
    const user = userEvent.setup();
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Write text")).toHaveTextContent("T"));

    await user.click(field("Write text"));
    fireEvent.keyDown(window, { code: "KeyY" });
    await waitFor(() =>
      expect(settings.saveShortcuts).toHaveBeenLastCalledWith({ ...defaults, text: "KeyY" }),
    );
    const textTry = calls.find(({ cmd, args }) => cmd === "try_register_shortcut" && args.id === "text");
    expect(textTry).toBeUndefined();
    expect(calls.some(({ cmd, args }) => cmd === "apply_shortcuts" && args.text === "KeyY")).toBe(true);

    await user.click(field("Start or stop drawing"));
    fireEvent.keyDown(window, { code: "KeyD" });
    expect(await screen.findByText("Add at least one modifier key.")).toBeInTheDocument();
  });

  it("rejects undo and duplicates on the text row", async () => {
    const user = userEvent.setup();
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Write text")).toHaveTextContent("T"));

    await user.click(field("Write text"));
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
    expect(
      await screen.findByText("This shortcut is already used for Undo. Try another combination."),
    ).toBeInTheDocument();

    await user.click(field("Write text"));
    fireEvent.keyDown(window, { code: "Backspace", altKey: true });
    expect(
      await screen.findByText("This shortcut is already assigned. Try another combination."),
    ).toBeInTheDocument();
  });

  it("reserves the quick color palette key for text and frees C once the palette key changes", async () => {
    const user = userEvent.setup();
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Write text")).toHaveTextContent("T"));

    await user.click(field("Write text"));
    fireEvent.keyDown(window, { code: "KeyC" });
    expect(
      await screen.findByText("This key opens the quick color palette. Try another key."),
    ).toBeInTheDocument();
    expect(settings.saveShortcuts).not.toHaveBeenCalled();

    await user.click(field("Choose color"));
    expect(field("Choose color")).toHaveTextContent("Press a key");
    fireEvent.keyDown(window, { code: "KeyQ" });
    await waitFor(() =>
      expect(settings.saveControls).toHaveBeenLastCalledWith({ ...DEFAULT_CONTROLS, color: "KeyQ" }),
    );
    expect(field("Choose color")).toHaveTextContent(/^Q/);

    await user.click(field("Write text"));
    fireEvent.keyDown(window, { code: "KeyQ" });
    expect(
      await screen.findByText("This key opens the quick color palette. Try another key."),
    ).toBeInTheDocument();

    await user.click(field("Write text"));
    fireEvent.keyDown(window, { code: "KeyC" });
    await waitFor(() =>
      expect(settings.saveShortcuts).toHaveBeenLastCalledWith({ ...defaults, text: "KeyC" }),
    );

    await user.click(field("Choose color"));
    fireEvent.keyDown(window, { code: "KeyC" });
    expect(
      await screen.findByText("Write text already uses this key. Try another key."),
    ).toBeInTheDocument();
    await user.click(field("Choose color"));
    fireEvent.keyDown(window, { code: "KeyR", altKey: true });
    expect(
      await screen.findByText("Choose a letter or number key without modifiers."),
    ).toBeInTheDocument();
  });

  it("records a duplicate add-on key on release and moves duplicate with the move key", async () => {
    const user = userEvent.setup();
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Duplicate a mark")).toHaveTextContent("⌥⌘"));

    await user.click(field("Duplicate a mark"));
    expect(field("Duplicate a mark")).toHaveTextContent("Press modifier keys");
    fireEvent.keyDown(window, { key: "KeyX", code: "KeyX", metaKey: true });
    expect(field("Duplicate a mark")).toHaveTextContent("Press modifier keys");
    pressModifiers("Meta", "Shift");
    await waitFor(() =>
      expect(settings.saveControls).toHaveBeenLastCalledWith({ ...DEFAULT_CONTROLS, duplicate: "Shift" }),
    );
    expect(field("Duplicate a mark")).toHaveTextContent(/^⇧⌘/);

    await user.click(field("Move a mark"));
    pressModifiers("Alt");
    expect(
      await within(row("Move a mark")).findByText(
        "Another mark gesture already uses this key. Choose another key.",
      ),
    ).toBeInTheDocument();

    await user.click(field("Move a mark"));
    pressModifiers("Control");
    expect(
      await screen.findByText("⌃ works as a right-click on macOS. Choose ⌘, ⌥ or ⇧."),
    ).toBeInTheDocument();
  });

  it("rejects a duplicate key without the move key and keeps the previous value", async () => {
    const user = userEvent.setup();
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Duplicate a mark")).toHaveTextContent("⌥⌘"));

    await user.click(field("Duplicate a mark"));
    pressModifiers("Alt");
    expect(
      await within(row("Duplicate a mark")).findByText("Hold the move key (⌘) plus one other modifier key."),
    ).toBeInTheDocument();
    expect(settings.saveControls).not.toHaveBeenCalled();
    expect(field("Duplicate a mark")).toHaveTextContent(/^⌥⌘$/);

    await user.click(field("Delete one mark"));
    pressModifiers("Meta");
    expect(
      await within(row("Delete one mark")).findByText(
        "Another mark gesture already uses this key. Choose another key.",
      ),
    ).toBeInTheDocument();

    await user.click(field("Adjust tool size"));
    pressModifiers("Alt");
    await waitFor(() =>
      expect(settings.saveControls).toHaveBeenLastCalledWith({ ...DEFAULT_CONTROLS, size: ["Alt"] }),
    );
    expect(field("Adjust tool size")).toHaveTextContent(/^⌥±/);

    await user.click(field("Move a mark"));
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(field("Move a mark")).toHaveTextContent(/^⌘$/));
  });

  it("resets one changed row to its default from its hover action", async () => {
    settings.loadControls.mockResolvedValue({ ...DEFAULT_CONTROLS, duplicate: "Shift", color: "KeyQ" });
    const user = userEvent.setup();
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Duplicate a mark")).toHaveTextContent("⇧⌘"));

    const resets = () => screen.getAllByRole("button", { name: "Default" });
    expect(resets()).toHaveLength(2);
    await user.click(within(row("Duplicate a mark")).getByRole("button", { name: "Default" }));
    await waitFor(() =>
      expect(settings.saveControls).toHaveBeenLastCalledWith({ ...DEFAULT_CONTROLS, color: "KeyQ" }),
    );
    expect(field("Duplicate a mark")).toHaveTextContent(/^⌥⌘/);
    expect(resets()).toHaveLength(1);

    await user.click(within(row("Choose color")).getByRole("button", { name: "Default" }));
    await waitFor(() => expect(settings.saveControls).toHaveBeenLastCalledWith(DEFAULT_CONTROLS));
    expect(screen.queryByRole("button", { name: "Default" })).not.toBeInTheDocument();
  });

  it("reports backend conflicts, resets shortcut defaults, and restores shortcuts on unmount", async () => {
    settings.loadShortcuts.mockResolvedValue({ ...defaults, toggle: "Alt+KeyD", board: "Alt+KeyB" });
    const user = userEvent.setup();
    const { unmount } = render(<ShortcutEditor />);
    await waitFor(() => expect(field("Start or stop drawing")).toHaveTextContent("⌥D"));

    failCommand = "try_register_shortcut";
    await user.click(field("Start or stop drawing"));
    fireEvent.keyDown(window, { code: "KeyK", altKey: true });
    expect(
      await screen.findByText("Another app is using this shortcut. Try another combination."),
    ).toBeInTheDocument();

    failCommand = null;
    await user.click(within(row("Start or stop drawing")).getByRole("button", { name: "Default" }));
    await waitFor(() =>
      expect(settings.saveShortcuts).toHaveBeenCalledWith({ ...defaults, board: "Alt+KeyB" }),
    );

    failCommand = "apply_shortcuts";
    await user.click(within(row("Turn blackboard on or off")).getByRole("button", { name: "Default" }));
    expect(
      await screen.findByText("Another app is using this shortcut. Try another combination."),
    ).toBeInTheDocument();

    failCommand = null;
    await user.click(field("Start or stop drawing"));
    unmount();
    await waitFor(() => expect(calls.some(({ cmd }) => cmd === "resume_shortcuts")).toBe(true));
  });

  it("renders the complete settings surface with the fixed group last", async () => {
    render(<SettingsApp />);
    expect(screen.getByRole("heading", { name: "Shortcuts & gestures" })).toBeInTheDocument();
    const names = screen.getAllByRole("group").map((group) => group.getAttribute("aria-label"));
    expect(names).toEqual(["Drawing", "Marks", "Tools", "Fixed"]);
    await waitFor(() => expect(settings.loadShortcuts).toHaveBeenCalled());
    await waitFor(() => expect(settings.loadControls).toHaveBeenCalled());
  });

  it("offers no duplicate reset when the move key already uses the default add-on key", async () => {
    settings.loadControls.mockResolvedValue({
      ...DEFAULT_CONTROLS,
      move: "Alt",
      duplicate: "Shift",
      delete: "Cmd",
    });
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Duplicate a mark")).toHaveTextContent("⌥⇧"));
    expect(within(row("Duplicate a mark")).queryByRole("button", { name: "Default" })).not.toBeInTheDocument();
    expect(within(row("Move a mark")).getByRole("button", { name: "Default" })).toBeInTheDocument();
  });
});
