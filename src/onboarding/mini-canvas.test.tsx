import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installCanvasMock, installResizeObserver } from "../../test/canvas";
import { MiniCanvas } from "./mini-canvas";

describe("MiniCanvas", () => {
  beforeEach(() => {
    installCanvasMock();
    installResizeObserver();
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 160 });
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      right: 410,
      bottom: 180,
      width: 400,
      height: 160,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
  });

  it("keeps one mark while the learner moves, deletes and restores it in order", () => {
    const onFirstStroke = vi.fn();
    const onMoved = vi.fn();
    const onDeleted = vi.fn();
    const onRestored = vi.fn();
    const props = {
      clearAccel: "Control+KeyK",
      onFirstStroke,
      onMoved,
      onDeleted,
      onRestored,
      onCleared: vi.fn(),
    };
    const { container, rerender } = render(
      <MiniCanvas {...props} phase="draw" correctionStep="move" />,
    );
    const canvas = container.querySelector("canvas")!;
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(320);

    fireEvent.pointerMove(canvas, { clientX: 1, clientY: 1 });
    fireEvent.pointerUp(canvas, { clientX: 1, clientY: 1 });
    fireEvent.pointerDown(canvas, { button: 1, clientX: 1, clientY: 1 });
    fireEvent.pointerDown(canvas, { button: 0, clientX: 20, clientY: 30, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 30, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 40, clientY: 50, pointerId: 1 });
    expect(onFirstStroke).toHaveBeenCalledOnce();

    rerender(<MiniCanvas {...props} phase="correct" correctionStep="move" />);
    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 30,
      clientY: 40,
      pointerId: 2,
      altKey: true,
    });
    fireEvent.pointerUp(canvas, { clientX: 30, clientY: 40, pointerId: 2, altKey: true });
    expect(onDeleted).not.toHaveBeenCalled();

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 30,
      clientY: 40,
      pointerId: 3,
      metaKey: true,
    });
    fireEvent.pointerMove(canvas, { clientX: 50, clientY: 60, pointerId: 3, metaKey: true });
    fireEvent.pointerUp(canvas, { clientX: 50, clientY: 60, pointerId: 3, metaKey: true });
    expect(onMoved).toHaveBeenCalledOnce();

    rerender(<MiniCanvas {...props} phase="correct" correctionStep="delete" />);
    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 50,
      clientY: 60,
      pointerId: 4,
      altKey: true,
    });
    fireEvent.pointerUp(canvas, { clientX: 50, clientY: 60, pointerId: 4, altKey: true });
    expect(onDeleted).toHaveBeenCalledOnce();

    rerender(<MiniCanvas {...props} phase="correct" correctionStep="undo" />);
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true, shiftKey: true });
    expect(onRestored).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
    expect(onRestored).toHaveBeenCalledOnce();
  });

  it("only clears a restored mark with the configured shortcut", () => {
    const onCleared = vi.fn();
    const props = {
      clearAccel: "Control+KeyK",
      onFirstStroke: vi.fn(),
      onMoved: vi.fn(),
      onDeleted: vi.fn(),
      onRestored: vi.fn(),
      onCleared,
    };
    const { container, rerender, getByText } = render(
      <MiniCanvas {...props} phase="draw" correctionStep="complete" />,
    );
    const canvas = container.querySelector("canvas")!;

    fireEvent.pointerDown(canvas, { button: 0, clientX: 20, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 25, clientY: 35, pointerId: 1 });
    rerender(
      <MiniCanvas
        {...props}
        phase="finish"
        correctionStep="complete"
        emptyLabel="The screen is clear"
      />,
    );

    fireEvent.keyDown(window, { code: "KeyK", altKey: true });
    fireEvent.keyDown(window, { code: "KeyK", ctrlKey: true, repeat: true });
    expect(onCleared).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { code: "KeyK", ctrlKey: true });
    expect(onCleared).toHaveBeenCalledOnce();
    expect(getByText("The screen is clear")).toBeInTheDocument();
    fireEvent.keyDown(window, { code: "KeyK", ctrlKey: true });
    expect(onCleared).toHaveBeenCalledOnce();
  });
});
