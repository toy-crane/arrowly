import { describe, expect, it } from "vitest";
import { createCanvasContext, installCanvasMock } from "../../../test/canvas";
import { drawMark, fontString, Mark, measureTextWidth, StrokeStore, TEXT_FONT_FAMILY, TextMark } from "./strokes";

const textMark: TextMark = {
  kind: "text",
  x: 40,
  y: 60,
  text: "재시도",
  color: "#FFD400",
  sizeKey: "medium",
};
const rectMark: Mark = {
  kind: "shape",
  shape: "rect",
  geometry: { x: 10, y: 20, w: 100, h: 50 },
  color: "#2ED573",
  width: 5,
};

describe("StrokeStore", () => {
  it("runs the append-only live/commit/undo/redo lifecycle", () => {
    const store = new StrokeStore();
    store.extendLive([{ x: 9, y: 9 }]);
    expect(store.commitLive()).toBeNull();

    store.beginLive("red", 4, { x: 1, y: 2 });
    store.extendLive([{ x: 3, y: 4 }]);
    const stroke = store.commitLive();
    expect(stroke).toEqual({
      kind: "pen",
      color: "red",
      width: 4,
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
    });
    expect(store.live).toBeNull();

    expect(store.undo()).toBe(true);
    expect(store.marks).toEqual([]);
    expect(store.redo()).toBe(true);
    expect(store.marks).toEqual([stroke]);
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
    expect(store.marks).toEqual([]);
    expect(store.redoStack).toEqual([]);
    expect(store.live).toBeNull();
  });

  it("push clears the redo stack and undoes a whole mark at once", () => {
    const store = new StrokeStore();
    store.beginLive("red", 4, { x: 1, y: 1 });
    store.commitLive();
    store.undo();
    expect(store.redoStack).toHaveLength(1);

    store.push(textMark);
    expect(store.redoStack).toEqual([]);
    store.push(rectMark);
    expect(store.marks).toEqual([textMark, rectMark]);

    // 텍스트·도형도 마크 1개가 undo 단위다
    expect(store.undo()).toBe(true);
    expect(store.marks).toEqual([textMark]);
    expect(store.undo()).toBe(true);
    expect(store.marks).toEqual([]);
    expect(store.redo()).toBe(true);
    expect(store.marks).toEqual([textMark]);

    store.push(rectMark);
    store.clear();
    expect(store.marks).toEqual([]);
    expect(store.redoStack).toEqual([]);
  });

  it("retractLast removes the newest mark without feeding redo", () => {
    const store = new StrokeStore();
    expect(store.retractLast()).toBeNull();

    store.push(textMark);
    store.push(rectMark);
    expect(store.retractLast()).toBe(rectMark);
    expect(store.marks).toEqual([textMark]);
    expect(store.redoStack).toEqual([]);
    expect(store.redo()).toBe(false);
  });

  it("replaces text as one history entry and skips a no-op edit", () => {
    const store = new StrokeStore();
    store.push(textMark);
    const changed = { ...textMark, text: "수정", sizeKey: "large" as const };
    expect(store.replace(0, changed)).toBe(true);
    expect(store.marks).toEqual([changed]);
    expect(store.replace(0, { ...changed })).toBe(false);

    expect(store.undo()).toBe(true);
    expect(store.marks).toEqual([textMark]);
    expect(store.redo()).toBe(true);
    expect(store.marks).toEqual([changed]);
  });

  it("removes a mark and restores it at the same z-order position", () => {
    const store = new StrokeStore();
    store.push(textMark);
    store.push(rectMark);
    expect(store.remove(0)).toBe(textMark);
    expect(store.marks).toEqual([rectMark]);

    expect(store.undo()).toBe(true);
    expect(store.marks).toEqual([textMark, rectMark]);
    expect(store.redo()).toBe(true);
    expect(store.marks).toEqual([rectMark]);
    expect(store.remove(4)).toBeNull();
  });

  it("retracts the matching insert history with a double-click dot", () => {
    const store = new StrokeStore();
    store.push(textMark);
    store.push(rectMark);
    store.retractLast();
    expect(store.undo()).toBe(true);
    expect(store.marks).toEqual([]);
  });
});

