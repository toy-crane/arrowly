import { describe, expect, it } from "vitest";
import {
  createGeometricMark,
  DRAWING_INSPECTOR_TOOLS,
  GEOMETRIC_TOOLS,
  isGeometricTool,
} from "./tools";

describe("geometric drawing tools", () => {
  it("exposes the approved drawing order and recognizes only geometric tools", () => {
    expect(DRAWING_INSPECTOR_TOOLS).toEqual([
      "freehand",
      "arrow",
      "rect",
      "ellipse",
      "triangle",
    ]);
    expect(GEOMETRIC_TOOLS.every(isGeometricTool)).toBe(true);
    expect(isGeometricTool("line")).toBe(false);
    expect(isGeometricTool("freehand")).toBe(false);
    expect(isGeometricTool("delete")).toBe(false);
  });

  it("constructs rectangle, ellipse and triangle geometry in either drag direction", () => {
    expect(createGeometricMark("rect", { x: 30, y: 40 }, { x: 10, y: 15 }, "pink", 5))
      .toMatchObject({ shape: "rect", geometry: { x: 10, y: 15, w: 20, h: 25 } });
    expect(createGeometricMark("ellipse", { x: 10, y: 20 }, { x: 50, y: 60 }, "pink", 5))
      .toMatchObject({ shape: "ellipse", geometry: { cx: 30, cy: 40, rx: 20, ry: 20 } });
    expect(createGeometricMark("triangle", { x: 50, y: 60 }, { x: 10, y: 20 }, "pink", 5))
      .toMatchObject({ shape: "triangle", geometry: { x: 10, y: 20, w: 40, h: 40 } });
  });

  it("constructs an endpoint arrow using the raw pointer endpoint", () => {
    const arrow = createGeometricMark("arrow", { x: 0, y: 0 }, { x: 30, y: 10 }, "blue", 4);
    expect(arrow).toMatchObject({ shape: "line", arrowhead: "end" });
    if (arrow.shape !== "line") throw new Error("expected line mark");
    expect(arrow.geometry.to).toEqual({ x: 30, y: 10 });
  });
});
