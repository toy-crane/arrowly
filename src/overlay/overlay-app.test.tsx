import { forwardRef, useImperativeHandle } from "react";
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
  pingAt: vi.fn(),
  isEditing: vi.fn(),
  finishTextEditing: vi.fn(),
  setTextSize: vi.fn(),
  dismissQuickColorPalette: vi.fn(),
  drawMarksForMagnifier: vi.fn(),
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
  DrawingCanvas: forwardRef(function MockDrawingCanvas({
      clearAccel,
      textAccel,
      tool,
      textSizeKey,
      onToolChange,
      onWidthStep,
      onTextSizeStep,
      onColorPick,
      onQuickColorPaletteOpenChange,
      onPointerPing,
    }: {
      clearAccel: string;
      textAccel: string;
      tool: string;
      textSizeKey: string;
      onToolChange: (tool: "freehand" | "text" | "delete" | "magnifier") => void;
      onWidthStep: (delta: -1 | 1) => void;
      onTextSizeStep: (delta: -1 | 1) => void;
      onColorPick: (color: "#FFD400") => void;
      onQuickColorPaletteOpenChange: (open: boolean) => void;
      onPointerPing: (point: { x: number; y: number }) => void;
    }, ref) {
      useImperativeHandle(ref, () => ({
        isEditing: mocks.isEditing,
        finishTextEditing: mocks.finishTextEditing,
        setTextSize: mocks.setTextSize,
        dismissQuickColorPalette: () => {
          mocks.dismissQuickColorPalette();
          onQuickColorPaletteOpenChange(false);
        },
        drawMarksForMagnifier: mocks.drawMarksForMagnifier,
      }));
      return (
        <div
          data-testid="canvas"
          data-tool={tool}
          data-textaccel={textAccel}
          data-textsize={textSizeKey}
        >
          <button onClick={() => onToolChange(tool === "text" ? "freehand" : "text")}>text-toggle</button>
          <button onClick={() => onToolChange("delete")}>delete-tool</button>
          <button onClick={() => onWidthStep(1)}>width-step</button>
          <button onClick={() => onTextSizeStep(-1)}>text-step</button>
          <button onClick={() => onColorPick("#FFD400")}>color-key</button>
          <button onClick={() => onQuickColorPaletteOpenChange(true)}>quick-palette</button>
          <button onClick={() => onPointerPing({ x: 80, y: 90 })}>pointer-ping</button>
          {clearAccel}
        </div>
      );
    }),
}));
vi.mock("./pointer-ping-layer", () => ({
  PointerPingLayer: forwardRef(function MockPointerPingLayer(_, ref) {
    useImperativeHandle(ref, () => ({ pingAt: mocks.pingAt }));
    return <div data-testid="ping-layer" />;
  }),
}));
vi.mock("./marker", () => ({
  Marker: (props: {
    color: string;
    widthKey: string;
    board: boolean;
    tool: string;
    drawingTool: string;
    textSizeKey: string;
    onColorChange: (value: "#00AEEF") => void;
    onWidthChange: (value: "thick") => void;
    onTextSizeChange: (value: "large") => void;
    onBoardToggle: () => void;
    onToolChange: (tool: "freehand" | "text" | "delete" | "magnifier" | "triangle") => void;
    quickColorPaletteOpen: boolean;
    onInteractionStart: () => void;
  }) => (
    <div
      data-testid="marker"
      data-board={String(props.board)}
      data-tool={props.tool}
      data-drawing-tool={props.drawingTool}
      data-quick-color={String(props.quickColorPaletteOpen)}
      onPointerDown={props.onInteractionStart}
    >
      <button onClick={() => props.onColorChange("#00AEEF")}>color</button>
      <button onClick={() => props.onWidthChange("thick")}>width</button>
      <button onClick={() => props.onTextSizeChange("large")}>text-size</button>
      <button onClick={props.onBoardToggle}>board</button>
      <button onClick={() => props.onToolChange(props.tool === "text" ? "freehand" : "text")}>marker-text</button>
      <button onClick={() => props.onToolChange("triangle")}>marker-triangle</button>
      <button onClick={() => props.onToolChange("delete")}>marker-delete</button>
      <button onClick={() => props.onToolChange("magnifier")}>marker-magnifier</button>
      <span>{props.color}:{props.widthKey}:{props.textSizeKey}</span>
    </div>
  ),
}));

