import { mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installCanvasMock, installResizeObserver } from "../../test/canvas";
import { MiniCanvas } from "./mini-canvas";

describe("MiniCanvas", () => {
  const commands: string[] = [];

  beforeEach(() => {
    commands.length = 0;
    installCanvasMock();
    installResizeObserver();
    mockIPC((cmd) => void commands.push(cmd));
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

  it("draws, reports only the first stroke, corrects, clears and cancels", () => {
    const onFirstStroke = vi.fn();
    const { container } = render(<MiniCanvas onFirstStroke={onFirstStroke} />);
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

    fireEvent.pointerDown(canvas, { button: 0, clientX: 50, clientY: 60, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 50, clientY: 60, pointerId: 2 });
    expect(onFirstStroke).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { code: "Backspace", altKey: true });
    fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10, pointerId: 3 });
    fireEvent.pointerCancel(canvas, { pointerId: 3 });
  });

  it("suspends global shortcuts while demonstrating the blackboard and preserves strokes", async () => {
    const { container, unmount } = render(<MiniCanvas boardable boardAccel="Shift+Alt+Tab" />);
    const wrap = container.firstElementChild as HTMLElement;
    const canvas = container.querySelector("canvas")!;
    await waitFor(() => expect(commands).toContain("suspend_shortcuts"));

    fireEvent.pointerDown(canvas, { button: 0, clientX: 20, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 25, clientY: 35, pointerId: 1 });
    fireEvent.keyDown(window, { code: "Tab", altKey: true, shiftKey: true, repeat: true });
    expect(wrap).toHaveStyle({ background: "transparent" });
    fireEvent.keyDown(window, { code: "Tab", altKey: true, shiftKey: true });
    expect(wrap).toHaveStyle({ background: "#000" });
    fireEvent.keyDown(window, { code: "KeyB", altKey: true });

    unmount();
    await waitFor(() => expect(commands).toContain("resume_shortcuts"));
  });
});
