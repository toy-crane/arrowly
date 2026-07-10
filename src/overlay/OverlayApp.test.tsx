import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverlayApp } from "./OverlayApp";

const mocks = vi.hoisted(() => ({
  loadShortcuts: vi.fn(),
  loadTool: vi.fn(),
  saveColor: vi.fn(),
  saveWidth: vi.fn(),
  applyPenCursor: vi.fn(),
  resetCursor: vi.fn(),
}));

vi.mock("../shared/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/settings")>();
  return {
    ...actual,
    loadShortcuts: mocks.loadShortcuts,
    loadTool: mocks.loadTool,
    saveColor: mocks.saveColor,
    saveWidth: mocks.saveWidth,
  };
});

vi.mock("./cursor", () => ({ applyPenCursor: mocks.applyPenCursor, resetCursor: mocks.resetCursor }));
vi.mock("./DrawingCanvas", () => ({
  DrawingCanvas: ({ clearAccel }: { clearAccel: string }) => <div data-testid="canvas">{clearAccel}</div>,
}));
vi.mock("./Marker", () => ({
  Marker: (props: {
    color: string;
    widthKey: string;
    board: boolean;
    onColorChange: (value: "#00AEEF") => void;
    onWidthChange: (value: "thick") => void;
    onBoardToggle: () => void;
  }) => (
    <div data-testid="marker" data-board={String(props.board)}>
      <button onClick={() => props.onColorChange("#00AEEF")}>color</button>
      <button onClick={() => props.onWidthChange("thick")}>width</button>
      <button onClick={props.onBoardToggle}>board</button>
      <span>{props.color}:{props.widthKey}</span>
    </div>
  ),
}));

describe("OverlayApp", () => {
  const commands: string[] = [];

  beforeEach(() => {
    commands.length = 0;
    mocks.loadShortcuts.mockReset().mockResolvedValue({ toggle: "Alt+Tab", board: "Shift+Alt+Tab", clear: "Control+KeyK" });
    mocks.loadTool.mockReset().mockResolvedValue({ color: "#2ED573", width: "thin" });
    mocks.saveColor.mockReset().mockResolvedValue(undefined);
    mocks.saveWidth.mockReset().mockResolvedValue(undefined);
    mocks.applyPenCursor.mockReset();
    mocks.resetCursor.mockReset();
    mockIPC((cmd) => void commands.push(cmd), { shouldMockEvents: true });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  });

  it("synchronizes settings and Rust events and routes marker actions", async () => {
    const { container } = render(<OverlayApp />);
    expect(mocks.resetCursor).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("canvas")).toHaveTextContent("Control+KeyK"));

    await act(async () => {
      await emit("mode-changed", { drawing: true, board: true });
    });
    expect(screen.getByTestId("marker")).toHaveAttribute("data-board", "true");
    expect(mocks.applyPenCursor).toHaveBeenCalledWith("#2ED573", 3.2);
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "color" }));
    fireEvent.click(screen.getByRole("button", { name: "width" }));
    fireEvent.click(screen.getByRole("button", { name: "board" }));
    expect(mocks.saveColor).toHaveBeenCalledWith("#00AEEF");
    expect(mocks.saveWidth).toHaveBeenCalledWith("thick");
    expect(commands).toContain("toggle_board");

    await act(async () => {
      await emit("board-changed", { on: false });
      await emit("shortcuts-changed", { clear: "Alt+KeyC" });
      await emit("marker-hidden-changed", { hidden: true });
    });
    expect(screen.getByTestId("canvas")).toHaveTextContent("Alt+KeyC");
    expect(screen.queryByTestId("marker")).not.toBeInTheDocument();

    await act(async () => {
      await emit("marker-hidden-changed", { hidden: false });
      await emit("mode-changed", { drawing: false, board: false });
    });
    expect(mocks.resetCursor.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
