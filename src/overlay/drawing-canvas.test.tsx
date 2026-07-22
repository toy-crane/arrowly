import { useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, Mock } from "vitest";
import { installCanvasMock } from "../../test/canvas";
import { DrawingCanvas } from "./drawing-canvas";
import type { DrawingTool } from "./tools";

let contexts: CanvasRenderingContext2D[];

async function flushTextEditingStart() {
  await act(async () => {
    await Promise.resolve();
  });
}

const baseProps = {
  color: "#FF2D95",
  widthKey: "medium" as const,
  textSizeKey: "medium" as const,
  clearAccel: "Alt+Backspace",
  textAccel: "KeyT",
};

/** 부모(OverlayApp)의 현재 도구 소유를 흉내 내는 하네스. */
function Harness({
  initialTextMode = false,
  initialTool,
  onChange = vi.fn() as Mock,
  onWidthStep = vi.fn(),
  onTextSizeStep = vi.fn(),
  onPointerPing = vi.fn(),
  onEditingSize = vi.fn(),
  onNewTextSizeCommit = vi.fn(),
}: {
  initialTextMode?: boolean;
  initialTool?: DrawingTool;
  onChange?: Mock;
  onWidthStep?: (delta: -1 | 1) => void;
  onTextSizeStep?: (delta: -1 | 1) => void;
  onPointerPing?: (point: { x: number; y: number }) => void;
  onEditingSize?: (size: "xsmall" | "small" | "medium" | "large" | "xlarge" | null) => void;
  onNewTextSizeCommit?: (size: "xsmall" | "small" | "medium" | "large" | "xlarge") => void;
}) {
  const [tool, setTool] = useState<DrawingTool>(initialTool ?? (initialTextMode ? "text" : "freehand"));
  return (
    <>
      <button data-testid="force-off" onClick={() => setTool("freehand")} />
      <DrawingCanvas
        {...baseProps}
        tool={tool}
        onEditingTextSizeChange={onEditingSize}
        onNewTextSizeCommit={onNewTextSizeCommit}
        onWidthStep={onWidthStep}
        onTextSizeStep={onTextSizeStep}
        onPointerPing={onPointerPing}
        onToolChange={(next) => {
          onChange(next === "text");
          setTool(next);
        }}
      />
    </>
  );
}

