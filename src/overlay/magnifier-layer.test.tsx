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
    mocks.capture.mockReset().mockResolvedValue(new ArrayBuffer(696 * 352 * 4));
    mocks.stop.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
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
      x: 513,
      y: 356,
      width: 174,
      height: 88,
      outputWidth: 696,
      outputHeight: 352,
    }));
    const canvas = screen.getByRole("img", { name: "Magnifier lens" }).querySelector("canvas")!;
    const context = canvas.getContext("2d")!;
    expect(canvas.width).toBe(696);
    expect(canvas.height).toBe(352);
    expect(context.putImageData).toHaveBeenCalledWith(expect.any(ImageData), 0, 0);
    expect(drawMarks).toHaveBeenCalledWith(context, {
      x: 513,
      y: 356,
      width: 174,
      height: 88,
    });

    fireEvent.pointerMove(window, { clientX: 700, clientY: 450 });
    await waitFor(() => expect(mocks.capture).toHaveBeenLastCalledWith({
      x: 613,
      y: 406,
      width: 174,
      height: 88,
      outputWidth: 696,
      outputHeight: 352,
    }));

    unmount();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });

  it("renders blackboard and marks without reading the screen", async () => {
    const drawMarks = vi.fn();
    render(<MagnifierLayer board drawMarks={drawMarks} onCaptureError={vi.fn()} />);

    await act(async () => Promise.resolve());
    const canvas = screen.getByRole("img", { name: "Magnifier lens" }).querySelector("canvas")!;
    const context = canvas.getContext("2d")!;
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 348, 176);
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
