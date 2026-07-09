import { strokePath } from "./smoothing";

export type Point = { x: number; y: number }; // CSS(logical) px
export type Stroke = { points: Point[]; color: string; width: number };

/** 획 상태의 단일 소스. append-only, 개별 편집 없음. */
export class StrokeStore {
  strokes: Stroke[] = [];
  redoStack: Stroke[] = [];
  live: Stroke | null = null;

  beginLive(color: string, width: number, p: Point) {
    this.live = { points: [p], color, width };
  }

  extendLive(points: Point[]) {
    this.live?.points.push(...points);
  }

  /** live 획을 확정한다. 새 획이 생기면 redo 스택은 무효. */
  commitLive(): Stroke | null {
    const s = this.live;
    this.live = null;
    if (!s) return null;
    if (s.points.length === 1) {
      // 제자리 클릭도 점으로 남도록 미세 이동점 추가 (zero-length 경로는 렌더되지 않음)
      const p = s.points[0];
      s.points.push({ x: p.x + 0.01, y: p.y });
    }
    this.strokes.push(s);
    this.redoStack = [];
    return s;
  }

  cancelLive() {
    this.live = null;
  }

  undo(): boolean {
    const s = this.strokes.pop();
    if (!s) return false;
    this.redoStack.push(s);
    return true;
  }

  redo(): boolean {
    const s = this.redoStack.pop();
    if (!s) return false;
    this.strokes.push(s);
    return true;
  }

  clear() {
    this.strokes = [];
    this.redoStack = [];
    this.live = null;
  }
}

/** 공통 획 스타일: 둥근 캡·조인, 외곽선·그림자 금지. */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 1;
  strokePath(ctx, s.points);
  ctx.stroke();
}
