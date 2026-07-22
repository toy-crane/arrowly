import { describe, expect, it } from "vitest";
import { createQuickInsertMark, isQuickInsertTool } from "./tools";

describe("quick insert tools", () => {
  it("recognizes only the five one-shot drawing tools", () => {
    expect(["rect", "ellipse", "triangle", "line", "arrow"].every(isQuickInsertTool)).toBe(true);
    expect(isQuickInsertTool("freehand")).toBe(false);
    expect(isQuickInsertTool("delete")).toBe(false);
  });

  it("constructs rectangle, ellipse and triangle geometry in either drag direction", () => {
    expect(createQuickInsertMark("rect", { x: 30, y: 40 }, { x: 10, y: 15 }, "pink", 5, false))
      .toMatchObject({ shape: "rect", geometry: { x: 10, y: 15, w: 20, h: 25 } });
    expect(createQuickInsertMark("ellipse", { x: 10, y: 20 }, { x: 50, y: 60 }, "pink", 5, false))
      .toMatchObject({ shape: "ellipse", geometry: { cx: 30, cy: 40, rx: 20, ry: 20 } });
    expect(createQuickInsertMark("triangle", { x: 50, y: 60 }, { x: 10, y: 20 }, "pink", 5, false))
      .toMatchObject({ shape: "triangle", geometry: { x: 10, y: 20, w: 40, h: 40 } });
  });

  it("distinguishes plain lines from end-arrow lines and constrains them to 45 degrees", () => {
    expect(createQuickInsertMark("line", { x: 0, y: 0 }, { x: 30, y: 10 }, "blue", 4, false))
      .toMatchObject({ shape: "line", arrowhead: "none", geometry: { to: { x: 30, y: 10 } } });
    const arrow = createQuickInsertMark("arrow", { x: 0, y: 0 }, { x: 30, y: 10 }, "blue", 4, true);
    expect(arrow).toMatchObject({ shape: "line", arrowhead: "end" });
    if (arrow.shape !== "line") throw new Error("expected line mark");
    expect(arrow.geometry.to.x).toBeCloseTo(Math.hypot(30, 10));
    expect(arrow.geometry.to.y).toBeCloseTo(0);
  });
});
