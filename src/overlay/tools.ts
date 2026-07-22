import type { LineMark, Point, ShapeMark } from "../shared/drawing";

export const QUICK_INSERT_TOOLS = ["rect", "ellipse", "triangle", "line", "arrow"] as const;

export type QuickInsertTool = (typeof QUICK_INSERT_TOOLS)[number];
export type DrawingTool = "freehand" | "text" | "delete" | QuickInsertTool;

export function isQuickInsertTool(tool: string): tool is QuickInsertTool {
  return QUICK_INSERT_TOOLS.includes(tool as QuickInsertTool);
}

function constrainedEndpoint(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return to;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: from.x + Math.cos(angle) * distance,
    y: from.y + Math.sin(angle) * distance,
  };
}

export function createQuickInsertMark(
  tool: QuickInsertTool,
  from: Point,
  to: Point,
  color: string,
  width: number,
  constrainLine: boolean,
): ShapeMark | LineMark {
  if (tool === "line" || tool === "arrow") {
    return {
      kind: "shape",
      shape: "line",
      geometry: { from, to: constrainLine ? constrainedEndpoint(from, to) : to },
      arrowhead: tool === "arrow" ? "end" : "none",
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