describe("OverlayApp", () => {
  const commands: string[] = [];
  let magnifierAccessGranted = true;
  let magnifierAccessError: string | null = null;
  let magnifierCaptureError: string | null = null;

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
    mocks.pingAt.mockReset();
    mocks.isEditing.mockReset().mockReturnValue(false);
    mocks.finishTextEditing.mockReset();
    mocks.setTextSize.mockReset();
    mocks.dismissQuickColorPalette.mockReset();
    mocks.drawMarksForMagnifier.mockReset();
    magnifierAccessGranted = true;
    magnifierAccessError = null;
    magnifierCaptureError = null;
    mockIPC((cmd) => {
      commands.push(cmd);
      if (cmd === "request_magnifier_access") {
        if (magnifierAccessError) throw magnifierAccessError;
        return magnifierAccessGranted;
      }
      if (cmd === "capture_magnifier_frame") {
        if (magnifierCaptureError) throw magnifierCaptureError;
        return new ArrayBuffer(348 * 176 * 4);
      }
      return undefined;
    }, { shouldMockEvents: true });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
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
    fireEvent.click(screen.getByRole("button", { name: "pointer-ping" }));
    expect(mocks.pingAt).toHaveBeenCalledWith({ x: 80, y: 90 });

    fireEvent.click(screen.getByRole("button", { name: "quick-palette" }));
    expect(screen.getByTestId("marker")).toHaveAttribute("data-quick-color", "true");
    fireEvent.pointerDown(screen.getByTestId("marker"));
    expect(mocks.dismissQuickColorPalette).toHaveBeenCalledOnce();
    expect(screen.getByTestId("marker")).toHaveAttribute("data-quick-color", "false");

    // 캔버스의 빠른 색 선택도 잉크 색을 저장하고 커서에 즉시 반영한다.
    // (직전 width 클릭으로 굵기는 thick=6px 상태)
    fireEvent.click(screen.getByRole("button", { name: "color-key" }));
    expect(mocks.saveColor).toHaveBeenLastCalledWith("#FFD400");
    expect(mocks.applyPenCursor).toHaveBeenLastCalledWith("#FFD400", 6);

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
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "text");
    expect(mocks.applyTextCursor).toHaveBeenCalledOnce();

    // 마커 T 셀도 같은 토글을 움직인다
    fireEvent.click(screen.getByRole("button", { name: "marker-text" }));
    expect(screen.getByTestId("marker")).toHaveAttribute("data-tool", "freehand");
    fireEvent.click(screen.getByRole("button", { name: "marker-text" }));
    expect(screen.getByTestId("marker")).toHaveAttribute("data-tool", "text");
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
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "text");

    // 그리기 종료는 텍스트 도구 선택도 함께 폐기한다
    await act(async () => {
      await emit("mode-changed", { drawing: false, board: false });
    });
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "freehand");
  });

  it("shares geometric drawing, deletion and active-tool sizing state between marker and canvas", async () => {
    render(<OverlayApp />);
    await waitFor(() => expect(screen.getByTestId("canvas")).toHaveAttribute("data-textsize", "small"));
    await act(async () => {
      await emit("mode-changed", { drawing: true, board: false });
    });

    fireEvent.click(screen.getByRole("button", { name: "marker-triangle" }));
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "triangle");
    expect(mocks.applyPenCursor).toHaveBeenLastCalledWith("#2ED573", 3.2);

    fireEvent.click(screen.getByRole("button", { name: "width-step" }));
    expect(mocks.saveWidth).toHaveBeenCalledWith("medium");

    fireEvent.click(screen.getByRole("button", { name: "marker-text" }));
    fireEvent.click(screen.getByRole("button", { name: "text-step" }));
    expect(mocks.saveTextSize).toHaveBeenCalledWith("xsmall");

    mocks.isEditing.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "marker-delete" }));
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "text");
    expect(mocks.finishTextEditing).not.toHaveBeenCalled();

    mocks.isEditing.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "marker-delete" }));
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "delete");
    expect(mocks.resetCursor).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "marker-delete" }));
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "text");
  });

  it("remembers the selected geometric tool while text is temporarily active", async () => {
    render(<OverlayApp />);
    await act(async () => {
      await emit("mode-changed", { drawing: true, board: false });
    });

    fireEvent.click(screen.getByRole("button", { name: "marker-triangle" }));
    expect(screen.getByTestId("marker")).toHaveAttribute("data-drawing-tool", "triangle");

    fireEvent.click(screen.getByRole("button", { name: "marker-text" }));
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "text");
    expect(screen.getByTestId("marker")).toHaveAttribute("data-drawing-tool", "triangle");

    fireEvent.click(screen.getByRole("button", { name: "text-toggle" }));
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "triangle");
  });

  it("starts the magnifier after permission, keeps it through blackboard changes and restores drawing on exit", async () => {
    render(<OverlayApp />);
    await act(async () => {
      await emit("mode-changed", { drawing: true, board: false });
    });

    fireEvent.click(screen.getByRole("button", { name: "marker-triangle" }));
    fireEvent.click(screen.getByRole("button", { name: "marker-magnifier" }));
    await waitFor(() => expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "magnifier"));
    expect(screen.getByRole("img", { name: "Magnifier lens" })).toBeInTheDocument();

    await act(async () => {
      await emit("board-changed", { on: true });
    });
    expect(screen.getByRole("img", { name: "Magnifier lens" })).toBeInTheDocument();

    await act(async () => {
      await emit("mode-changed", { drawing: false, board: true });
    });
    expect(screen.queryByRole("img", { name: "Magnifier lens" })).not.toBeInTheDocument();
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "triangle");
  });

  it("keeps the current tool and offers System Settings when capture permission is denied", async () => {
    magnifierAccessGranted = false;
    render(<OverlayApp />);
    await act(async () => {
      await emit("mode-changed", { drawing: true, board: false });
    });

    fireEvent.click(screen.getByRole("button", { name: "marker-triangle" }));
    fireEvent.click(screen.getByRole("button", { name: "marker-magnifier" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Screen recording access is required");
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "triangle");
    expect(screen.queryByRole("img", { name: "Magnifier lens" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open System Settings" }));
    expect(commands).toContain("open_screen_recording_settings");
  });

  it("keeps the current tool and reports when screen capture is unavailable", async () => {
    magnifierAccessError = "error:screen_capture_unavailable";
    render(<OverlayApp />);
    await act(async () => {
      await emit("mode-changed", { drawing: true, board: false });
    });

    fireEvent.click(screen.getByRole("button", { name: "marker-triangle" }));
    fireEvent.click(screen.getByRole("button", { name: "marker-magnifier" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Arrowly can no longer read this screen",
    );
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "triangle");
  });

  it("closes the lens and restores the remembered drawing tool when capture is lost", async () => {
    magnifierCaptureError = "error:screen_capture_permission";
    render(<OverlayApp />);
    await act(async () => {
      await emit("mode-changed", { drawing: true, board: false });
    });

    fireEvent.click(screen.getByRole("button", { name: "marker-triangle" }));
    fireEvent.click(screen.getByRole("button", { name: "marker-magnifier" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Magnifier stopped");
    expect(screen.queryByRole("img", { name: "Magnifier lens" })).not.toBeInTheDocument();
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "triangle");
  });
});
