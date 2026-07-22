import { describe, expect, it } from "vitest";
import type { Point } from "../shared/drawing";
import {
  classifyStroke,
  CLOSED_GAP_RATIO,
  CORNER_TURN_DEG,
  HOLD_MS,
  MIN_CLOSED_PATH_RATIO,
  MIN_ELLIPSE_MINOR_PX,
  MIN_RECT_CORNERS,
  MIN_SNAP_DIAG_PX,
  projectLineEndpoint,
  RING_DELAY_MS,
  STILL_RADIUS_PX,
} from "./shapes";

/** 손떨림을 흉내 내는 결정적 지터(±1.5px). */
function jitter(points: Point[], amp = 1.5): Point[] {
  return points.map((p, i) => ({
    x: p.x + Math.sin(i * 2.1) * amp,
    y: p.y + Math.cos(i * 1.7) * amp,
  }));
}

/** 사각형 둘레를 시계 방향으로 따라 그린 점열. */
function squarePath(x: number, y: number, size: number, perSide = 12): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= perSide; i++) pts.push({ x: x + (size * i) / perSide, y });
  for (let i = 1; i <= perSide; i++) pts.push({ x: x + size, y: y + (size * i) / perSide });
  for (let i = 1; i <= perSide; i++) pts.push({ x: x + size - (size * i) / perSide, y: y + size });
  for (let i = 1; i <= perSide; i++) pts.push({ x, y: y + size - (size * i) / perSide });
  return pts;
}

function circlePath(cx: number, cy: number, r: number, samples = 36): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function trianglePath(x: number, y: number, width: number, height: number, perSide = 12): Point[] {
  const vertices = [
    { x: x + width / 2, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
    { x: x + width / 2, y },
  ];
  const points: Point[] = [];
  for (let side = 0; side < 3; side += 1) {
    const from = vertices[side];
    const to = vertices[side + 1];
    for (let index = side === 0 ? 0 : 1; index <= perSide; index += 1) {
      points.push({
        x: from.x + ((to.x - from.x) * index) / perSide,
        y: from.y + ((to.y - from.y) * index) / perSide,
      });
    }
  }
  return points;
}

function linePath(from: Point, to: Point, samples = 20): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    pts.push({ x: from.x + ((to.x - from.x) * i) / samples, y: from.y + ((to.y - from.y) * i) / samples });
  }
  return pts;
}

