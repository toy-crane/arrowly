import { describe, expect, it, vi } from "vitest";
import { strokePath } from "./smoothing";

function context() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("strokePath", () => {
  it("does nothing for an empty stroke", () => {
    const ctx = context();
    strokePath(ctx, []);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it("uses a polyline for fewer than four points", () => {
    const ctx = context();
    strokePath(ctx, [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]);
    expect(ctx.beginPath).toHaveBeenCalledOnce();
    expect(ctx.moveTo).toHaveBeenCalledWith(1, 2);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 3, 4);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 5, 6);
    expect(ctx.bezierCurveTo).not.toHaveBeenCalled();
  });

  it("uses Catmull-Rom-derived Bézier control points", () => {
    const ctx = context();
    strokePath(ctx, [{ x: 0, y: 0 }, { x: 6, y: 6 }, { x: 12, y: 0 }, { x: 18, y: 6 }]);
    expect(ctx.bezierCurveTo).toHaveBeenCalledTimes(3);
    expect(ctx.bezierCurveTo).toHaveBeenNthCalledWith(1, 1, 1, 4, 6, 6, 6);
    expect(ctx.bezierCurveTo).toHaveBeenNthCalledWith(3, 14, 0, 17, 5, 18, 6);
  });
});
