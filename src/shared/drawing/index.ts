/** drawing 도메인 공개 API — 외부에서는 이 배럴로만 import한다. */
export {
  drawMark,
  findMarkAt,
  findMovableMarkAt,
  findTextMarkAt,
  fontString,
  layoutText,
  markFrameBounds,
  measureTextWidth,
  StrokeStore,
  textCaretOffsetAt,
  translateMark,
  MARK_HIT_PADDING_PX,
  TEXT_FONT_FAMILY,
  TEXT_HIT_PADDING_PX,
  TEXT_LINE_HEIGHT_RATIO,
} from "./strokes";
export type {
  EllipseGeometry,
  LineGeometry,
  LineMark,
  Mark,
  MarkHit,
  PenMark,
  RectGeometry,
  ShapeMark,
  TriangleGeometry,
  TextMark,
  TextHit,
  TextLayout,
  TextLineLayout,
} from "./strokes";
export { strokePath } from "./smoothing";
export type { Point } from "./types";
