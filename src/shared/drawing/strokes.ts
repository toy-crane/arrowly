import { strokePath } from "./smoothing";
import type { Point } from "./types";
import { textSizePx, type TextSizeKey } from "../constants";

/** 자유곡선 획 — 펜으로 그린 마크. */
export type PenMark = { kind: "pen"; points: Point[]; color: string; width: number };
/** 타이핑 텍스트 — 위치·색은 고정하고 내용·크기만 다시 교정할 수 있는 마크. */
export type TextMark = {
  kind: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  sizeKey: TextSizeKey;
};

export type RectGeometry = { x: number; y: number; w: number; h: number };
export type EllipseGeometry = { cx: number; cy: number; rx: number; ry: number };
export type ArrowGeometry = { from: Point; to: Point };
/** 홀드 스냅으로 정리된 도형 — 스냅 결과도 마크다. */
export type ShapeMark =
  | { kind: "shape"; shape: "rect"; geometry: RectGeometry; color: string; width: number }
  | { kind: "shape"; shape: "ellipse"; geometry: EllipseGeometry; color: string; width: number }
  | { kind: "shape"; shape: "arrow"; geometry: ArrowGeometry; color: string; width: number };

export type Mark = PenMark | TextMark | ShapeMark;

type HistoryEntry =
  | { kind: "insert"; index: number; mark: Mark }
  | { kind: "replace"; index: number; before: Mark; after: Mark }
  | { kind: "remove"; index: number; mark: Mark };

function sameMark(a: Mark, b: Mark): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 마크 상태의 단일 소스. 추가·텍스트 교체·텍스트 삭제가 각각 undo 한 단위다. */
export class StrokeStore {
  marks: Mark[] = [];
  history: HistoryEntry[] = [];
  redoStack: HistoryEntry[] = [];
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
    this.recordInsert(s);
    return s;
  }

  cancelLive() {
    this.live = null;
  }

  /** 완성된 마크(텍스트·도형)를 직접 추가한다. commitLive와 같은 redo 무효 불변식. */
  push(mark: Mark) {
    this.recordInsert(mark);
  }

  /** 마지막 마크와 직전 insert 이력을 함께 회수한다 — 더블클릭 점 회수 전용. */
  retractLast(): Mark | null {
    const index = this.marks.length - 1;
    const mark = this.marks.pop() ?? null;
    if (!mark) return null;
    const last = this.history[this.history.length - 1];
    if (last?.kind === "insert" && last.index === index && last.mark === mark) {
      this.history.pop();
    }
    return mark;
  }

  /** 기존 마크를 같은 z-order 위치에서 교체한다. 동일 값은 이력을 만들지 않는다. */
  replace(index: number, mark: Mark): boolean {
    const before = this.marks[index];
    if (!before || sameMark(before, mark)) return false;
    const entry: HistoryEntry = { kind: "replace", index, before, after: mark };
    this.applyForward(entry);
    this.record(entry);
    return true;
  }

  /** 기존 마크를 제거하고 원래 위치 복원이 가능한 이력을 남긴다. */
  remove(index: number): Mark | null {
    const mark = this.marks[index];
    if (!mark) return null;
    const entry: HistoryEntry = { kind: "remove", index, mark };
    this.applyForward(entry);
    this.record(entry);
    return mark;
  }

  undo(): boolean {
    const entry = this.history.pop();
    if (!entry) return false;
    this.applyBackward(entry);
    this.redoStack.push(entry);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.applyForward(entry);
    this.history.push(entry);
    return true;
  }

  clear() {
    this.marks = [];
    this.history = [];
    this.redoStack = [];
    this.live = null;
  }

  private recordInsert(mark: Mark) {
    const entry: HistoryEntry = { kind: "insert", index: this.marks.length, mark };
    this.applyForward(entry);
    this.record(entry);
  }

  private record(entry: HistoryEntry) {
    this.history.push(entry);
    this.redoStack = [];
  }

  private applyForward(entry: HistoryEntry) {
    if (entry.kind === "insert") {
      this.marks.splice(entry.index, 0, entry.mark);
    } else if (entry.kind === "replace") {
      this.marks[entry.index] = entry.after;
    } else {
      this.marks.splice(entry.index, 1);
    }
  }

  private applyBackward(entry: HistoryEntry) {
    if (entry.kind === "insert") {
      this.marks.splice(entry.index, 1);
    } else if (entry.kind === "replace") {
      this.marks[entry.index] = entry.before;
    } else {
      this.marks.splice(entry.index, 0, entry.mark);
    }
  }
}

