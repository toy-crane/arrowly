import { describe, expect, it, vi } from "vitest";
import { drawStroke, StrokeStore } from "./strokes";

describe("StrokeStore", () => {
  it("runs the append-only live/commit/undo/redo lifecycle", () => {
    const store = new StrokeStore();
    store.extendLive([{ x: 9, y: 9 }]);
    expect(store.commitLive()).toBeNull();

    store.beginLive("red", 4, { x: 1, y: 2 });
    store.extendLive([{ x: 3, y: 4 }]);
    const stroke = store.commitLive();
    expect(stroke).toEqual({ color: "red", width: 4, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] });
    expect(store.live).toBeNull();

    expect(store.undo()).toBe(true);
    expect(store.strokes).toEqual([]);
    expect(store.redo()).toBe(true);
    expect(store.strokes).toEqual([stroke]);
    expect(store.redo()).toBe(false);
  });

  it("turns a click into a visible dot and invalidates redo on a new commit", () => {
    const store = new StrokeStore();
    store.beginLive("pink", 5, { x: 10, y: 20 });
    const dot = store.commitLive()!;
    expect(dot.points).toEqual([{ x: 10, y: 20 }, { x: 10.01, y: 20 }]);

    expect(store.undo()).toBe(true);
    store.beginLive("blue", 3, { x: 2, y: 2 });
    store.commitLive();
    expect(store.redoStack).toEqual([]);
    expect(store.undo()).toBe(true);
    expect(store.undo()).toBe(false);
  });

  it("cancels live input and clears every buffer", () => {
    const store = new StrokeStore();
    store.beginLive("green", 2, { x: 0, y: 0 });
    store.cancelLive();
    expect(store.live).toBeNull();

    store.beginLive("green", 2, { x: 0, y: 0 });
    store.commitLive();
    store.undo();
    store.beginLive("green", 2, { x: 1, y: 1 });
    store.clear();
    expect(store.strokes).toEqual([]);
    expect(store.redoStack).toEqual([]);
    expect(store.live).toBeNull();
  });
});

describe("drawStroke", () => {
  it("applies the ink-only style and draws the path", () => {
    const ctx = {
      strokeStyle: "",
      lineWidth: 0,
      lineCap: "butt",
      lineJoin: "miter",
      globalAlpha: 0,
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawStroke(ctx, { color: "#FFD400", width: 7, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] });
    expect(ctx.strokeStyle).toBe("#FFD400");
    expect(ctx.lineWidth).toBe(7);
    expect(ctx.lineCap).toBe("round");
    expect(ctx.lineJoin).toBe("round");
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.stroke).toHaveBeenCalledOnce();
  });
});
