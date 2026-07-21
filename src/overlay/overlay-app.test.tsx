import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverlayApp } from "./overlay-app";

const mocks = vi.hoisted(() => ({
  loadShortcuts: vi.fn(),
  loadTool: vi.fn(),
  saveColor: vi.fn(),
  saveTextSize: vi.fn(),
  saveWidth: vi.fn(),
  applyPenCursor: vi.fn(),
  applyTextCursor: vi.fn(),
  resetCursor: vi.fn(),
}));

vi.mock("../shared/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/settings")>();
  return {
    ...actual,
    loadShortcuts: mocks.loadShortcuts,
    loadTool: mocks.loadTool,
    saveColor: mocks.saveColor,
    saveTextSize: mocks.saveTextSize,
    saveWidth: mocks.saveWidth,
  };
});

vi.mock("./cursor", () => ({
  applyPenCursor: mocks.applyPenCursor,
  applyTextCursor: mocks.applyTextCursor,
  resetCursor: mocks.resetCursor,
}));
vi.mock("./drawing-canvas", () => ({
  DrawingCanvas: ({
    clearAccel,
    textAccel,
    textMode,
    textSizeKey,
    onTextModeChange,
  }: {
    clearAccel: string;
    textAccel: string;
    textMode: boolean;
    textSizeKey: string;
    onTextModeChange: (on: boolean) => void;
  }) => (
    <div
      data-testid="canvas"
      data-textmode={String(textMode)}
      data-textaccel={textAccel}
      data-textsize={textSizeKey}
    >
      <button onClick={() => onTextModeChange(!textMode)}>text-toggle</button>
      {clearAccel}
    </div>
  ),
}));
vi.mock("./marker", () => ({
  Marker: (props: {
    color: string;
    widthKey: string;
    board: boolean;
    textMode: boolean;
    textSizeKey: string;
    onColorChange: (value: "#00AEEF") => void;
    onWidthChange: (value: "thick") => void;
    onTextSizeChange: (value: "large") => void;
    onBoardToggle: () => void;
    onTextToggle: () => void;
  }) => (
    <div data-testid="marker" data-board={String(props.board)} data-textmode={String(props.textMode)}>
      <button onClick={() => props.onColorChange("#00AEEF")}>color</button>
      <button onClick={() => props.onWidthChange("thick")}>width</button>
      <button onClick={() => props.onTextSizeChange("large")}>text-size</button>
      <button onClick={props.onBoardToggle}>board</button>
      <button onClick={props.onTextToggle}>marker-text</button>
      <span>{props.color}:{props.widthKey}:{props.textSizeKey}</span>
    </div>
  ),
}));

describe("OverlayApp", () => {
  const commands: string[] = [];

  beforeEach(() => {
    commands.length = 0;
    mocks.loadShortcuts.mockReset().mockResolvedValue({ toggle: "Alt+Tab", board: "Shift+Alt+Tab", clear: "Control+KeyK", text: "KeyT" });
    mocks.loadTool
      .mockReset()
      .mockResolvedValue({ color: "#2ED573", width: "thin", textSize: "small" });
    mocks.saveColor.mockReset().mockResolvedValue(undefined);
    mocks.saveTextSize.mockReset().mockResolvedValue(undefined);
    mocks.saveWidth.mockReset().mockResolvedValue(undefined);
    mocks.applyPenCursor.mockReset();
    mocks.applyTextCursor.mockReset();
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
    fireEvent.click(screen.getByRole("button", { name: "text-size" }));
    fireEvent.click(screen.getByRole("button", { name: "board" }));
    expect(mocks.saveColor).toHaveBeenCalledWith("#00AEEF");
    expect(mocks.saveWidth).toHaveBeenCalledWith("thick");
    expect(mocks.saveTextSize).toHaveBeenCalledWith("large");
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-textsize", "large");
    expect(commands).toContain("toggle_board");

    await act(async () => {
      await emit("board-changed", { on: false });
      await emit("shortcuts-changed", { clear: "Alt+KeyC", text: "KeyY" });
      await emit("marker-hidden-changed", { hidden: true });
    });
    expect(screen.getByTestId("canvas")).toHaveTextContent("Alt+KeyC");
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-textaccel", "KeyY");
    expect(screen.queryByTestId("marker")).not.toBeInTheDocument();

    await act(async () => {
      await emit("marker-hidden-changed", { hidden: false });
      await emit("mode-changed", { drawing: false, board: false });
    });
    expect(mocks.resetCursor.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("switches to the I-beam cursor in text mode and resets it when drawing ends", async () => {
    render(<OverlayApp />);
    await act(async () => {
      await emit("mode-changed", { drawing: true, board: false });
    });
    expect(mocks.applyTextCursor).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "text-toggle" }));
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-textmode", "true");
    expect(mocks.applyTextCursor).toHaveBeenCalledOnce();

    // 마커 T 셀도 같은 토글을 움직인다
    fireEvent.click(screen.getByRole("button", { name: "marker-text" }));
    expect(screen.getByTestId("marker")).toHaveAttribute("data-textmode", "false");
    fireEvent.click(screen.getByRole("button", { name: "marker-text" }));
    expect(screen.getByTestId("marker")).toHaveAttribute("data-textmode", "true");
    fireEvent.click(screen.getByRole("button", { name: "marker-text" }));

    // 텍스트 도구 해제 후 → 펜 커서 복귀 (직전 클릭으로 이미 해제 상태)
    mocks.applyPenCursor.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "text-toggle" }));
    expect(mocks.applyTextCursor.mock.calls.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole("button", { name: "text-toggle" }));
    expect(mocks.applyPenCursor).toHaveBeenCalledOnce();

    // 트레이 "텍스트 입력" 이벤트도 같은 토글을 켠다
    await act(async () => {
      await emit("enter-text-mode");
    });
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-textmode", "true");

    // 그리기 종료는 텍스트 도구 선택도 함께 폐기한다
    await act(async () => {
      await emit("mode-changed", { drawing: false, board: false });
    });
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-textmode", "false");
  });
});