/** 텍스트 마크와 DOM 에디터가 공유하는 서체 — 시스템 산세리프(확정). */
export const TEXT_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';

/** 캔버스 마크와 DOM 에디터가 공유하는 완성된 font 문자열 — 조립 중복을 막는 단일 진입점. */
export function fontString(size: number | TextSizeKey): string {
  const px = typeof size === "number" ? size : textSizePx(size);
  return `${px}px ${TEXT_FONT_FAMILY}`;
}

/** size 크기의 마크 서체로 text의 렌더 폭(px)을 잰다. 빈 문자열은 캐럿 한 칸 폭으로 최소화한다.
 * 측정용 캔버스는 매 호출 생성(cursor.ts와 같은 패턴) — 모듈 캐시는 테스트별
 * installCanvasMock() 격리를 깨뜨리고, 타이핑 속도에서는 생성 비용이 무시할 수준이다. */
export function measureTextWidth(text: string, size: number | TextSizeKey): number {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = fontString(size);
  return ctx.measureText(text || " ").width;
}

export const TEXT_HIT_PADDING_PX = 6;

export type TextHit = { index: number; mark: TextMark };

/** 가장 위에 그려진 텍스트부터 실제 글자 영역 + 여유 안에 점이 들어오는지 찾는다. */
export function findTextMarkAt(marks: Mark[], point: Point): TextHit | null {
  for (let index = marks.length - 1; index >= 0; index -= 1) {
    const mark = marks[index];
    if (mark.kind !== "text") continue;
    const width = measureTextWidth(mark.text, mark.sizeKey);
    const height = textSizePx(mark.sizeKey);
    if (
      point.x >= mark.x - TEXT_HIT_PADDING_PX &&
      point.x <= mark.x + width + TEXT_HIT_PADDING_PX &&
      point.y >= mark.y - TEXT_HIT_PADDING_PX &&
      point.y <= mark.y + height + TEXT_HIT_PADDING_PX
    ) {
      return { index, mark };
    }
  }
  return null;
}

type Grapheme = { segment: string; index: number };
type SegmenterLike = { segment: (input: string) => Iterable<Grapheme> };
type SegmenterConstructor = new (
  locale?: string | string[],
  options?: { granularity: "grapheme" },
) => SegmenterLike;

function graphemeBoundaries(text: string): number[] {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: SegmenterConstructor;
    }
  ).Segmenter;
  if (Segmenter) {
    const boundaries = [0];
    for (const item of new Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
      boundaries.push(item.index + item.segment.length);
    }
    return boundaries;
  }
  const boundaries = [0];
  let offset = 0;
  for (const codePoint of Array.from(text)) {
    offset += codePoint.length;
    boundaries.push(offset);
  }
  return boundaries;
}

/** 클릭 X와 가장 가까운 grapheme 경계를 DOM input의 UTF-16 selection offset으로 반환한다. */
export function textCaretOffsetAt(mark: TextMark, clickX: number): number {
  const relativeX = clickX - mark.x;
  const boundaries = graphemeBoundaries(mark.text);
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (const boundary of boundaries) {
    const width = measureTextWidth(mark.text.slice(0, boundary), mark.sizeKey);
    const nextDistance = Math.abs(relativeX - width);
    if (nextDistance < distance) {
      best = boundary;
      distance = nextDistance;
    }
  }
  return best;
}

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
    ctx.font = fontString(m.sizeKey);
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
