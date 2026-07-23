import { useRef, useState } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installCanvasMock } from "../../test/canvas";
import { type TextSizeKey } from "../shared/constants";
import { DrawingCanvas, type DrawingCanvasHandle } from "./drawing-canvas";
import { Marker } from "./marker";
import type { DrawingTool } from "./tools";

const settings = vi.hoisted(() => ({
  loadMarkerPos: vi.fn(),
  saveMarkerPos: vi.fn(),
}));

vi.mock("../shared/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/settings")>();
  return { ...actual, loadMarkerPos: settings.loadMarkerPos, saveMarkerPos: settings.saveMarkerPos };
});

let contexts: CanvasRenderingContext2D[];

/** OverlayApp과 동일한 배선으로 실물 DrawingCanvas + Marker를 함께 렌더링한다 —
 * TextEditor의 캡처 리스너와 마커 클릭 사이의 레이스는 교차 컴포넌트라 단독 테스트로는 못 잡는다. */
function Harness() {
  const [tool, setTool] = useState<DrawingTool>("freehand");
  const [defaultTextSize, setDefaultTextSize] = useState<TextSizeKey>("medium");
  const [editingTextSize, setEditingTextSize] = useState<TextSizeKey | null>(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  return (
    <>
      <DrawingCanvas
        ref={canvasRef}
        color="#FF2D95"
        widthKey="medium"
        textSizeKey={defaultTextSize}
        clearAccel="Alt+Backspace"
        textAccel="KeyT"
        tool={tool}
        onEditingTextSizeChange={setEditingTextSize}
        onNewTextSizeCommit={setDefaultTextSize}
        onToolChange={setTool}
      />
      <Marker
        color="#FF2D95"
        widthKey="medium"
        textSizeKey={editingTextSize ?? defaultTextSize}
        board={false}
        tool={tool}
        drawingTool="freehand"
        onColorChange={() => {}}
        onWidthChange={() => {}}
        onTextSizeChange={(size) => {
          if (canvasRef.current?.isEditing()) canvasRef.current.setTextSize(size);
          else setDefaultTextSize(size);
        }}
        onBoardToggle={() => {}}
        onToolChange={(next) => {
          if (canvasRef.current?.isEditing()) canvasRef.current.finishTextEditing();
          setTool(next);
        }}
      />
    </>
  );
}

async function openEditorWithDraft(container: HTMLElement) {
  fireEvent.keyDown(window, { code: "KeyT" });
  const live = container.querySelectorAll("canvas")[1];
  fireEvent.pointerDown(live, { button: 0, clientX: 120, clientY: 90, pointerId: 1 });
  await act(async () => {
    await Promise.resolve();
  });
  const input = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "초안" } });
  return input;
}

describe("text mode and marker interplay", () => {
  beforeEach(() => {
    contexts = installCanvasMock();
    mockIPC(() => undefined, { shouldMockEvents: true });
    settings.loadMarkerPos.mockReset().mockResolvedValue(null);
    settings.saveMarkerPos.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(1);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
  });

  it("clicking the freehand tool while editing commits the draft and returns to pen mode", async () => {
    const { container } = render(<Harness />);
    const [baseCtx] = contexts;
    await openEditorWithDraft(container);

    const freehand = screen.getByRole("button", { name: "Drawing tool" });
    // 실제 클릭의 이벤트 순서를 재현: pointerdown(캡처 리스너 대상) → click(토글 핸들러)
    fireEvent.pointerDown(freehand, { button: 0, pointerId: 2 });
    fireEvent.click(freehand);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(freehand).toHaveAttribute("aria-pressed", "true");
    expect(baseCtx.fillText).toHaveBeenCalledWith("초안", 120, 90);
  });

  it("opens text properties from the active text tool without closing the draft", async () => {
    const { container } = render(<Harness />);
    await openEditorWithDraft(container);

    const textTool = screen.getByRole("button", { name: "Text tool" });
    fireEvent.pointerDown(textTool, { button: 0, pointerId: 2 });
    fireEvent.click(textTool);

    expect(screen.getByRole("group", { name: "Text properties" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("초안");
  });

  it("changes the active editor size from text properties without closing the draft", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const input = await openEditorWithDraft(container);
    input.setSelectionRange(1, 1);

    await user.click(screen.getByRole("button", { name: "Text tool" }));
    await user.click(screen.getByRole("button", { name: "Text size 80px" }));

    expect(input).toHaveAttribute("data-text-size-px", "80");
    expect(input).toHaveValue("초안");
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(1);
    expect(screen.queryByRole("group", { name: "Text properties" })).not.toBeInTheDocument();
  });
});
