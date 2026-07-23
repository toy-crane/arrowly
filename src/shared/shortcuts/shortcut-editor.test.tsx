import { mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsApp } from "../../settings/settings-app";
import { ShortcutEditor } from "./shortcut-editor";

const settings = vi.hoisted(() => ({
  loadShortcuts: vi.fn(),
  saveShortcuts: vi.fn(),
}));

vi.mock("../settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../settings")>();
  return { ...actual, loadShortcuts: settings.loadShortcuts, saveShortcuts: settings.saveShortcuts };
});

const defaults = { toggle: "Alt+Tab", board: "Shift+Alt+Tab", clear: "Alt+Backspace", text: "KeyT" };

function field(label: string): HTMLButtonElement {
  const labelNode = screen.getByText(label);
  return labelNode.parentElement!.querySelector("button")!;
}

describe("ShortcutEditor", () => {
  const calls: { cmd: string; args: Record<string, unknown> }[] = [];
  let failCommand: string | null;

  beforeEach(() => {
    calls.length = 0;
    failCommand = null;
    settings.loadShortcuts.mockReset().mockResolvedValue(defaults);
    settings.saveShortcuts.mockReset().mockResolvedValue(undefined);
    mockIPC((cmd, args) => {
      calls.push({ cmd, args: args as Record<string, unknown> });
      if (cmd === failCommand) throw "error:shortcut_in_use";
    });
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

    // 텍스트 행: 수식키 없는 단독 키 허용, 전역 등록 검증(try_register_shortcut) 없음
    await user.click(field("Write text"));
    fireEvent.keyDown(window, { code: "KeyY" });
    await waitFor(() =>
      expect(settings.saveShortcuts).toHaveBeenLastCalledWith({ ...defaults, text: "KeyY" }),
    );
    const textTry = calls.find(({ cmd, args }) => cmd === "try_register_shortcut" && args.id === "text");
    expect(textTry).toBeUndefined();
    expect(calls.some(({ cmd, args }) => cmd === "apply_shortcuts" && args.text === "KeyY")).toBe(true);

    // 다른 행은 여전히 수식키 필수
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

  it("reserves plain E for the fixed mark deletion tool", async () => {
    const user = userEvent.setup();
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Write text")).toHaveTextContent("T"));

    await user.click(field("Write text"));
    fireEvent.keyDown(window, { code: "KeyE" });

    expect(await screen.findByText("E continuously deletes marks. Try another key.")).toBeInTheDocument();
    expect(settings.saveShortcuts).not.toHaveBeenCalled();
  });

  it("reports backend conflicts, resets defaults, and restores shortcuts on unmount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ShortcutEditor />);
    await waitFor(() => expect(field("Start or stop drawing")).toHaveTextContent("⌥"));

    failCommand = "try_register_shortcut";
    await user.click(field("Start or stop drawing"));
    fireEvent.keyDown(window, { code: "KeyD", altKey: true });
    expect(
      await screen.findByText("Another app is using this shortcut. Try another combination."),
    ).toBeInTheDocument();

    failCommand = null;
    const resetButtons = screen.getAllByRole("button", { name: "Default" });
    await user.click(resetButtons[0]);
    await waitFor(() => expect(settings.saveShortcuts).toHaveBeenCalledWith(defaults));

    failCommand = "apply_shortcuts";
    await user.click(resetButtons[1]);
    expect(
      await screen.findByText("Another app is using this shortcut. Try another combination."),
    ).toBeInTheDocument();

    failCommand = null;
    await user.click(field("Start or stop drawing"));
    unmount();
    await waitFor(() => expect(calls.some(({ cmd }) => cmd === "resume_shortcuts")).toBe(true));
  });

  it("renders the complete settings surface including fixed shortcuts", async () => {
    render(<SettingsApp />);
    expect(screen.getByRole("heading", { name: "Shortcuts & gestures" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Customizable shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fixed controls" })).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
    expect(screen.getByText("Finish drawing")).toBeInTheDocument();
    expect(screen.getByText("Write text")).toBeInTheDocument();
    expect(screen.queryByText("Fixed")).not.toBeInTheDocument();
    await waitFor(() => expect(settings.loadShortcuts).toHaveBeenCalled());
  });

  it("can hide reset actions while preserving all four editable rows", async () => {
    render(<ShortcutEditor showReset={false} />);
    for (const label of [
      "Start or stop drawing",
      "Turn blackboard on or off",
      "Clear all marks",
      "Write text",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Default" })).not.toBeInTheDocument();
    await waitFor(() => expect(field("Write text")).toHaveTextContent("T"));
  });
});
