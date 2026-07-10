import { describe, expect, it, vi } from "vitest";
import { applyPenCursor, resetCursor } from "./cursor";

function fakeCanvas() {
  const ctx = {
    scale: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    strokeStyle: "",
    lineWidth: 0,
    fillStyle: "",
  };
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn(() => "data:image/png;base64,test"),
    ctx,
  };
}

describe("pen cursor", () => {
  it("draws 2x ink and contrast rings and resets to default", () => {
    const canvas = fakeCanvas();
    let value = "";
    const style = {
      get cursor() {
        return value;
      },
      set cursor(next: string) {
        value = next;
      },
    };
    vi.stubGlobal("document", {
      body: { style },
      createElement: vi.fn(() => canvas),
    });

    applyPenCursor("#FF2D95", 3);
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBe(canvas.width);
    expect(canvas.ctx.scale).toHaveBeenCalledWith(2, 2);
    expect(canvas.ctx.arc).toHaveBeenCalledTimes(3);
    expect(canvas.ctx.stroke).toHaveBeenCalledTimes(2);
    expect(canvas.ctx.fill).toHaveBeenCalledOnce();
    expect(style.cursor).toContain("image-set");

    resetCursor();
    expect(style.cursor).toBe("default");
  });

  it("uses the 1x PNG fallback when image-set is rejected", () => {
    const first = fakeCanvas();
    const second = fakeCanvas();
    const canvases = [first, second];
    let value = "";
    let writes = 0;
    const style = {
      get cursor() {
        return value;
      },
      set cursor(next: string) {
        writes += 1;
        value = writes === 1 ? "" : next;
      },
    };
    vi.stubGlobal("document", {
      body: { style },
      createElement: vi.fn(() => canvases.shift()),
    });

    applyPenCursor("#00AEEF", 20);
    expect(writes).toBe(2);
    expect(style.cursor).toContain('url("data:image/png;base64,test")');
    expect(first.ctx.scale).toHaveBeenCalledWith(2, 2);
    expect(second.ctx.scale).toHaveBeenCalledWith(1, 1);
  });
});
