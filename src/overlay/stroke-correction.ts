import type {
  EllipseGeometry,
  LineGeometry,
  Point,
  RectGeometry,
  TriangleGeometry,
} from "../shared/drawing";

/** 포인터가 이 시간 동안 멈추면 자유곡선을 보정한다. */
export const HOLD_MS = 350;
/** 보정 진행 링을 표시하기 시작하는 시점. */
export const RING_DELAY_MS = 150;
/** 이 반경 안의 포인터 움직임은 멈춤으로 취급한다. */
export const STILL_RADIUS_PX = 3.5;

const MIN_CORRECTION_DIAGONAL_PX = 24;
const CLOSED_GAP_RATIO = 0.25;
const MIN_CLOSED_PATH_RATIO = 1.2;
const CORNER_TURN_DEG = 55;
const MIN_RECT_CORNERS = 3;
const MIN_ELLIPSE_MINOR_PX = 8;

export type CorrectionResult =
  | { shape: "rect"; geometry: RectGeometry }
  | { shape: "ellipse"; geometry: EllipseGeometry }
  | { shape: "triangle"; geometry: TriangleGeometry }
  | { shape: "line"; geometry: LineGeometry };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(points: Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distance(points[index - 1], points[index]);
  }
  return length;
}

function bounds(points: Point[]): RectGeometry {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** 손의 속도 차이가 모서리 판정에 영향을 덜 주도록 호 길이 기준으로 리샘플한다. */
function resample(points: Point[], step: number): Point[] {
  const samples = [points[0]];
  let carry = 0;
  for (let index = 1; index < points.length; index += 1) {
    let from = points[index - 1];
    const to = points[index];
    let segmentLength = distance(from, to);
    while (carry + segmentLength >= step) {
      const ratio = (step - carry) / segmentLength;
      const sample = {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      };
      samples.push(sample);
      from = sample;
      segmentLength = distance(from, to);
      carry = 0;
    }
    carry += segmentLength;
  }
  return samples;
}

function countCorners(points: Point[]): number {
  const windowSize = 2;
  const duplicateSuppression = 2;
  const threshold = (CORNER_TURN_DEG * Math.PI) / 180;
  let corners = 0;
  let lastCorner = -Infinity;

  for (let index = windowSize; index < points.length - windowSize; index += 1) {
    const incoming = {
      x: points[index].x - points[index - windowSize].x,
      y: points[index].y - points[index - windowSize].y,
    };
    const outgoing = {
      x: points[index + windowSize].x - points[index].x,
      y: points[index + windowSize].y - points[index].y,
    };
    const turn = Math.abs(
      Math.atan2(
        incoming.x * outgoing.y - incoming.y * outgoing.x,
        incoming.x * outgoing.x + incoming.y * outgoing.y,
      ),
    );
    if (turn > threshold && index - lastCorner > duplicateSuppression) {
      corners += 1;
      lastCorner = index;
    }
  }
  return corners;
}

/**
 * 오래 멈춘 자유곡선을 직선 또는 닫힌 기하 형태로 분류한다.
 * 작은 획과 퇴화 형태는 보정하지 않고 자유곡선으로 유지한다.
 */
export function classifyStroke(points: Point[]): CorrectionResult | null {
  if (points.length < 2) return null;

  const frame = bounds(points);
  const diagonal = Math.hypot(frame.w, frame.h);
  if (diagonal < MIN_CORRECTION_DIAGONAL_PX) return null;

  const endpointGap = distance(points[0], points[points.length - 1]);
  const closed =
    endpointGap <= CLOSED_GAP_RATIO * diagonal &&
    pathLength(points) >= MIN_CLOSED_PATH_RATIO * diagonal;

  if (!closed) {
    return {
      shape: "line",
      geometry: { from: points[0], to: points[points.length - 1] },
    };
  }

  const step = Math.min(12, Math.max(4, diagonal / 48));
  const corners = countCorners(resample(points, step));
  if (corners >= MIN_RECT_CORNERS) {
    return { shape: "rect", geometry: frame };
  }
  if (corners === MIN_RECT_CORNERS - 1) {
    return { shape: "triangle", geometry: frame };
  }

  const minorAxis = Math.min(frame.w, frame.h) / 2;
  if (minorAxis < MIN_ELLIPSE_MINOR_PX) return null;
  return {
    shape: "ellipse",
    geometry: {
      cx: frame.x + frame.w / 2,
      cy: frame.y + frame.h / 2,
      rx: frame.w / 2,
      ry: frame.h / 2,
    },
  };
}
