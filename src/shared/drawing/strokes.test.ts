import { describe, expect, it, vi } from "vitest";
import { createCanvasContext, installCanvasMock } from "../../../test/canvas";
import {
  drawMark,
  findMarkAt,
  findMovableMarkAt,
  findTextMarkAt,
  fontString,
  layoutText,
  Mark,
  markFrameBounds,
  measureTextWidth,
  StrokeStore,
  textCaretOffsetAt,
  TEXT_FONT_FAMILY,
  TextMark,
  translateMark,
} from "./strokes";
import type { LineGeometry } from "./strokes";

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

describe("mark movement", () => {
  it("translates every committed mark without changing its shape or ink", () => {
    const marks: Mark[] = [
      { kind: "pen", points: [{ x: 1, y: 2 }, { x: 4, y: 8 }], color: "red", width: 3 },
      textMark,
      rectMark,
      {
        kind: "shape",
        shape: "ellipse",
        geometry: { cx: 30, cy: 40, rx: 12, ry: 8 },
        color: "blue",
        width: 5,
      },
      {
        kind: "shape",
        shape: "line",
        geometry: { from: { x: 5, y: 6 }, to: { x: 15, y: 16 } },
        arrowhead: "none",
        color: "green",
        width: 2,
      },
    ];

    expect(marks.map((mark) => translateMark(mark, 7, -3))).toEqual([
      { kind: "pen", points: [{ x: 8, y: -1 }, { x: 11, y: 5 }], color: "red", width: 3 },
      { ...textMark, x: 47, y: 57 },
      { ...rectMark, geometry: { x: 17, y: 17, w: 100, h: 50 } },
      {
        kind: "shape",
        shape: "ellipse",
        geometry: { cx: 37, cy: 37, rx: 12, ry: 8 },
        color: "blue",
        width: 5,
      },
      {
        kind: "shape",
        shape: "line",
        geometry: { from: { x: 12, y: 3 }, to: { x: 22, y: 13 } },
        arrowhead: "none",
        color: "green",
        width: 2,
      },
    ]);
    expect(marks[0]).toEqual({
      kind: "pen",
      points: [{ x: 1, y: 2 }, { x: 4, y: 8 }],
      color: "red",
      width: 3,
    });
  });

  it("hits each mark by visible geometry and returns the topmost overlap", () => {
    installCanvasMock();
    const pen: Mark = {
      kind: "pen",
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: "red",
      width: 2,
    };
    const line: Mark = {
      kind: "shape",
      shape: "line",
      geometry: { from: { x: 120, y: 20 }, to: { x: 200, y: 20 } },
      arrowhead: "none",
      color: "orange",
      width: 2,
    };
    const rect: Mark = {
      kind: "shape",
      shape: "rect",
      geometry: { x: 220, y: 10, w: 50, h: 40 },
      color: "green",
      width: 3,
    };
    const ellipse: Mark = {
      kind: "shape",
      shape: "ellipse",
      geometry: { cx: 330, cy: 30, rx: 30, ry: 20 },
      color: "blue",
      width: 3,
    };
    const triangle: Mark = {
      kind: "shape",
      shape: "triangle",
      geometry: { x: 360, y: 10, w: 60, h: 50 },
      color: "yellow",
      width: 3,
    };
    const text: TextMark = { ...textMark, x: 400, y: 10 };

    expect(findMarkAt([pen], { x: 50, y: 55 })).toEqual({ index: 0, mark: pen });
    expect(findMarkAt([pen], { x: 0, y: 100 })).toBeNull();
    expect(findMarkAt([line], { x: 160, y: 26 })).toEqual({ index: 0, mark: line });
    expect(findMarkAt([rect], { x: 245, y: 30 })).toEqual({ index: 0, mark: rect });
    expect(findMarkAt([ellipse], { x: 330, y: 30 })).toEqual({ index: 0, mark: ellipse });
    expect(findMarkAt([triangle], { x: 390, y: 30 })).toEqual({ index: 0, mark: triangle });
    expect(findMarkAt([triangle], { x: 365, y: 12 })).toBeNull();
    expect(findMarkAt([text], { x: 405, y: 20 })).toEqual({ index: 0, mark: text });

    const topLine = { ...line, geometry: { from: { x: 0, y: 0 }, to: { x: 100, y: 100 } } };
    expect(findMarkAt([pen, topLine], { x: 50, y: 50 })).toEqual({ index: 1, mark: topLine });
  });

  it("hits the visible arrowhead sides outside the shaft tolerance", () => {
    const arrow: Mark = {
      kind: "shape",
      shape: "line",
      geometry: { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
      arrowhead: "end",
      color: "orange",
      width: 20,
    };
    const line: Mark = { ...arrow, arrowhead: "none" };
    const arrowheadTip = { x: 48, y: 30 };

    expect(findMarkAt([line], arrowheadTip)).toBeNull();
    expect(findMarkAt([arrow], arrowheadTip)).toEqual({ index: 0, mark: arrow });
  });

  it("offers only pen and text marks to the move gesture", () => {
    installCanvasMock();
    const pen: Mark = {
      kind: "pen",
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: "red",
      width: 2,
    };
    const shape: Mark = {
      kind: "shape",
      shape: "rect",
      geometry: { x: 20, y: 20, w: 60, h: 60 },
      color: "green",
      width: 3,
    };
    const text: TextMark = { ...textMark, x: 20, y: 20 };

    expect(findMovableMarkAt([pen, shape], { x: 50, y: 50 })).toEqual({ index: 0, mark: pen });
    expect(findMovableMarkAt([shape], { x: 50, y: 50 })).toBeNull();
    expect(findMovableMarkAt([shape, text], { x: 25, y: 60 })).toEqual({ index: 1, mark: text });
  });

  it("exposes frames for text and closed shapes but not path marks", () => {
    installCanvasMock();
    expect(markFrameBounds(textMark)).toEqual({ x: 34, y: 54, w: 22, h: 56 });
    expect(markFrameBounds(rectMark)).toEqual({ x: 1.5, y: 11.5, w: 117, h: 67 });
    expect(
      markFrameBounds({
        kind: "shape",
        shape: "ellipse",
        geometry: { cx: 50, cy: 40, rx: 30, ry: 20 },
        color: "blue",
        width: 4,
      }),
    ).toEqual({ x: 12, y: 12, w: 76, h: 56 });
    expect(
      markFrameBounds({
        kind: "pen",
        points: [{ x: 0, y: 0 }, { x: 20, y: 20 }],
        color: "red",
        width: 3,
      }),
    ).toBeNull();
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

describe("layoutText", () => {
  it("preserves empty and trailing lines with a shared 1.2 line height", () => {
    installCanvasMock();
    const layout = layoutText("첫 줄\n\n끝\n", "medium");
    expect(layout.lines.map((line) => ({ text: line.text, start: line.start, end: line.end }))).toEqual([
      { text: "첫 줄", start: 0, end: 3 },
      { text: "", start: 4, end: 4 },
      { text: "끝", start: 5, end: 6 },
      { text: "", start: 7, end: 7 },
    ]);
    expect(layout.lineHeight).toBe(52.8);
    expect(layout.height).toBe(211.2);
  });
});

describe("text hit testing", () => {
  it("finds the topmost text within the padded bounds", () => {
    installCanvasMock();
    const top = { ...textMark, text: "위" };
    const marks: Mark[] = [textMark, rectMark, top];
    expect(findTextMarkAt(marks, { x: 39, y: 59 })).toEqual({ index: 2, mark: top });
    expect(findTextMarkAt(marks, { x: 20, y: 20 })).toBeNull();
  });

  it("returns a UTF-16 caret boundary nearest to the clicked grapheme", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      const context = createCanvasContext();
      context.measureText = vi.fn((text: string) => ({
        width: text.length * 10,
      })) as unknown as typeof context.measureText;
      return context;
    });
    const mark = { ...textMark, text: "A😀한" };
    expect(textCaretOffsetAt(mark, { x: mark.x, y: mark.y })).toBe(0);
    expect(textCaretOffsetAt(mark, { x: mark.x + 28, y: mark.y })).toBe(3);
    expect(textCaretOffsetAt(mark, { x: mark.x + 50, y: mark.y })).toBe(4);
  });

  it("hits individual lines and places the caret on the nearest multiline row", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      const context = createCanvasContext();
      context.measureText = vi.fn((text: string) => ({
        width: text.length * 10 || 10,
      })) as unknown as typeof context.measureText;
      return context;
    });
    const mark = { ...textMark, text: "긴 첫 줄\nB😀" };
    expect(findTextMarkAt([mark], { x: 45, y: 120 })).toEqual({ index: 0, mark });
    expect(findTextMarkAt([mark], { x: 90, y: 120 })).toBeNull();
    expect(textCaretOffsetAt(mark, { x: 66, y: 122 })).toBe(9);
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
    installCanvasMock();
    const ctx = createCanvasContext();
    drawMark(ctx, textMark);
    expect(ctx.fillStyle).toBe("#FFD400");
    expect(ctx.font).toBe(`44px ${TEXT_FONT_FAMILY}`);
    expect(ctx.textBaseline).toBe("top");
    expect(ctx.fillText).toHaveBeenCalledOnce();
    expect(ctx.fillText).toHaveBeenCalledWith("재시도", 40, 60);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("renders multiline text one row at a time and skips empty rows", () => {
    installCanvasMock();
    const ctx = createCanvasContext();
    drawMark(ctx, { ...textMark, text: "첫 줄\n\n셋째" });
    expect(ctx.fillText).toHaveBeenCalledTimes(2);
    expect(ctx.fillText).toHaveBeenNthCalledWith(1, "첫 줄", 40, 60);
    expect(ctx.fillText).toHaveBeenNthCalledWith(2, "셋째", 40, 165.6);
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

  it("renders an upright triangle inside its drag bounds", () => {
    const ctx = createCanvasContext();
    drawMark(ctx, {
      kind: "shape",
      shape: "triangle",
      geometry: { x: 10, y: 20, w: 100, h: 60 },
      color: "#FFD400",
      width: 4,
    });
    expect(ctx.moveTo).toHaveBeenCalledWith(60, 20);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 110, 80);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 10, 80);
    expect(ctx.closePath).toHaveBeenCalledOnce();
    expect(ctx.stroke).toHaveBeenCalledOnce();
  });

  it("renders a line as exactly one straight shaft", () => {
    const ctx = createCanvasContext();
    const geometry: LineGeometry = { from: { x: 8, y: 12 }, to: { x: 100, y: 64 } };
    drawMark(ctx, {
      kind: "shape",
      shape: "line",
      geometry,
      arrowhead: "none",
      color: "#FF2D95",
      width: 5,
    });
    expect(ctx.beginPath).toHaveBeenCalledOnce();
    expect(ctx.moveTo).toHaveBeenCalledOnce();
    expect(ctx.moveTo).toHaveBeenCalledWith(8, 12);
    expect(ctx.lineTo).toHaveBeenCalledOnce();
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 64);
    expect(ctx.stroke).toHaveBeenCalledOnce();
  });

  it("renders an end arrowhead as part of a line mark", () => {
    const ctx = createCanvasContext();
    drawMark(ctx, {
      kind: "shape",
      shape: "line",
      geometry: { from: { x: 8, y: 12 }, to: { x: 100, y: 64 } },
      arrowhead: "end",
      color: "#FF2D95",
      width: 5,
    });
    expect(ctx.moveTo).toHaveBeenCalledTimes(3);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(1, 8, 12);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(2, 100, 64);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(3, 100, 64);
    expect(ctx.lineTo).toHaveBeenCalledTimes(3);
    expect(ctx.stroke).toHaveBeenCalledOnce();
  });
});
