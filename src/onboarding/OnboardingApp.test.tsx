import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingApp } from "./OnboardingApp";

const mocks = vi.hoisted(() => ({
  loadShortcuts: vi.fn(),
  saveOnboardingDone: vi.fn(),
}));

vi.mock("../shared/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/settings")>();
  return {
    ...actual,
    loadShortcuts: mocks.loadShortcuts,
    saveOnboardingDone: mocks.saveOnboardingDone,
  };
});
vi.mock("../shared/ShortcutEditor", () => ({ ShortcutEditor: () => <div>shortcut editor</div> }));
vi.mock("./MiniCanvas", () => ({
  MiniCanvas: ({ onFirstStroke, boardable }: { onFirstStroke?: () => void; boardable?: boolean }) => (
    <button onClick={onFirstStroke}>{boardable ? "board canvas" : "draw canvas"}</button>
  ),
}));

describe("OnboardingApp", () => {
  const commands: string[] = [];

  beforeEach(() => {
    commands.length = 0;
    mocks.loadShortcuts.mockReset().mockResolvedValue({ toggle: "Alt+Tab", board: "Control+Cmd+KeyB", clear: "Alt+Backspace" });
    mocks.saveOnboardingDone.mockReset().mockResolvedValue(undefined);
    mockWindows("onboarding");
    mockIPC((cmd) => void commands.push(cmd));
  });

  it("requires drawing, teaches correction, supports back navigation and persists completion", async () => {
    const user = userEvent.setup();
    render(<OnboardingApp />);
    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "draw canvas" }));
    expect(next).toBeEnabled();
    await user.click(next);

    expect(screen.getByRole("heading", { name: "Undo and exit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "board canvas" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("⌃")).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Try drawing" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("heading", { name: "Choose your shortcuts" })).toBeInTheDocument();
    expect(screen.getByText("shortcut editor")).toBeInTheDocument();
    expect(screen.getByLabelText("Arrow icon")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Get started" }));

    await waitFor(() => expect(mocks.saveOnboardingDone).toHaveBeenCalledOnce());
    await waitFor(() => expect(commands.some((cmd) => cmd.includes("close"))).toBe(true));
  });
});