describe("DrawingCanvas", () => {
  beforeEach(() => {
    contexts = installCanvasMock();
    mockIPC(() => undefined, { shouldMockEvents: true });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(1);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
  });

  it("draws pointer input, batches coalesced points and handles correction shortcuts", () => {
    const { container, unmount } = render(
      <DrawingCanvas {...baseProps} tool="freehand" onToolChange={vi.fn()} />,
    );
    const [base, live] = Array.from(container.querySelectorAll("canvas"));
    expect(base.width).toBe(1600);
    expect(live.height).toBe(1200);

    fireEvent.pointerMove(live, { clientX: 1, clientY: 1 });
    fireEvent.pointerUp(live, { clientX: 1, clientY: 1 });
    fireEvent.pointerDown(live, { button: 1, clientX: 1, clientY: 1, pointerId: 1 });

    fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 20, pointerId: 2 });
    const move = new Event("pointermove") as PointerEvent;
    Object.defineProperties(move, {
      clientX: { value: 20 },
      clientY: { value: 30 },
      pointerId: { value: 2 }, // 포인터 격리 가드를 통과해야 coalesced 경로가 실행된다
      getCoalescedEvents: {
        value: () => [
          { clientX: 15, clientY: 25 },
          { clientX: 20, clientY: 30 },
        ],
      },
    });
    live.dispatchEvent(move);
    fireEvent.pointerUp(live, { clientX: 25, clientY: 35, pointerId: 2 });

    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { code: "Backspace", altKey: true });
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true, altKey: true });

    fireEvent.pointerDown(live, { button: 0, clientX: 5, clientY: 5, pointerId: 3 });
    fireEvent.pointerCancel(live, { pointerId: 3 });
    unmount();
    expect(cancelAnimationFrame).not.toHaveBeenCalled(); // 동기 rAF는 이미 완료되어 취소할 예약이 없다
  });

  it("responds to resize and mocked Tauri mode/clear events without deleting hidden strokes", async () => {
    const { container } = render(
      <DrawingCanvas
        {...baseProps}
        color="#00AEEF"
        widthKey="thin"
        clearAccel="Control+KeyK"
        tool="freehand"
        onToolChange={vi.fn()}
      />,
    );
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 3, clientY: 4, pointerId: 1 });
    fireEvent.pointerMove(live, { clientX: 5, clientY: 6, pointerId: 1 });

    await act(async () => {
      await emit("mode-changed", { drawing: false });
      await emit("mode-changed", { drawing: true });
      await emit("clear-all");
    });

    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 0 });
    fireEvent(window, new Event("resize"));
    expect(live.width).toBe(800);
    fireEvent.keyDown(window, { code: "KeyK", ctrlKey: true });
  });

  it("arms and disarms text mode with the text key", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(window, { code: "KeyT" });
    expect(onChange).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(window, { code: "KeyT" });
    expect(onChange).toHaveBeenLastCalledWith(false);
    // 수식키가 붙으면 텍스트 키가 아니다
    fireEvent.keyDown(window, { code: "KeyT", metaKey: true });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("places the editor on click in text mode instead of drawing, then commits one text mark", async () => {
    const onChange = vi.fn();
    const { container } = render(<Harness initialTextMode onChange={onChange} />);
    const [baseCtx, liveCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];

    fireEvent.pointerDown(live, { button: 0, clientX: 120, clientY: 90, pointerId: 1 });
    await flushTextEditingStart();
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(liveCtx.stroke).not.toHaveBeenCalled(); // 텍스트 도구 클릭은 획을 시작하지 않는다

    fireEvent.change(input, { target: { value: "서버 캐시" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(baseCtx.fillText).toHaveBeenCalledOnce();
    expect(baseCtx.fillText).toHaveBeenCalledWith("서버 캐시", 120, 90);
    expect(onChange).toHaveBeenLastCalledWith(false); // one-shot 펜 복귀
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    // 확정된 텍스트 마크는 ⌘Z 한 번에 통째로 사라진다 (renderBase에 fillText 재호출 없음)
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
    expect(baseCtx.fillText).toHaveBeenCalledOnce();
  });

  it("discards an open TextEditor draft when Clear All arrives via the Tauri event", async () => {
    const { container } = render(<Harness initialTextMode />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    await flushTextEditingStart();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "폐기될 초안" } });

    // 트레이 메뉴 경로 — DOM keydown을 거치지 않으므로 editable 가드가 못 막는다
    await act(async () => {
      await emit("clear-all");
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(baseCtx.fillText).not.toHaveBeenCalled();
  });

  it("commits the current text when Rust emits the first-Escape finish event", async () => {
    const onChange = vi.fn();
    const { container } = render(<Harness initialTextMode onChange={onChange} />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 30, clientY: 40, pointerId: 1 });
    await flushTextEditingStart();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Esc 확정" } });

    await act(async () => {
      await emit("finish-text-editing");
    });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(baseCtx.fillText).toHaveBeenCalledWith("Esc 확정", 30, 40);
  });

  it("does not open an editor when Rust rejects text editing outside drawing mode", async () => {
    mockIPC((cmd) => {
      if (cmd === "set_text_editing") throw new Error("error:not_drawing");
    }, { shouldMockEvents: true });
    const onChange = vi.fn();
    const { container } = render(<Harness initialTextMode onChange={onChange} />);
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 30, clientY: 40, pointerId: 1 });
    await flushTextEditingStart();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("does not reopen the editor when text mode turns off before Rust accepts editing", async () => {
    let acceptEditing!: () => void;
    const pendingEditing = new Promise<void>((resolve) => {
      acceptEditing = resolve;
    });
    const editingStates: boolean[] = [];
    mockIPC((cmd, args) => {
      if (cmd !== "set_text_editing") return undefined;
      const editing = (args as { editing: boolean }).editing;
      editingStates.push(editing);
      return editing ? pendingEditing : undefined;
    }, { shouldMockEvents: true });

    const { container } = render(<Harness initialTextMode />);
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 30, clientY: 40, pointerId: 1 });
    fireEvent.click(screen.getByTestId("force-off"));

    await act(async () => {
      acceptEditing();
      await pendingEditing;
    });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(editingStates[0]).toBe(true);
    expect(editingStates).toContain(false);
  });

  it("cancels an in-progress stroke when the text key is pressed mid-drag", () => {
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(live, { clientX: 60, clientY: 60, pointerId: 1 });

    fireEvent.keyDown(window, { code: "KeyT" }); // 그리던 획을 끊고 텍스트 도구로
    expect(onChange).toHaveBeenLastCalledWith(true);

    fireEvent.pointerUp(live, { clientX: 80, clientY: 80, pointerId: 1 });
    expect(baseCtx.stroke).not.toHaveBeenCalled(); // 끊긴 획은 커밋되지 않는다
  });

  it("isolates concurrent pointers so a second pointer cannot hijack the gesture", () => {
    const { container } = render(<Harness />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerDown(live, { button: 0, clientX: 500, clientY: 500, pointerId: 2 }); // 무시
    fireEvent.pointerMove(live, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(live, { clientX: 999, clientY: 999, pointerId: 2 }); // 무시
    fireEvent.pointerUp(live, { clientX: 999, clientY: 999, pointerId: 2 }); // 무시 — 조기 커밋 없음
    expect(baseCtx.stroke).not.toHaveBeenCalled();

    fireEvent.pointerUp(live, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(baseCtx.stroke).toHaveBeenCalledTimes(1);
    expect(baseCtx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(baseCtx.lineTo).not.toHaveBeenCalledWith(500, 500);
    expect(baseCtx.lineTo).not.toHaveBeenCalledWith(999, 999);
  });

  it("absorbs window shortcuts while an editable element is focused", async () => {
    const { container } = render(<Harness initialTextMode />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    await flushTextEditingStart();
    const editor = screen.getByRole("textbox");

    // TextEditor 밖의 편집 요소에서도 가드가 동작해야 한다 (1차 방어 자체 검증)
    const stray = document.createElement("input");
    document.body.appendChild(stray);
    try {
      const clears = (baseCtx.clearRect as Mock).mock.calls.length;
      fireEvent.keyDown(stray, { code: "Backspace", altKey: true });
      fireEvent.keyDown(stray, { code: "KeyZ", metaKey: true });
      fireEvent.keyDown(stray, { code: "KeyT" });
      expect((baseCtx.clearRect as Mock).mock.calls.length).toBe(clears);
      expect(editor).toBeInTheDocument();
    } finally {
      stray.remove();
    }
  });

  describe("quick insert, deletion and tool sizing", () => {
    it("commits a dragged quick rectangle once and returns to freehand", () => {
      const onToolChange = vi.fn();
      const { container } = render(
        <DrawingCanvas {...baseProps} tool="rect" onToolChange={onToolChange} />,
      );
      const [baseCtx, liveCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];

      fireEvent.pointerDown(live, { button: 0, clientX: 80, clientY: 90, pointerId: 1 });
      fireEvent.pointerMove(live, { clientX: 180, clientY: 150, pointerId: 1 });
      expect(liveCtx.rect).toHaveBeenCalledWith(80, 90, 100, 60);
      expect(baseCtx.rect).not.toHaveBeenCalled();

      fireEvent.pointerUp(live, { clientX: 180, clientY: 150, pointerId: 1 });
      expect(baseCtx.rect).toHaveBeenCalledWith(80, 90, 100, 60);
      expect(onToolChange).toHaveBeenCalledWith("freehand");
    });

    it("keeps a quick insert armed after a sub-threshold release or cancellation", () => {
      const onToolChange = vi.fn();
      const { container } = render(
        <DrawingCanvas {...baseProps} tool="triangle" onToolChange={onToolChange} />,
      );
      const [baseCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];

      fireEvent.pointerDown(live, { button: 0, clientX: 30, clientY: 30, pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 33, clientY: 32, pointerId: 1 });
      fireEvent.pointerDown(live, { button: 0, clientX: 30, clientY: 30, pointerId: 2 });
      fireEvent.pointerMove(live, { clientX: 100, clientY: 90, pointerId: 2 });
      fireEvent.pointerCancel(live, { pointerId: 2 });

      expect(baseCtx.moveTo).not.toHaveBeenCalledWith(65, 30);
      expect(onToolChange).not.toHaveBeenCalled();
    });

    it("constrains a quick arrow with Shift and draws an end arrowhead", () => {
      const { container } = render(
        <DrawingCanvas {...baseProps} tool="arrow" onToolChange={vi.fn()} />,
      );
      const [baseCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];

      fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(live, { clientX: 110, clientY: 35, pointerId: 1, shiftKey: true });
      fireEvent.pointerUp(live, { clientX: 110, clientY: 35, pointerId: 1, shiftKey: true });

      expect(baseCtx.moveTo).toHaveBeenCalledWith(10, 10);
      expect(baseCtx.lineTo).toHaveBeenCalledWith(expect.closeTo(113.077, 2), expect.closeTo(10, 2));
      expect(baseCtx.lineTo).toHaveBeenCalledTimes(3); // shaft + two arrowhead sides
    });

    it("keeps deletion active across delete, undo and another delete", () => {
      const { container } = render(<Harness />);
      const [baseCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];
      fireEvent.pointerDown(live, { button: 0, clientX: 20, clientY: 20, pointerId: 1 });
      fireEvent.pointerMove(live, { clientX: 100, clientY: 20, pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 100, clientY: 20, pointerId: 1 });
      expect(baseCtx.stroke).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { code: "KeyE" });
      fireEvent.pointerMove(live, { clientX: 50, clientY: 20, pointerId: 2 });
      expect(live).toHaveStyle({ cursor: "pointer" });
      fireEvent.pointerDown(live, { button: 0, clientX: 50, clientY: 20, pointerId: 2 });
      fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
      expect(baseCtx.stroke).toHaveBeenCalledTimes(2);
      fireEvent.pointerDown(live, { button: 0, clientX: 50, clientY: 20, pointerId: 3 });
      fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
      expect(baseCtx.stroke).toHaveBeenCalledTimes(3);
    });

    it("routes Command plus and minus to the active tool and ignores them in deletion", () => {
      const onWidthStep = vi.fn();
      const onTextSizeStep = vi.fn();
      const { rerender } = render(
        <DrawingCanvas
          {...baseProps}
          tool="freehand"
          onToolChange={vi.fn()}
          onWidthStep={onWidthStep}
          onTextSizeStep={onTextSizeStep}
        />,
      );
      fireEvent.keyDown(window, { code: "Equal", metaKey: true });
      expect(onWidthStep).toHaveBeenCalledWith(1);
      expect(onTextSizeStep).not.toHaveBeenCalled();

      rerender(
        <DrawingCanvas
          {...baseProps}
          tool="text"
          onToolChange={vi.fn()}
          onWidthStep={onWidthStep}
          onTextSizeStep={onTextSizeStep}
        />,
      );
      fireEvent.keyDown(window, { code: "Minus", metaKey: true });
      expect(onTextSizeStep).toHaveBeenCalledWith(-1);

      rerender(
        <DrawingCanvas
          {...baseProps}
          tool="delete"
          onToolChange={vi.fn()}
          onWidthStep={onWidthStep}
          onTextSizeStep={onTextSizeStep}
        />,
      );
      fireEvent.keyDown(window, { code: "Equal", metaKey: true });
      expect(onWidthStep).toHaveBeenCalledTimes(1);
      expect(onTextSizeStep).toHaveBeenCalledTimes(1);
    });
  });

  describe("mark movement discovery", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("reveals movable marks after holding Command for 120ms and suppresses shortcut chords", () => {
      const { container } = render(<Harness />);
      const live = container.querySelectorAll("canvas")[1];
      const liveCtx = contexts[1];

      fireEvent.pointerDown(live, { button: 0, clientX: 20, clientY: 30, pointerId: 1 });
      fireEvent.pointerMove(live, { clientX: 80, clientY: 70, pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 80, clientY: 70, pointerId: 1 });
      vi.mocked(liveCtx.fillRect).mockClear();

      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
      vi.advanceTimersByTime(119);
      expect(liveCtx.fillRect).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(liveCtx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
      fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft", metaKey: false });

      vi.mocked(liveCtx.fillRect).mockClear();
      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
      fireEvent.keyDown(window, { key: "z", code: "KeyZ", metaKey: true });
      vi.advanceTimersByTime(120);
      expect(liveCtx.fillRect).not.toHaveBeenCalled();
      fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft", metaKey: false });

      for (const [key, code] of [
        ["+", "Equal"],
        ["-", "Minus"],
      ]) {
        vi.mocked(liveCtx.fillRect).mockClear();
        fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
        fireEvent.keyDown(window, { key, code, metaKey: true });
        vi.advanceTimersByTime(120);
        expect(liveCtx.fillRect).not.toHaveBeenCalled();
        fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft", metaKey: false });
      }
    });

    it("moves a pen mark immediately with Command-drag and records one undoable change", () => {
      const { container } = render(<Harness />);
      const [baseCtx, liveCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];

      fireEvent.pointerDown(live, { button: 0, clientX: 20, clientY: 30, pointerId: 1 });
      fireEvent.pointerMove(live, { clientX: 80, clientY: 70, pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 80, clientY: 70, pointerId: 1 });
      vi.mocked(baseCtx.moveTo).mockClear();
      vi.mocked(liveCtx.moveTo).mockClear();

      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
      fireEvent.pointerDown(live, {
        button: 0,
        clientX: 20,
        clientY: 30,
        pointerId: 2,
        metaKey: true,
      });
      fireEvent.pointerMove(live, {
        clientX: 60,
        clientY: 50,
        pointerId: 2,
        metaKey: true,
      });
      expect(liveCtx.moveTo).toHaveBeenLastCalledWith(60, 50);

      fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft", metaKey: false });
      fireEvent.pointerUp(live, { clientX: 70, clientY: 60, pointerId: 2, metaKey: false });
      expect(baseCtx.moveTo).toHaveBeenLastCalledWith(70, 60);

      fireEvent.keyDown(window, { key: "z", code: "KeyZ", metaKey: true });
      expect(baseCtx.moveTo).toHaveBeenLastCalledWith(20, 30);
      fireEvent.keyDown(window, { key: "z", code: "KeyZ", metaKey: true, shiftKey: true });
      expect(baseCtx.moveTo).toHaveBeenLastCalledWith(70, 60);
    });

    it("highlights the hit target immediately and leaves an empty Command-drag inert", () => {
      const { container } = render(<Harness />);
      const [baseCtx, liveCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];

      fireEvent.pointerDown(live, { button: 0, clientX: 20, clientY: 30, pointerId: 1 });
      fireEvent.pointerMove(live, { clientX: 80, clientY: 70, pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 80, clientY: 70, pointerId: 1 });
      vi.mocked(liveCtx.stroke).mockClear();
      vi.mocked(liveCtx.fillRect).mockClear();

      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
      fireEvent.pointerDown(live, {
        button: 0,
        clientX: 20,
        clientY: 30,
        pointerId: 2,
        metaKey: true,
      });
      expect(liveCtx.stroke).toHaveBeenCalledTimes(2); // 경로 강조 + 원래 잉크
      vi.advanceTimersByTime(120);
      expect(liveCtx.fillRect).not.toHaveBeenCalled(); // 활성 제스처 중에는 전체 focus field를 열지 않는다
      fireEvent.pointerUp(live, { clientX: 20, clientY: 30, pointerId: 2, metaKey: true });

      const committedStrokes = vi.mocked(baseCtx.stroke).mock.calls.length;
      fireEvent.pointerDown(live, {
        button: 0,
        clientX: 400,
        clientY: 400,
        pointerId: 3,
        metaKey: true,
      });
      fireEvent.pointerMove(live, { clientX: 450, clientY: 450, pointerId: 3, metaKey: true });
      fireEvent.pointerUp(live, { clientX: 450, clientY: 450, pointerId: 3, metaKey: true });
      fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft", metaKey: false });
      expect(baseCtx.stroke).toHaveBeenCalledTimes(committedStrokes);
    });

    it("draws a solid text frame and strengthens it with a grab cursor on hover", async () => {
      const { container } = render(<Harness initialTextMode />);
      const live = container.querySelectorAll("canvas")[1];
      const liveCtx = contexts[1];

      fireEvent.pointerDown(live, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
      await flushTextEditingStart();
      const editor = screen.getByRole("textbox");
      fireEvent.change(editor, { target: { value: "후보" } });
      fireEvent.keyDown(editor, { key: "Enter" });

      vi.mocked(liveCtx.strokeRect).mockClear();
      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
      vi.advanceTimersByTime(120);
      expect(liveCtx.strokeRect).toHaveBeenCalled();
      expect(liveCtx.lineWidth).toBe(1.5);

      fireEvent.pointerMove(live, { clientX: 100, clientY: 100, pointerId: 2, metaKey: true });
      expect(live).toHaveStyle({ cursor: "grab" });
      expect(liveCtx.lineWidth).toBe(3);

      fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft", metaKey: false });
      expect(live).toHaveStyle({ cursor: "default" });
    });

    it("does not reveal when Command starts during a pointer gesture and clears a lost keyup on blur", () => {
      const { container } = render(<Harness />);
      const live = container.querySelectorAll("canvas")[1];
      const liveCtx = contexts[1];

      fireEvent.pointerDown(live, { button: 0, clientX: 20, clientY: 30, pointerId: 1 });
      vi.mocked(liveCtx.fillRect).mockClear();
      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
      vi.advanceTimersByTime(120);
      fireEvent.pointerMove(live, { clientX: 80, clientY: 70, pointerId: 1, metaKey: true });
      fireEvent.pointerUp(live, { clientX: 80, clientY: 70, pointerId: 1, metaKey: true });
      expect(liveCtx.fillRect).not.toHaveBeenCalled();
      fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft", metaKey: false });

      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
      vi.advanceTimersByTime(120);
      expect(liveCtx.fillRect).toHaveBeenCalled();
      fireEvent.pointerMove(live, { clientX: 20, clientY: 30, pointerId: 2, metaKey: true });
      expect(live).toHaveStyle({ cursor: "grab" });

      fireEvent.blur(window);
      expect(live).toHaveStyle({ cursor: "default" });
      vi.mocked(liveCtx.fillRect).mockClear();
      fireEvent.pointerMove(live, { clientX: 20, clientY: 30, pointerId: 2 });
      expect(liveCtx.fillRect).not.toHaveBeenCalled();
    });

    it("keeps the default cursor after an empty Command gesture in the visible focus field", () => {
      const { container } = render(<Harness />);
      const live = container.querySelectorAll("canvas")[1];

      fireEvent.pointerDown(live, { button: 0, clientX: 20, clientY: 30, pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 20, clientY: 30, pointerId: 1 });
      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
      vi.advanceTimersByTime(120);

      fireEvent.pointerDown(live, {
        button: 0,
        clientX: 400,
        clientY: 400,
        pointerId: 2,
        metaKey: true,
      });
      fireEvent.pointerUp(live, { clientX: 400, clientY: 400, pointerId: 2, metaKey: true });
      expect(live).toHaveStyle({ cursor: "default" });
      fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft", metaKey: false });
    });
  });

  describe("double-click text entry", () => {
    beforeEach(() => {
      // 동기 rAF 스텁과 충돌하지 않게 필요한 프리미티브만 fake로 제한한다.
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("retracts the first click's dot and emits a pointer ping", async () => {
      const onChange = vi.fn();
      const onPointerPing = vi.fn();
      const { container } = render(<Harness onChange={onChange} onPointerPing={onPointerPing} />);
      const [baseCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];

      // 첫 클릭 = 점 커밋 (base에 증분 stroke 1회)
      fireEvent.pointerDown(live, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 50, clientY: 50, pointerId: 1 });
      expect(baseCtx.stroke).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      fireEvent.pointerDown(live, { button: 0, clientX: 52, clientY: 51, pointerId: 2 });
      fireEvent.pointerUp(live, { clientX: 52, clientY: 51, pointerId: 2 });
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(onPointerPing).toHaveBeenCalledWith({ x: 50, y: 50 });
      expect(onChange).not.toHaveBeenCalled();
      // 점이 회수됐으므로 renderBase 재실행에서 stroke가 다시 그려지지 않는다
      expect(baseCtx.stroke).toHaveBeenCalledTimes(1);
    });

    it("does not mistake a click after undo for the second half of a double-click", () => {
      const { container } = render(<Harness />);
      const [baseCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];

      fireEvent.pointerDown(live, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 50, clientY: 50, pointerId: 1 });
      expect(baseCtx.stroke).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      fireEvent.keyDown(window, { code: "KeyZ", metaKey: true }); // undo가 더블클릭 추적을 무효화한다
      vi.advanceTimersByTime(100);
      fireEvent.pointerDown(live, { button: 0, clientX: 51, clientY: 51, pointerId: 2 });
      fireEvent.pointerUp(live, { clientX: 51, clientY: 51, pointerId: 2 });

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(baseCtx.stroke).toHaveBeenCalledTimes(2); // 독립된 새 점으로 커밋된다
    });

    it("keeps two separate dots when the second click is too late or too far", () => {
      const { container } = render(<Harness />);
      const [baseCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];

      fireEvent.pointerDown(live, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 50, clientY: 50, pointerId: 1 });
      vi.advanceTimersByTime(400); // DBLCLICK_MS 초과
      fireEvent.pointerDown(live, { button: 0, clientX: 50, clientY: 50, pointerId: 2 });
      fireEvent.pointerUp(live, { clientX: 50, clientY: 50, pointerId: 2 });
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(baseCtx.stroke).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(100);
      fireEvent.pointerDown(live, { button: 0, clientX: 200, clientY: 200, pointerId: 3 }); // 거리 초과
      fireEvent.pointerUp(live, { clientX: 200, clientY: 200, pointerId: 3 });
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(baseCtx.stroke).toHaveBeenCalledTimes(3);
    });

    it("does not emit a ping while the deletion tool owns the clicks", () => {
      const onPointerPing = vi.fn();
      const { container } = render(
        <Harness initialTool="delete" onPointerPing={onPointerPing} />,
      );
      const live = container.querySelectorAll("canvas")[1];

      fireEvent.pointerDown(live, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 50, clientY: 50, pointerId: 1 });
      vi.advanceTimersByTime(100);
      fireEvent.pointerDown(live, { button: 0, clientX: 50, clientY: 50, pointerId: 2 });
      fireEvent.pointerUp(live, { clientX: 50, clientY: 50, pointerId: 2 });

      expect(onPointerPing).not.toHaveBeenCalled();
    });
  });

  describe("text re-editing", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    async function createText(live: Element, x: number, y: number, value: string, pointerId: number) {
      fireEvent.keyDown(window, { code: "KeyT" });
      fireEvent.pointerDown(live, { button: 0, clientX: x, clientY: y, pointerId });
      await flushTextEditingStart();
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: "Enter" });
    }

    it("reopens existing text, edits content and size as one undoable change", async () => {
      const onNewTextSizeCommit = vi.fn();
      const onEditingSize = vi.fn();
      const { container } = render(
        <Harness
          onEditingSize={onEditingSize}
          onNewTextSizeCommit={onNewTextSizeCommit}
        />,
      );
      const [baseCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];
      await createText(live, 100, 100, "원본", 1);
      expect(onNewTextSizeCommit).toHaveBeenCalledWith("medium");

      fireEvent.pointerDown(live, { button: 0, clientX: 100, clientY: 100, pointerId: 2 });
      fireEvent.pointerUp(live, { clientX: 100, clientY: 100, pointerId: 2 });
      vi.advanceTimersByTime(100);
      fireEvent.pointerDown(live, { button: 0, clientX: 101, clientY: 100, pointerId: 3 });
      fireEvent.pointerUp(live, { clientX: 101, clientY: 100, pointerId: 3 });
      await flushTextEditingStart();

      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.value).toBe("원본");
      fireEvent.change(input, { target: { value: "수정" } });
      fireEvent.keyDown(input, { code: "Equal", metaKey: true });
      expect(input).toHaveAttribute("data-text-size-px", "60");
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onNewTextSizeCommit).toHaveBeenCalledTimes(1);
      expect(baseCtx.fillText).toHaveBeenLastCalledWith("수정", 100, 100);

      fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
      expect(baseCtx.fillText).toHaveBeenLastCalledWith("원본", 100, 100);
      fireEvent.keyDown(window, { code: "KeyZ", metaKey: true, shiftKey: true });
      expect(baseCtx.fillText).toHaveBeenLastCalledWith("수정", 100, 100);
    });

    it("deletes empty existing text and restores it with undo", async () => {
      const { container } = render(<Harness />);
      const [baseCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];
      await createText(live, 80, 70, "삭제 대상", 1);

      fireEvent.keyDown(window, { code: "KeyT" });
      fireEvent.pointerDown(live, { button: 0, clientX: 80, clientY: 70, pointerId: 2 });
      fireEvent.pointerUp(live, { clientX: 80, clientY: 70, pointerId: 2 });
      await flushTextEditingStart();
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "   " } });
      fireEvent.keyDown(input, { key: "Enter" });
      const callsAfterDelete = (baseCtx.fillText as Mock).mock.calls.length;

      fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
      expect((baseCtx.fillText as Mock).mock.calls.length).toBe(callsAfterDelete + 1);
      expect(baseCtx.fillText).toHaveBeenLastCalledWith("삭제 대상", 80, 70);
    });

    it("commits A then immediately opens B on a double-click without drawing a dot", async () => {
      const { container } = render(<Harness />);
      const [baseCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];
      await createText(live, 100, 100, "A", 1);
      await createText(live, 200, 100, "B", 2);

      fireEvent.keyDown(window, { code: "KeyT" });
      fireEvent.pointerDown(live, { button: 0, clientX: 100, clientY: 100, pointerId: 3 });
      fireEvent.pointerUp(live, { clientX: 100, clientY: 100, pointerId: 3 });
      await flushTextEditingStart();
      const editorA = screen.getByRole("textbox");
      fireEvent.change(editorA, { target: { value: "A 수정" } });

      const strokesBefore = (baseCtx.stroke as Mock).mock.calls.length;
      fireEvent.pointerDown(live, { button: 0, clientX: 200, clientY: 100, pointerId: 4 });
      fireEvent.pointerUp(live, { clientX: 200, clientY: 100, pointerId: 4 });
      vi.advanceTimersByTime(100);
      fireEvent.pointerDown(live, { button: 0, clientX: 201, clientY: 100, pointerId: 5 });
      fireEvent.pointerUp(live, { clientX: 201, clientY: 100, pointerId: 5 });
      await flushTextEditingStart();

      expect(baseCtx.stroke).toHaveBeenCalledTimes(strokesBefore);
      expect(baseCtx.fillText).toHaveBeenCalledWith("A 수정", 100, 100);
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("B");
    });

    it("moves existing text after the click threshold and records one undoable position change", async () => {
      const onChange = vi.fn();
      const { container } = render(<Harness onChange={onChange} />);
      const [baseCtx, liveCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];
      await createText(live, 100, 100, "이동\n대상", 1);
      const modeChangesBeforeMove = onChange.mock.calls.length;

      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
      fireEvent.pointerDown(live, {
        button: 0,
        clientX: 105,
        clientY: 105,
        pointerId: 2,
        metaKey: true,
      });
      fireEvent.pointerMove(live, {
        clientX: 135,
        clientY: 125,
        pointerId: 2,
        metaKey: true,
      });
      expect(liveCtx.fillText).toHaveBeenCalledWith("이동", 130, 120);
      expect(liveCtx.fillText).toHaveBeenCalledWith("대상", 130, 172.8);

      fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft", metaKey: false });
      fireEvent.pointerUp(live, { clientX: 145, clientY: 135, pointerId: 2, metaKey: false });
      expect(baseCtx.fillText).toHaveBeenLastCalledWith("대상", 140, 182.8);
      expect(onChange).toHaveBeenCalledTimes(modeChangesBeforeMove);
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

      fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
      expect(baseCtx.fillText).toHaveBeenLastCalledWith("대상", 100, 152.8);
      fireEvent.keyDown(window, { code: "KeyZ", metaKey: true, shiftKey: true });
      expect(baseCtx.fillText).toHaveBeenLastCalledWith("대상", 140, 182.8);
    });

    it("keeps sub-threshold Command gestures as no-ops and restores a cancelled move", async () => {
      const onChange = vi.fn();
      const { container } = render(<Harness onChange={onChange} />);
      const [baseCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];
      await createText(live, 100, 100, "원본", 1);

      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
      fireEvent.pointerDown(live, {
        button: 0,
        clientX: 100,
        clientY: 100,
        pointerId: 2,
        metaKey: true,
      });
      fireEvent.pointerMove(live, { clientX: 103, clientY: 100, pointerId: 2, metaKey: true });
      fireEvent.pointerUp(live, { clientX: 103, clientY: 100, pointerId: 2, metaKey: true });
      fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft", metaKey: false });
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(baseCtx.fillText).toHaveBeenLastCalledWith("원본", 100, 100);

      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
      fireEvent.pointerDown(live, {
        button: 0,
        clientX: 100,
        clientY: 100,
        pointerId: 3,
        metaKey: true,
      });
      fireEvent.pointerMove(live, { clientX: 130, clientY: 130, pointerId: 3, metaKey: true });
      fireEvent.pointerCancel(live, { pointerId: 3 });
      fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft", metaKey: false });
      expect(baseCtx.fillText).toHaveBeenLastCalledWith("원본", 100, 100);

      fireEvent.keyDown(window, { code: "KeyT" });
      fireEvent.pointerDown(live, { button: 0, clientX: 100, clientY: 100, pointerId: 4 });
      await flushTextEditingStart();
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("원본");
      expect(onChange).toHaveBeenLastCalledWith(true);
    });
  });

  describe("hold-to-snap", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
      // 반복 스케줄 검증에는 id=0 반환이 필요하다 — 동기 스텁이 1을 반환하면
      // rafId가 콜백 후에 1로 덮여 다음 scheduleLive가 조기 반환된다.
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        callback(1);
        return 0;
      });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function renderCanvas() {
      const { container } = render(
        <DrawingCanvas {...baseProps} tool="freehand" onToolChange={vi.fn()} />,
      );
      return { live: container.querySelectorAll("canvas")[1], baseCtx: contexts[0], liveCtx: contexts[1] };
    }

    function traceSquare(live: Element, x: number, y: number, size: number, pointerId = 1) {
      fireEvent.pointerDown(live, { button: 0, clientX: x, clientY: y, pointerId });
      const perSide = 12;
      const sides: [number, number][] = [];
      for (let i = 1; i <= perSide; i++) sides.push([x + (size * i) / perSide, y]);
      for (let i = 1; i <= perSide; i++) sides.push([x + size, y + (size * i) / perSide]);
      for (let i = 1; i <= perSide; i++) sides.push([x + size - (size * i) / perSide, y + size]);
      for (let i = 1; i <= perSide; i++) sides.push([x, y + size - (size * i) / perSide]);
      for (const [px, py] of sides) fireEvent.pointerMove(live, { clientX: px, clientY: py, pointerId });
    }

    function traceOpenStroke(live: Element, from: [number, number], to: [number, number], pointerId = 1) {
      fireEvent.pointerDown(live, { button: 0, clientX: from[0], clientY: from[1], pointerId });
      fireEvent.pointerMove(live, { clientX: to[0], clientY: to[1], pointerId });
    }

    it("snaps a held closed stroke to a rectangle committed as one undoable mark", () => {
      const { live, baseCtx, liveCtx } = renderCanvas();
      traceSquare(live, 100, 100, 120);
      expect(liveCtx.rect).not.toHaveBeenCalled();

      vi.advanceTimersByTime(350); // HOLD_MS 도달 → 보정 미리보기
      expect(liveCtx.rect).toHaveBeenCalled();
      expect(baseCtx.rect).not.toHaveBeenCalled();

      fireEvent.pointerUp(live, { clientX: 100, clientY: 100, pointerId: 1 });
      expect(baseCtx.rect).toHaveBeenCalledTimes(1); // 증분 커밋 1회

      // 스냅된 도형도 ⌘Z 한 번에 통째로 사라진다
      fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
      expect(baseCtx.rect).toHaveBeenCalledTimes(1); // renderBase 재실행에서 재호출 없음
    });

    it("shows the progress ring at 150ms and corrects an open stroke to a line at 350ms", () => {
      const { live, liveCtx } = renderCanvas();
      traceOpenStroke(live, [50, 50], [170, 90]);
      vi.mocked(liveCtx.arc).mockClear();

      vi.advanceTimersByTime(149);
      expect(liveCtx.arc).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(liveCtx.arc).toHaveBeenCalled();

      vi.advanceTimersByTime(199);
      vi.mocked(liveCtx.moveTo).mockClear();
      vi.mocked(liveCtx.lineTo).mockClear();
      vi.advanceTimersByTime(1);
      expect(liveCtx.moveTo).toHaveBeenCalledWith(50, 50);
      expect(liveCtx.lineTo).toHaveBeenCalledOnce();
      expect(liveCtx.lineTo).toHaveBeenCalledWith(170, 90);

      fireEvent.pointerUp(live, { clientX: 170, clientY: 90, pointerId: 1 });
    });

    it("cancels a correction preview after meaningful movement and can correct again", () => {
      const { live, liveCtx } = renderCanvas();
      traceOpenStroke(live, [20, 30], [120, 70]);
      vi.advanceTimersByTime(350);
      vi.mocked(liveCtx.moveTo).mockClear();
      vi.mocked(liveCtx.lineTo).mockClear();
      vi.mocked(liveCtx.bezierCurveTo).mockClear();

      fireEvent.pointerMove(live, { clientX: 260, clientY: 190, pointerId: 1 });

      expect(liveCtx.lineTo).toHaveBeenCalledTimes(2);
      expect(liveCtx.lineTo).toHaveBeenLastCalledWith(260, 190);

      vi.mocked(liveCtx.moveTo).mockClear();
      vi.mocked(liveCtx.lineTo).mockClear();
      vi.advanceTimersByTime(350);
      expect(liveCtx.moveTo).toHaveBeenCalledWith(20, 30);
      expect(liveCtx.lineTo).toHaveBeenCalledWith(260, 190);
      fireEvent.pointerUp(live, { clientX: 260, clientY: 190, pointerId: 1 });
    });

    it("commits the visible preview endpoint as one undoable and redoable line mark", () => {
      const { live, baseCtx } = renderCanvas();
      traceOpenStroke(live, [10, 10], [100, 40]);
      vi.advanceTimersByTime(350);

      fireEvent.pointerUp(live, { clientX: 220, clientY: 140, pointerId: 1 });
      expect(baseCtx.moveTo).toHaveBeenCalledWith(10, 10);
      expect(baseCtx.lineTo).toHaveBeenCalledOnce();
      expect(baseCtx.lineTo).toHaveBeenCalledWith(100, 40);

      fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
      expect(baseCtx.lineTo).toHaveBeenCalledOnce();

      fireEvent.keyDown(window, { code: "KeyZ", metaKey: true, shiftKey: true });
      expect(baseCtx.lineTo).toHaveBeenCalledTimes(2);
      expect(baseCtx.lineTo).toHaveBeenLastCalledWith(100, 40);
    });

    it("does not move a corrected line with Command drag", () => {
      const { live, baseCtx } = renderCanvas();
      traceOpenStroke(live, [20, 30], [120, 70]);
      vi.advanceTimersByTime(350);
      fireEvent.pointerUp(live, { clientX: 120, clientY: 70, pointerId: 1 });
      vi.mocked(baseCtx.moveTo).mockClear();
      vi.mocked(baseCtx.lineTo).mockClear();

      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
      fireEvent.pointerDown(live, {
        button: 0,
        clientX: 70,
        clientY: 50,
        pointerId: 2,
        metaKey: true,
      });
      fireEvent.pointerMove(live, { clientX: 90, clientY: 80, pointerId: 2, metaKey: true });
      fireEvent.pointerUp(live, { clientX: 100, clientY: 90, pointerId: 2, metaKey: true });
      fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft", metaKey: false });

      expect(baseCtx.moveTo).not.toHaveBeenCalled();
      expect(baseCtx.lineTo).not.toHaveBeenCalled();
    });

    it("does not move a corrected rectangle with Command drag", () => {
      const { live, baseCtx } = renderCanvas();
      traceSquare(live, 100, 100, 120);
      vi.advanceTimersByTime(350);
      fireEvent.pointerUp(live, { clientX: 100, clientY: 100, pointerId: 1 });
      const rectCalls = vi.mocked(baseCtx.rect).mock.calls;
      const [x, y, width, height] = rectCalls[rectCalls.length - 1];
      vi.mocked(baseCtx.rect).mockClear();

      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
      fireEvent.pointerDown(live, {
        button: 0,
        clientX: x + width / 2,
        clientY: y + height / 2,
        pointerId: 2,
        metaKey: true,
      });
      fireEvent.pointerMove(live, {
        clientX: x + width / 2 + 20,
        clientY: y + height / 2 + 10,
        pointerId: 2,
        metaKey: true,
      });
      fireEvent.pointerUp(live, {
        clientX: x + width / 2 + 30,
        clientY: y + height / 2 + 20,
        pointerId: 2,
        metaKey: true,
      });
      fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft", metaKey: false });

      expect(baseCtx.rect).not.toHaveBeenCalled();
    });

    it("restarts the full 350ms hold window after meaningful pointer movement", () => {
      const { live, liveCtx } = renderCanvas();
      traceOpenStroke(live, [0, 0], [100, 100]);
      vi.advanceTimersByTime(325);
      fireEvent.pointerMove(live, { clientX: 140, clientY: 120, pointerId: 1 });

      vi.advanceTimersByTime(349);
      vi.mocked(liveCtx.moveTo).mockClear();
      vi.mocked(liveCtx.lineTo).mockClear();
      vi.advanceTimersByTime(1);

      expect(liveCtx.moveTo).toHaveBeenCalledWith(0, 0);
      expect(liveCtx.lineTo).toHaveBeenCalledOnce();
      expect(liveCtx.lineTo).toHaveBeenCalledWith(140, 120);
      fireEvent.pointerUp(live, { clientX: 140, clientY: 120, pointerId: 1 });
    });

    it("restarts the hold when an intermediate coalesced sample leaves the still radius", () => {
      const { live, liveCtx } = renderCanvas();
      traceOpenStroke(live, [0, 0], [100, 0]);
      vi.advanceTimersByTime(325);

      const move = new Event("pointermove") as PointerEvent;
      Object.defineProperties(move, {
        clientX: { value: 100 },
        clientY: { value: 0 },
        pointerId: { value: 1 },
        getCoalescedEvents: {
          value: () => [
            { clientX: 150, clientY: 0 },
            { clientX: 100, clientY: 0 },
          ],
        },
      });
      live.dispatchEvent(move);

      vi.mocked(liveCtx.moveTo).mockClear();
      vi.mocked(liveCtx.lineTo).mockClear();
      vi.advanceTimersByTime(25);
      expect(liveCtx.lineTo).not.toHaveBeenCalled();

      vi.advanceTimersByTime(324);
      vi.advanceTimersByTime(1);
      expect(liveCtx.moveTo).toHaveBeenCalledWith(0, 0);
      expect(liveCtx.lineTo).toHaveBeenCalledWith(100, 0);
      fireEvent.pointerUp(live, { clientX: 100, clientY: 0, pointerId: 1 });
    });

    it("keeps a hand-drawn arrow freehand when released before the hold completes", () => {
      const { live, baseCtx } = renderCanvas();
      fireEvent.pointerDown(live, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(live, { clientX: 120, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(live, { clientX: 96, clientY: -18, pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 120, clientY: 0, pointerId: 1 });

      expect(baseCtx.bezierCurveTo).toHaveBeenCalled();
      expect(baseCtx.lineTo).not.toHaveBeenCalled();
      expect(baseCtx.stroke).toHaveBeenCalledOnce();
    });

    it("never snaps strokes below the minimum size", () => {
      const { live, baseCtx } = renderCanvas();
      fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(live, { clientX: 18, clientY: 14, pointerId: 1 }); // 대각 < 24px
      vi.advanceTimersByTime(900);
      fireEvent.pointerUp(live, { clientX: 18, clientY: 14, pointerId: 1 });

      expect(baseCtx.rect).not.toHaveBeenCalled();
      expect(baseCtx.ellipse).not.toHaveBeenCalled();
      expect(baseCtx.stroke).toHaveBeenCalledTimes(1);
    });

    it("discards a locked line on Clear All instead of committing it on release", () => {
      const { live, baseCtx, liveCtx } = renderCanvas();
      traceOpenStroke(live, [100, 100], [220, 160]);
      vi.advanceTimersByTime(350);
      expect(liveCtx.lineTo).toHaveBeenCalled();

      fireEvent.keyDown(window, { code: "Backspace", altKey: true }); // 전체 지우기
      fireEvent.pointerUp(live, { clientX: 260, clientY: 180, pointerId: 1 });
      expect(baseCtx.lineTo).not.toHaveBeenCalled();
    });

    it("clears a locked line on mode-changed without committing", async () => {
      const { live, baseCtx, liveCtx } = renderCanvas();
      traceOpenStroke(live, [100, 100], [220, 160]);
      vi.advanceTimersByTime(350);
      expect(liveCtx.lineTo).toHaveBeenCalled();

      await act(async () => {
        await emit("mode-changed", { drawing: false });
      });
      fireEvent.pointerUp(live, { clientX: 260, clientY: 180, pointerId: 1 });
      expect(baseCtx.lineTo).not.toHaveBeenCalled();
    });

    it("clears a locked line on pointer cancel without committing", () => {
      const { live, baseCtx, liveCtx } = renderCanvas();
      traceOpenStroke(live, [100, 100], [220, 160]);
      vi.advanceTimersByTime(350);
      expect(liveCtx.lineTo).toHaveBeenCalled();

      fireEvent.pointerCancel(live, { pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 260, clientY: 180, pointerId: 1 });
      expect(baseCtx.lineTo).not.toHaveBeenCalled();
    });
  });

  it("commits text at the size shown while typing even if the window resized mid-edit", async () => {
    const { container } = render(<Harness initialTextMode />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    await flushTextEditingStart();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "크기 고정" } });

    // 편집 중 해상도 변경 — 리렌더 없이 백킹만 재설정되므로 표시 크기는 그대로다
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1200 });
    fireEvent(window, new Event("resize"));

    fireEvent.keyDown(input, { key: "Enter" });
    expect(baseCtx.fillText).toHaveBeenCalledOnce();
    // 해상도와 무관한 medium 44px — 리사이즈 후에도 표시된 고정 크기로 커밋된다
    expect(String(baseCtx.font)).toContain("44px");
  });

  it("absorbs shortcuts via editingRef even when the event target is not an editable element", async () => {
    const { container } = render(<Harness initialTextMode />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    await flushTextEditingStart();
    screen.getByRole("textbox");

    const clears = (baseCtx.clearRect as Mock).mock.calls.length;
    // window를 타깃으로 발화 — isEditableTarget만으로는 못 거른다 (패널 포커스 유실 시나리오)
    fireEvent.keyDown(window, { code: "Backspace", altKey: true });
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
    expect((baseCtx.clearRect as Mock).mock.calls.length).toBe(clears);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("commits the editing session when text mode turns off", async () => {
    const { container } = render(<Harness initialTextMode />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    await flushTextEditingStart();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "확정될 초안" } });

    fireEvent.click(screen.getByTestId("force-off"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(baseCtx.fillText).toHaveBeenCalledWith("확정될 초안", 10, 10);
  });
});
