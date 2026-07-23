import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingApp } from "./onboarding-app";

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

vi.mock("./mini-canvas", () => ({
  MiniCanvas: ({
    phase,
    correctionStep,
    onFirstStroke,
    onMoved,
    onDeleted,
    onRestored,
    onCleared,
  }: {
    phase: "draw" | "correct" | "finish";
    correctionStep: "move" | "delete" | "undo" | "complete";
    onFirstStroke: () => void;
    onMoved: () => void;
    onDeleted: () => void;
    onRestored: () => void;
    onCleared: () => void;
  }) => (
    <div>
      {phase === "draw" && <button onClick={onFirstStroke}>draw canvas</button>}
      {phase === "correct" && correctionStep === "move" && <button onClick={onMoved}>move mark</button>}
      {phase === "correct" && correctionStep === "delete" && (
        <button onClick={onDeleted}>delete mark</button>
      )}
      {phase === "correct" && correctionStep === "undo" && (
        <button onClick={onRestored}>restore mark</button>
      )}
      {phase === "finish" && <button onClick={onCleared}>clear canvas</button>}
    </div>
  ),
}));

describe("OnboardingApp", () => {
  const commands: string[] = [];

  beforeEach(() => {
    commands.length = 0;
    mocks.loadShortcuts.mockReset().mockResolvedValue({
      toggle: "Control+Cmd+KeyB",
      board: "Shift+Alt+Tab",
      clear: "Alt+Backspace",
      text: "KeyT",
    });
    mocks.saveOnboardingDone.mockReset().mockResolvedValue(undefined);
    mockWindows("onboarding");
    mockIPC((cmd) => void commands.push(cmd));
  });

  it("guides one mark through correction, clearing and Escape completion", async () => {
    const user = userEvent.setup();
    render(<OnboardingApp />);

    expect(screen.getByRole("heading", { name: "Draw one mark" })).toBeInTheDocument();
    expect(screen.getByText("Start drawing")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("⌃")).toBeInTheDocument());
    expect(screen.getByText("⌘")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    const firstNext = screen.getByRole("button", { name: "Next" });
    expect(firstNext).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "draw canvas" }));
    expect(firstNext).toBeEnabled();
    await user.click(firstNext);

    expect(screen.getByRole("heading", { name: "Fix the mark you just drew" })).toBeInTheDocument();
    expect(screen.getByText("Move a mark")).toBeInTheDocument();
    const correctionNext = screen.getByRole("button", { name: "Next" });
    expect(correctionNext).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "move mark" }));
    await user.click(screen.getByRole("button", { name: "delete mark" }));
    await user.click(screen.getByRole("button", { name: "restore mark" }));
    expect(correctionNext).toBeEnabled();
    await user.click(correctionNext);

    expect(screen.getByRole("heading", { name: "Clear the screen and finish" })).toBeInTheDocument();
    expect(screen.getByText("Clear all marks")).toBeInTheDocument();
    expect(screen.queryByText("Press Esc to finish onboarding")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "clear canvas" }));
    expect(screen.getByText("Press Esc to finish onboarding")).toBeInTheDocument();

    fireEvent.keyDown(window, { code: "Escape", key: "Escape" });
    await waitFor(() => expect(mocks.saveOnboardingDone).toHaveBeenCalledOnce());
    await waitFor(() => expect(commands.some((cmd) => cmd.includes("close"))).toBe(true));
    expect(screen.queryByText("shortcut editor")).not.toBeInTheDocument();
    expect(screen.queryByText("Toggle blackboard")).not.toBeInTheDocument();
  });
});
