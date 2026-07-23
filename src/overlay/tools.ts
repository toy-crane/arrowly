import type { LineMark, Point, ShapeMark } from "../shared/drawing";

export const GEOMETRIC_TOOLS = ["arrow", "rect", "ellipse", "triangle"] as const;

export type GeometricTool = (typeof GEOMETRIC_TOOLS)[number];
export const DRAWING_INSPECTOR_TOOLS = ["freehand", ...GEOMETRIC_TOOLS] as const;
export type DrawingInspectorTool = (typeof DRAWING_INSPECTOR_TOOLS)[number];
export type DrawingTool = "freehand" | "text" | "delete" | GeometricTool;

export function isGeometricTool(tool: string): tool is GeometricTool {
  return GEOMETRIC_TOOLS.includes(tool as GeometricTool);
}

export function createGeometricMark(
  tool: GeometricTool,
  from: Point,
  to: Point,
  color: string,
  width: number,
): ShapeMark | LineMark {
  if (tool === "arrow") {
    return {
      kind: "shape",
      shape: "line",
      geometry: { from, to },
      arrowhead: "end",
      color,
      width,
    };
  }

  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const w = Math.abs(to.x - from.x);
  const h = Math.abs(to.y - from.y);
  if (tool === "ellipse") {
    return {
      kind: "shape",
      shape: "ellipse",
      geometry: { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 },
      color,
      width,
    };
  }
  return { kind: "shape", shape: tool, geometry: { x, y, w, h }, color, width };
}
