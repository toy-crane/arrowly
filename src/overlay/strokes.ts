import { strokePath } from "./smoothing";

export type Point = { x: number; y: number }; // CSS(logical) px
export type Stroke = { points: Point[]; color: string; width: number };

// 되돌리기 단위: 획 하나, 또는 전체 지우기 한 번(지워진 획들을 품어 ⌘Z로 복원)
type HistoryEntry =
  | { kind: "stroke"; stroke: Stroke }
  | { kind: "clear"; strokes: Stroke[] };

/** 획 상태의 단일 소스. append-only, 개별 편집 없음. */
export class StrokeStore {
  strokes: Stroke[] = [];
  live: Stroke | null = null;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

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
    this.undoStack.push({ kind: "stroke", stroke: s });
    this.redoStack = [];
    return s;
  }

  cancelLive() {
    this.live = null;
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    if (entry.kind === "stroke") this.strokes.pop();
    else this.strokes = entry.strokes.slice();
    this.redoStack.push(entry);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    if (entry.kind === "stroke") this.strokes.push(entry.stroke);
    else this.strokes = [];
    this.undoStack.push(entry);
    return true;
  }

  /** 전체 지우기 — ⌘Z 한 번으로 복원되는 명시적 동작 (빈 판 지우기는 히스토리에 남기지 않는다) */
  clear() {
    this.live = null;
    if (this.strokes.length === 0) return;
    this.undoStack.push({ kind: "clear", strokes: this.strokes });
    this.strokes = [];
    this.redoStack = [];
  }

  /** 복구 불가 리셋 — 모니터 변경 등 좌표가 무효해진 경우 전용. 히스토리까지 비운다. */
  reset() {
    this.strokes = [];
    this.undoStack = [];
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
