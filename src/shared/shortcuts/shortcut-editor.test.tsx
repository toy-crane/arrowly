import { mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    await waitFor(() => expect(field("Toggle drawing")).toHaveTextContent("⌥"));

    await user.click(field("Toggle drawing"));
    expect(field("Toggle drawing")).toHaveTextContent("Press a new shortcut");
    fireEvent.keyDown(window, { code: "AltLeft", altKey: true });
    expect(field("Toggle drawing")).toHaveTextContent("Press a new shortcut");
    fireEvent.keyDown(window, { code: "KeyD", altKey: true });
    await waitFor(() => expect(settings.saveShortcuts).toHaveBeenCalledWith({ ...defaults, toggle: "Alt+KeyD" }));
    expect(calls.some(({ cmd }) => cmd === "try_register_shortcut")).toBe(true);
    expect(calls.some(({ cmd }) => cmd === "apply_shortcuts")).toBe(true);

    await user.click(field("Clear all"));
    fireEvent.keyDown(window, { code: "KeyC", altKey: true });
    await waitFor(() => expect(settings.saveShortcuts).toHaveBeenLastCalledWith({ ...defaults, toggle: "Alt+KeyD", clear: "Alt+KeyC" }));
    const clearTry = calls.find(({ cmd, args }) => cmd === "try_register_shortcut" && args.id === "clear");
    expect(clearTry).toBeUndefined();

    await user.click(field("Toggle blackboard"));
    fireEvent.keyDown(window, { code: "Escape" });
    await waitFor(() => expect(calls.filter(({ cmd }) => cmd === "resume_shortcuts").length).toBeGreaterThan(0));

    await user.click(field("Toggle blackboard"));
    await user.click(field("Toggle blackboard"));
    expect(calls.filter(({ cmd }) => cmd === "resume_shortcuts").length).toBeGreaterThan(1);
  });

  it("shows local validation for modifier, undo and duplicate rules", async () => {
    const user = userEvent.setup();
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Toggle drawing")).toHaveTextContent("⌥"));

    await user.click(field("Toggle drawing"));
    fireEvent.keyDown(window, { code: "KeyD" });
    expect(await screen.findByText("Use at least one modifier key")).toBeInTheDocument();

    await user.click(field("Clear all"));
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
    expect(await screen.findByText("This key is used for Undo")).toBeInTheDocument();

    await user.click(field("Toggle blackboard"));
    fireEvent.keyDown(window, { code: "Tab", altKey: true });
    expect(await screen.findByText("This shortcut is already assigned")).toBeInTheDocument();
  });

  it("allows a plain key for the text shortcut only", async () => {
    const user = userEvent.setup();
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Typing text")).toHaveTextContent("T"));

    // 텍스트 행: 수식키 없는 단독 키 허용, 전역 등록 검증(try_register_shortcut) 없음
    await user.click(field("Typing text"));
    fireEvent.keyDown(window, { code: "KeyY" });
    await waitFor(() =>
      expect(settings.saveShortcuts).toHaveBeenLastCalledWith({ ...defaults, text: "KeyY" }),
    );
    const textTry = calls.find(({ cmd, args }) => cmd === "try_register_shortcut" && args.id === "text");
    expect(textTry).toBeUndefined();
    expect(calls.some(({ cmd, args }) => cmd === "apply_shortcuts" && args.text === "KeyY")).toBe(true);

    // 다른 행은 여전히 수식키 필수
    await user.click(field("Toggle drawing"));
    fireEvent.keyDown(window, { code: "KeyD" });
    expect(await screen.findByText("Use at least one modifier key")).toBeInTheDocument();
  });

  it("rejects undo and duplicates on the text row", async () => {
    const user = userEvent.setup();
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Typing text")).toHaveTextContent("T"));

    await user.click(field("Typing text"));
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
    expect(await screen.findByText("This key is used for Undo")).toBeInTheDocument();

    await user.click(field("Typing text"));
    fireEvent.keyDown(window, { code: "Backspace", altKey: true });
    expect(await screen.findByText("This shortcut is already assigned")).toBeInTheDocument();
  });

  it("reserves plain E for the fixed mark deletion tool", async () => {
    const user = userEvent.setup();
    render(<ShortcutEditor />);
    await waitFor(() => expect(field("Typing text")).toHaveTextContent("T"));

    await user.click(field("Typing text"));
    fireEvent.keyDown(window, { code: "KeyE" });

    expect(await screen.findByText("E is reserved for the mark deletion tool")).toBeInTheDocument();
    expect(settings.saveShortcuts).not.toHaveBeenCalled();
  });

  it("reports backend conflicts, resets defaults, and restores shortcuts on unmount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ShortcutEditor />);
    await waitFor(() => expect(field("Toggle drawing")).toHaveTextContent("⌥"));

    failCommand = "try_register_shortcut";
    await user.click(field("Toggle drawing"));
    fireEvent.keyDown(window, { code: "KeyD", altKey: true });
    expect(await screen.findByText("This combination is already used by another app")).toBeInTheDocument();

    failCommand = null;
    const resetButtons = screen.getAllByRole("button", { name: "Reset" });
    await user.click(resetButtons[0]);
    await waitFor(() => expect(settings.saveShortcuts).toHaveBeenCalledWith(defaults));

    failCommand = "apply_shortcuts";
    await user.click(resetButtons[1]);
    expect(await screen.findByText("This combination is already used by another app")).toBeInTheDocument();

    failCommand = null;
    await user.click(field("Toggle drawing"));
    unmount();
    await waitFor(() => expect(calls.some(({ cmd }) => cmd === "resume_shortcuts")).toBe(true));
  });

  it("renders the complete settings surface including fixed shortcuts", async () => {
    render(<SettingsApp />);
    expect(screen.getByRole("heading", { name: "Shortcuts" })).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
    expect(screen.getByText("Exit")).toBeInTheDocument();
    expect(screen.getByText("Typing text")).toBeInTheDocument();
    expect(within(screen.getByText("Undo").parentElement!).getByText("Fixed")).toBeInTheDocument();
    await waitFor(() => expect(settings.loadShortcuts).toHaveBeenCalled());
  });

  it("shows all four rows in the onboarding configuration too", async () => {
    // 온보딩 ③에서도 네 단축키를 모두 설정한다 (확정) — Reset만 숨긴다
    render(<ShortcutEditor showReset={false} />);
    for (const label of ["Toggle drawing", "Toggle blackboard", "Clear all", "Typing text"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    await waitFor(() => expect(field("Typing text")).toHaveTextContent("T"));
  });
});
