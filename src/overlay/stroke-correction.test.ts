import { describe, expect, it } from "vitest";
import type { Point } from "../shared/drawing";
import {
  classifyStroke,
  HOLD_MS,
  RING_DELAY_MS,
  STILL_RADIUS_PX,
} from "./stroke-correction";

function linePath(from: Point, to: Point, samples = 20): Point[] {
  return Array.from({ length: samples + 1 }, (_, index) => ({
    x: from.x + ((to.x - from.x) * index) / samples,
    y: from.y + ((to.y - from.y) * index) / samples,
  }));
}

function squarePath(x: number, y: number, size: number, perSide = 12): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= perSide; i += 1) points.push({ x: x + (size * i) / perSide, y });
  for (let i = 1; i <= perSide; i += 1) {
    points.push({ x: x + size, y: y + (size * i) / perSide });
  }
  for (let i = 1; i <= perSide; i += 1) {
    points.push({ x: x + size - (size * i) / perSide, y: y + size });
  }
  for (let i = 1; i <= perSide; i += 1) {
    points.push({ x, y: y + size - (size * i) / perSide });
  }
  return points;
}

function circlePath(cx: number, cy: number, radius: number, samples = 36): Point[] {
  return Array.from({ length: samples + 1 }, (_, index) => {
    const angle = (index / samples) * Math.PI * 2;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
}

function trianglePath(x: number, y: number, width: number, height: number): Point[] {
  const vertices = [
    { x: x + width / 2, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
    { x: x + width / 2, y },
  ];
  return vertices.flatMap((from, side) => {
    if (side === vertices.length - 1) return [];
    const to = vertices[side + 1];
    return Array.from({ length: 13 }, (_, index) => ({
      x: from.x + ((to.x - from.x) * index) / 12,
      y: from.y + ((to.y - from.y) * index) / 12,
    })).slice(side === 0 ? 0 : 1);
  });
}

describe("freehand stroke correction", () => {
  it("classifies held open and closed strokes as line, rectangle, ellipse and triangle marks", () => {
    expect(classifyStroke(linePath({ x: 10, y: 20 }, { x: 180, y: 80 }))?.shape).toBe(
      "line",
    );
    expect(classifyStroke(squarePath(100, 100, 120))?.shape).toBe("rect");
    expect(classifyStroke(circlePath(200, 150, 50))?.shape).toBe("ellipse");
    expect(classifyStroke(trianglePath(100, 80, 120, 90))?.shape).toBe("triangle");
  });

  it("keeps tiny and degenerate strokes as freehand", () => {
    expect(classifyStroke([])).toBeNull();
    expect(classifyStroke([{ x: 5, y: 5 }])).toBeNull();
    expect(classifyStroke(linePath({ x: 0, y: 0 }, { x: 20, y: 0 }))).toBeNull();

    const out = linePath({ x: 100, y: 100 }, { x: 220, y: 100 });
    const back = linePath({ x: 220, y: 100 }, { x: 100, y: 100 }).slice(1);
    expect(classifyStroke([...out, ...back])).toBeNull();
  });

  it("keeps the established hold timing without exposing Shift angle projection", () => {
    expect(HOLD_MS).toBe(350);
    expect(RING_DELAY_MS).toBe(150);
    expect(STILL_RADIUS_PX).toBe(3.5);
  });
});
