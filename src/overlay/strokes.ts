import { strokePath } from "./smoothing";

export type Point = { x: number; y: number }; // CSS(logical) px

/** 자유곡선 획 — 펜으로 그린 마크. */
export type PenMark = { kind: "pen"; points: Point[]; color: string; width: number };
/** 타이핑 텍스트 — 확정 후 편집·이동 불가, 획과 같은 마크. */
export type TextMark = { kind: "text"; x: number; y: number; text: string; color: string; size: number };

export type RectGeometry = { x: number; y: number; w: number; h: number };
export type EllipseGeometry = { cx: number; cy: number; rx: number; ry: number };
export type ArrowGeometry = { from: Point; to: Point };
/** 홀드 스냅으로 정리된 도형 — 스냅 결과도 마크다. */
export type ShapeMark =
  | { kind: "shape"; shape: "rect"; geometry: RectGeometry; color: string; width: number }
  | { kind: "shape"; shape: "ellipse"; geometry: EllipseGeometry; color: string; width: number }
  | { kind: "shape"; shape: "arrow"; geometry: ArrowGeometry; color: string; width: number };

export type Mark = PenMark | TextMark | ShapeMark;

/** 마크 상태의 단일 소스. append-only, 개별 편집 없음. undo 단위 = 마크 1개. */
export class StrokeStore {
  marks: Mark[] = [];
  redoStack: Mark[] = [];
  live: PenMark | null = null;

  beginLive(color: string, width: number, p: Point) {
    this.live = { kind: "pen", points: [p], color, width };
  }

  extendLive(points: Point[]) {
    this.live?.points.push(...points);
  }

  /** live 획을 확정한다. 새 마크가 생기면 redo 스택은 무효. */
  commitLive(): PenMark | null {
    const s = this.live;
    this.live = null;
    if (!s) return null;
    if (s.points.length === 1) {
      // 제자리 클릭도 점으로 남도록 미세 이동점 추가 (zero-length 경로는 렌더되지 않음)
      const p = s.points[0];
      s.points.push({ x: p.x + 0.01, y: p.y });
    }
    this.marks.push(s);
    this.redoStack = [];
    return s;
  }

  cancelLive() {
    this.live = null;
  }

  /** 완성된 마크(텍스트·도형)를 직접 추가한다. commitLive와 같은 redo 무효 불변식. */
  push(mark: Mark) {
    this.marks.push(mark);
    this.redoStack = [];
  }

  /** 마지막 마크를 redo에 넣지 않고 회수한다 — 더블클릭 점 회수 전용. */
  retractLast(): Mark | null {
    return this.marks.pop() ?? null;
  }

  undo(): boolean {
    const s = this.marks.pop();
    if (!s) return false;
    this.redoStack.push(s);
    return true;
  }

  redo(): boolean {
    const s = this.redoStack.pop();
    if (!s) return false;
    this.marks.push(s);
    return true;
  }

  clear() {
    this.marks = [];
    this.redoStack = [];
    this.live = null;
  }
}

/** 텍스트 마크와 DOM 에디터가 공유하는 서체 — 시스템 산세리프(확정). */
export const TEXT_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';

/** 공통 잉크 스타일: 둥근 캡·조인, 외곽선·그림자 금지. */
function inkStyle(ctx: CanvasRenderingContext2D, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 1;
}

/** 마크 1개를 그린다 — base 전체 렌더와 증분 커밋 렌더가 공유하는 단일 진입점. */
export function drawMark(ctx: CanvasRenderingContext2D, m: Mark) {
  if (m.kind === "pen") {
    inkStyle(ctx, m.color, m.width);
    strokePath(ctx, m.points);
    ctx.stroke();
    return;
  }
  if (m.kind === "text") {
    ctx.globalAlpha = 1;
    ctx.fillStyle = m.color;
    ctx.font = `${m.size}px ${TEXT_FONT_FAMILY}`;
    ctx.textBaseline = "top";
    ctx.fillText(m.text, m.x, m.y);
    return;
  }
  inkStyle(ctx, m.color, m.width);
  if (m.shape === "rect") {
    const g = m.geometry;
    ctx.beginPath();
    ctx.rect(g.x, g.y, g.w, g.h);
    ctx.stroke();
  } else if (m.shape === "ellipse") {
    const g = m.geometry;
    ctx.beginPath();
    ctx.ellipse(g.cx, g.cy, g.rx, g.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const { from, to } = m.geometry;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    const shaft = Math.hypot(to.x - from.x, to.y - from.y);
    const head = Math.min(Math.max(12, m.width * 3.5), shaft * 0.4);
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - head * Math.cos(ang - Math.PI / 6), to.y - head * Math.sin(ang - Math.PI / 6));
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - head * Math.cos(ang + Math.PI / 6), to.y - head * Math.sin(ang + Math.PI / 6));
    ctx.stroke();
  }
}