describe("fontString", () => {
  it("builds the shared font string for both canvas marks and the DOM editor", () => {
    expect(fontString(29)).toBe(`29px ${TEXT_FONT_FAMILY}`);
  });
});

describe("measureTextWidth", () => {
  it("measures with the mark font and falls back to a caret-wide space for empty text", () => {
    const contexts = installCanvasMock();
    expect(measureTextWidth("재시도", 29)).toBe(10); // mock measureText 폭

    const ctx = contexts[contexts.length - 1];
    expect(ctx.font).toBe(fontString(29));
    expect(ctx.measureText).toHaveBeenCalledWith("재시도");

    measureTextWidth("", 29);
    const emptyCtx = contexts[contexts.length - 1];
    expect(emptyCtx.measureText).toHaveBeenCalledWith(" ");
  });
});

describe("drawMark", () => {
  it("applies the ink-only style and draws a pen path", () => {
    const ctx = createCanvasContext();
    drawMark(ctx, {
      kind: "pen",
      color: "#FFD400",
      width: 7,
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
    });
    expect(ctx.strokeStyle).toBe("#FFD400");
    expect(ctx.lineWidth).toBe(7);
    expect(ctx.lineCap).toBe("round");
    expect(ctx.lineJoin).toBe("round");
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.stroke).toHaveBeenCalledOnce();
  });

  it("renders text with top baseline, ink color and derived size", () => {
    const ctx = createCanvasContext();
    drawMark(ctx, textMark);
    expect(ctx.fillStyle).toBe("#FFD400");
    expect(ctx.font).toBe(`30px ${TEXT_FONT_FAMILY}`);
    expect(ctx.textBaseline).toBe("top");
    expect(ctx.fillText).toHaveBeenCalledOnce();
    expect(ctx.fillText).toHaveBeenCalledWith("재시도", 40, 60);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("renders rect and ellipse with round-cap ink style", () => {
    const rectCtx = createCanvasContext();
    drawMark(rectCtx, rectMark);
    expect(rectCtx.rect).toHaveBeenCalledOnce();
    expect(rectCtx.rect).toHaveBeenCalledWith(10, 20, 100, 50);
    expect(rectCtx.strokeStyle).toBe("#2ED573");
    expect(rectCtx.lineCap).toBe("round");
    expect(rectCtx.stroke).toHaveBeenCalledOnce();

    const ellipseCtx = createCanvasContext();
    drawMark(ellipseCtx, {
      kind: "shape",
      shape: "ellipse",
      geometry: { cx: 50, cy: 40, rx: 30, ry: 20 },
      color: "#00AEEF",
      width: 3,
    });
    expect(ellipseCtx.ellipse).toHaveBeenCalledOnce();
    expect(ellipseCtx.ellipse).toHaveBeenCalledWith(50, 40, 30, 20, 0, 0, Math.PI * 2);
    expect(ellipseCtx.stroke).toHaveBeenCalledOnce();
  });

  it("renders an arrow as a shaft plus two head segments", () => {
    const ctx = createCanvasContext();
    drawMark(ctx, {
      kind: "shape",
      shape: "arrow",
      geometry: { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
      color: "#FF2D95",
      width: 5,
    });
    // 축 1 + 촉의 꼭짓점 복귀 1 = moveTo 3회 (축 시작, 촉 2선의 시작)
    expect(ctx.moveTo).toHaveBeenCalledTimes(3);
    expect(ctx.lineTo).toHaveBeenCalledTimes(3);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(2, 100, 0);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(3, 100, 0);
    // 촉 길이 = max(12, 5*3.5) = 17.5, ±30°
    const head = 17.5;
    const calls = (ctx.lineTo as unknown as { mock: { calls: [number, number][] } }).mock.calls;
    expect(calls[1][0]).toBeCloseTo(100 - head * Math.cos(Math.PI / 6));
    expect(calls[1][1]).toBeCloseTo(head * Math.sin(Math.PI / 6));
    expect(calls[2][0]).toBeCloseTo(100 - head * Math.cos(Math.PI / 6));
    expect(calls[2][1]).toBeCloseTo(-head * Math.sin(Math.PI / 6));
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });
});
