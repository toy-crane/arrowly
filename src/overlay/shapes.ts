import type { ArrowGeometry, EllipseGeometry, Point, RectGeometry } from "../shared/drawing";

// 홀드 스냅 파라미터 — 감도 튜닝은 이 상수들로만 한다 (Mac 수동 체크리스트가 게이트).
/** 이 시간 동안 버튼을 누른 채 멈추면 스냅한다. */
export const HOLD_MS = 600;
/** 멈춘 뒤 진행 링이 보이기 시작하는 시점. */
export const RING_DELAY_MS = 200;
/** 이 반경 안의 움직임은 "멈춤"으로 친다. */
export const STILL_RADIUS_PX = 3.5;
/** bbox 대각선이 이보다 작은 획은 스냅하지 않는다(낙서·점). */
export const MIN_SNAP_DIAG_PX = 24;
/** 끝점 간 거리가 대각선의 이 비율 이하면 닫힌 획. */
export const CLOSED_GAP_RATIO = 0.25;
/** 닫힌 획은 경로 길이가 대각선의 이 배수 이상이어야 한다(짧은 갈고리 배제). */
export const MIN_CLOSED_PATH_RATIO = 1.2;
/** 리샘플 점에서 이 각도(도) 이상 꺾이면 모서리. */
export const CORNER_TURN_DEG = 55;
/** 모서리가 이 개수 이상이면 사각형, 미만이면 원/타원. */
export const MIN_RECT_CORNERS = 3;
/** 닫힌 획이 타원으로 스냅되려면 짧은 축(bbox 반변)이 이 값 이상이어야 한다.
 * 미만이면 직선 왕복(같은 경로를 되짚어온 획) 같은 퇴화 형태일 가능성이 높아 손그림으로 남긴다. */
export const MIN_ELLIPSE_MINOR_PX = 8; // MIN_SNAP_DIAG_PX / 3

export type SnapResult =
  | { shape: "rect"; geometry: RectGeometry }
  | { shape: "ellipse"; geometry: EllipseGeometry }
  | { shape: "arrow"; geometry: ArrowGeometry };

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(points: Point[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += dist(points[i - 1], points[i]);
  return sum;
}

function bounds(points: Point[]): RectGeometry {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const p of points) {
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x);
    y2 = Math.max(y2, p.y);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** 호길이 기준 등간격 리샘플 — 손 속도 편차를 지우고 각도 판정을 안정화한다. */
function resample(points: Point[], step: number): Point[] {
  const out = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1];
    const b = points[i];
    let seg = dist(a, b);
    while (carry + seg >= step) {
      const t = (step - carry) / seg;
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(q);
      a = q;
      seg = dist(a, b);
      carry = 0;
    }
    carry += seg;
  }
  return out;
}

/** 리샘플 점열에서 CORNER_TURN_DEG 이상 꺾이는 지점 수. 히트 직후 표본은 억제한다. */
function countCorners(rs: Point[]): number {
  const K = 2; // 회전각을 재는 창 크기(표본)
  const SUPPRESS = 2; // 같은 모서리의 중복 검출 방지
  const threshold = (CORNER_TURN_DEG * Math.PI) / 180;
  let corners = 0;
  let lastHit = -Infinity;
  for (let i = K; i < rs.length - K; i++) {
    const v1 = { x: rs[i].x - rs[i - K].x, y: rs[i].y - rs[i - K].y };
    const v2 = { x: rs[i + K].x - rs[i].x, y: rs[i + K].y - rs[i].y };
    const turn = Math.abs(Math.atan2(v1.x * v2.y - v1.y * v2.x, v1.x * v2.x + v1.y * v2.y));
    if (turn > threshold && i - lastHit > SUPPRESS) {
      corners += 1;
      lastHit = i;
    }
  }
  return corners;
}

/**
 * 홀드된 획을 도형으로 분류한다. 닫힌 획 → 모서리 수로 사각형/타원,
 * 열린 획 → 시작점→최원점 화살표. 직선 스냅은 없다(REQUIREMENTS).
 * 스냅 불가(과소)면 null — 호출자는 손그림을 유지한다.
 */
export function classifyStroke(points: Point[]): SnapResult | null {
  if (points.length < 2) return null;
  const bbox = bounds(points);
  const diag = Math.hypot(bbox.w, bbox.h);
  if (diag < MIN_SNAP_DIAG_PX) return null;

  const length = pathLength(points);
  const endpointGap = dist(points[0], points[points.length - 1]);
  const closed = endpointGap <= CLOSED_GAP_RATIO * diag && length >= MIN_CLOSED_PATH_RATIO * diag;

  if (closed) {
    const step = Math.min(12, Math.max(4, diag / 48));
    const rs = resample(points, step);
    if (countCorners(rs) >= MIN_RECT_CORNERS) {
      return { shape: "rect", geometry: bbox };
    }
    const minorAxis = Math.min(bbox.w, bbox.h) / 2;
    if (minorAxis < MIN_ELLIPSE_MINOR_PX) return null; // 직선 왕복 등 — 찌그러진 타원으로 오인하지 않는다
    return {
      shape: "ellipse",
      geometry: { cx: bbox.x + bbox.w / 2, cy: bbox.y + bbox.h / 2, rx: bbox.w / 2, ry: bbox.h / 2 },
    };
  }

  // 열린 획: 화살촉을 직접 그렸어도(끝에서 되돌아온 자국) 최원점이 촉 끝이 된다
  let tip = points[0];
  let best = 0;
  for (const p of points) {
    const d = dist(points[0], p);
    if (d > best) {
      best = d;
      tip = p;
    }
  }
  if (best < MIN_SNAP_DIAG_PX) return null;
  return { shape: "arrow", geometry: { from: points[0], to: tip } };
}