describe("classifyStroke", () => {
  it("snaps a hand-jittered closed square to its bounding rect", () => {
    const result = classifyStroke(jitter(squarePath(100, 100, 120)));
    expect(result?.shape).toBe("rect");
    if (result?.shape !== "rect") return;
    expect(result.geometry.x).toBeCloseTo(100, -1);
    expect(result.geometry.y).toBeCloseTo(100, -1);
    expect(result.geometry.w).toBeCloseTo(120, -1);
    expect(result.geometry.h).toBeCloseTo(120, -1);
  });

  it("snaps a closed round stroke to an ellipse inscribed in its bbox", () => {
    const result = classifyStroke(circlePath(200, 150, 50));
    expect(result?.shape).toBe("ellipse");
    if (result?.shape !== "ellipse") return;
    expect(result.geometry.cx).toBeCloseTo(200, 0);
    expect(result.geometry.cy).toBeCloseTo(150, 0);
    expect(result.geometry.rx).toBeCloseTo(50, 0);
    expect(result.geometry.ry).toBeCloseTo(50, 0);
  });

  it("snaps a hand-jittered three-corner stroke to an upright triangle", () => {
    const result = classifyStroke(jitter(trianglePath(100, 80, 120, 90), 0.8));
    expect(result?.shape).toBe("triangle");
    if (result?.shape !== "triangle") return;
    expect(result.geometry.x).toBeCloseTo(100, -1);
    expect(result.geometry.y).toBeCloseTo(80, -1);
    expect(result.geometry.w).toBeCloseTo(120, -1);
    expect(result.geometry.h).toBeCloseTo(90, -1);
  });

  it("keeps a squashed round blob an ellipse, not a rect", () => {
    // 손으로 대충 그린 타원 — 모서리가 없어야 한다
    const oval: Point[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      oval.push({ x: 300 + Math.cos(a) * 80, y: 300 + Math.sin(a) * 35 });
    }
    expect(classifyStroke(jitter(oval, 1))?.shape).toBe("ellipse");
  });

  it("accepts a square whose endpoints do not quite meet", () => {
    const open = squarePath(50, 50, 100);
    open.splice(-3); // 끝점 15px 이내 갭
    expect(classifyStroke(open)?.shape).toBe("rect");
  });

  it("locks an open wobbly stroke to a line from its first point to its last point", () => {
    const points = jitter(linePath({ x: 10, y: 200 }, { x: 180, y: 60 }));
    const result = classifyStroke(points);
    expect(result?.shape).toBe("line");
    if (result?.shape !== "line") return;
    expect(result.geometry.from).toEqual(points[0]);
    expect(result.geometry.to).toEqual(points[points.length - 1]);
  });

  it("uses the final point even when an open stroke looks like a hand-drawn arrow", () => {
    const shaft = linePath({ x: 0, y: 0 }, { x: 150, y: 0 });
    const head = linePath({ x: 150, y: 0 }, { x: 132, y: -12 }, 4);
    const result = classifyStroke([...shaft, ...head]);
    expect(result).toEqual({
      shape: "line",
      geometry: { from: { x: 0, y: 0 }, to: { x: 132, y: -12 } },
    });
  });

  it("refuses to snap a straight out-and-back stroke as a degenerate ellipse", () => {
    // 드래그로 나갔다가 같은 경로로 되짚어 시작점 근처로 돌아온 획 — 닫힘 판정은 통과하지만
    // 수직 퍼짐이 거의 없어 보이지 않는 납작 타원이 되면 안 된다
    const out = linePath({ x: 100, y: 100 }, { x: 220, y: 100 }, 20);
    const back = linePath({ x: 220, y: 100 }, { x: 100, y: 100 }, 20).slice(1);
    expect(classifyStroke(jitter([...out, ...back], 1))).toBeNull();
  });

  it("refuses to snap tiny scribbles and degenerate strokes", () => {
    expect(classifyStroke([])).toBeNull();
    expect(classifyStroke([{ x: 5, y: 5 }])).toBeNull();
    // 10px 낙서
    expect(classifyStroke(jitter(circlePath(0, 0, 4, 12), 1))).toBeNull();
    // MIN_SNAP_DIAG_PX 미만의 짧은 선
    expect(classifyStroke(linePath({ x: 0, y: 0 }, { x: 20, y: 0 }))).toBeNull();
  });

  it("locks the tuning constants that DrawingCanvas depends on", () => {
    expect(HOLD_MS).toBe(350);
    expect(RING_DELAY_MS).toBe(150);
    expect(STILL_RADIUS_PX).toBe(3.5);
    expect(MIN_SNAP_DIAG_PX).toBe(24);
    expect(CLOSED_GAP_RATIO).toBe(0.25);
    expect(MIN_CLOSED_PATH_RATIO).toBe(1.2);
    expect(CORNER_TURN_DEG).toBe(55);
    expect(MIN_RECT_CORNERS).toBe(3);
    expect(MIN_ELLIPSE_MINOR_PX).toBe(8);
  });
});

describe("projectLineEndpoint", () => {
  it("projects a 3-4-5 endpoint to the nearest 45 degree direction without changing its distance", () => {
    const projected = projectLineEndpoint({ x: 10, y: 20 }, { x: 13, y: 24 });
    expect(projected.x).toBeCloseTo(10 + Math.SQRT1_2 * 5, 8);
    expect(projected.y).toBeCloseTo(20 + Math.SQRT1_2 * 5, 8);
  });

  it("projects negative directions to the nearest 45 degree direction", () => {
    const projected = projectLineEndpoint({ x: 0, y: 0 }, { x: -3, y: -4 });
    expect(projected.x).toBeCloseTo(-Math.SQRT1_2 * 5, 8);
    expect(projected.y).toBeCloseTo(-Math.SQRT1_2 * 5, 8);
  });
});
