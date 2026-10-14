import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installCanvasMock } from "../../test/canvas";
import { MagnifierLayer } from "./magnifier-layer";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("../shared/ipc", () => ({
  captureMagnifierFrame: mocks.capture,
  stopMagnifierCapture: mocks.stop,
}));

describe("MagnifierLayer", () => {
  beforeEach(() => {
    installCanvasMock();
    mocks.capture.mockReset().mockResolvedValue(new ArrayBuffer(1200 * 800 * 4));
    mocks.stop.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1920 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1080 });
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    vi.stubGlobal(
      "ImageData",
      class ImageDataMock {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number,
        ) {}
      },
    );
  });

  it("captures the source as raw RGBA and composites existing marks over it", async () => {
    const drawMarks = vi.fn();
    const { unmount } = render(
      <MagnifierLayer board={false} drawMarks={drawMarks} onCaptureError={vi.fn()} />,
    );

    await waitFor(() => expect(mocks.capture).toHaveBeenCalledWith({
      x: 810,
      y: 440,
      width: 300,
      height: 200,
      outputWidth: 1200,
      outputHeight: 800,
    }));
    const canvas = screen.getByRole("img", { name: "Magnifier lens" }).querySelector("canvas")!;
    const context = canvas.getContext("2d")!;
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(800);
    expect(context.putImageData).toHaveBeenCalledWith(expect.any(ImageData), 0, 0);
    expect(drawMarks).toHaveBeenCalledWith(
      context,
      { x: 810, y: 440, width: 300, height: 200 },
      2,
    );

    fireEvent.pointerMove(window, { clientX: 700, clientY: 450 });
    await waitFor(() => expect(mocks.capture).toHaveBeenLastCalledWith({
      x: 550,
      y: 350,
      width: 300,
      height: 200,
      outputWidth: 1200,
      outputHeight: 800,
    }));

    unmount();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });

  it("starts at 2.0x and narrows the captured source as the wheel zooms in", async () => {
    const drawMarks = vi.fn();
    render(<MagnifierLayer board={false} drawMarks={drawMarks} onCaptureError={vi.fn()} />);

    const badge = screen.getByText("2.0×");
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({ x: 810, y: 440, width: 300, height: 200 }),
    ));

    const wheel = new WheelEvent("wheel", { deltaY: -40, cancelable: true });
    act(() => {
      window.dispatchEvent(wheel);
    });

    expect(wheel.defaultPrevented).toBe(true);
    expect(badge.textContent).toBe("2.2×");
    await waitFor(() => {
      const { width, height } = mocks.capture.mock.lastCall![0];
      const zoom = drawMarks.mock.lastCall![2] as number;
      expect(width).toBeLessThan(300);
      expect(width * zoom).toBeCloseTo(600, 6);
      expect(height * zoom).toBeCloseTo(400, 6);
    });
  });

  it("keeps the zoom between 1.5x and 4.0x", async () => {
    render(<MagnifierLayer board={false} drawMarks={vi.fn()} onCaptureError={vi.fn()} />);

    act(() => {
      for (let i = 0; i < 40; i += 1) fireEvent.wheel(window, { deltaY: -400 });
    });
    expect(screen.getByText("4.0×")).toBeInTheDocument();
    await waitFor(() => expect(mocks.capture).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 885, y: 490, width: 150, height: 100 }),
    ));

    act(() => {
      for (let i = 0; i < 80; i += 1) fireEvent.wheel(window, { deltaY: 400 });
    });
    expect(screen.getByText("1.5×")).toBeInTheDocument();
  });

  it("zooms with a trackpad pinch delivered as a ctrl wheel", () => {
    render(<MagnifierLayer board={false} drawMarks={vi.fn()} onCaptureError={vi.fn()} />);

    const pinch = new WheelEvent("wheel", { deltaY: -20, ctrlKey: true, cancelable: true });
    act(() => {
      window.dispatchEvent(pinch);
    });

    expect(pinch.defaultPrevented).toBe(true);
    expect(Number(screen.getByText(/×$/).textContent!.replace("×", ""))).toBeGreaterThan(2);
  });

  it("renders blackboard and marks without reading the screen", async () => {
    const drawMarks = vi.fn();
    render(<MagnifierLayer board drawMarks={drawMarks} onCaptureError={vi.fn()} />);

    await act(async () => Promise.resolve());
    const canvas = screen.getByRole("img", { name: "Magnifier lens" }).querySelector("canvas")!;
    const context = canvas.getContext("2d")!;
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 600, 400);
    expect(drawMarks).toHaveBeenCalled();
  });

  it("reports capture loss instead of keeping an empty or stale lens", async () => {
    mocks.capture.mockRejectedValue("error:screen_capture_permission");
    const onCaptureError = vi.fn();
    render(
      <MagnifierLayer board={false} drawMarks={vi.fn()} onCaptureError={onCaptureError} />,
    );

    await waitFor(() => expect(onCaptureError).toHaveBeenCalledWith(
      "error:screen_capture_permission",
    ));
  });
});
