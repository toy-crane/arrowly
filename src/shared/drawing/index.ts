/** drawing 도메인 공개 API — 외부에서는 이 배럴로만 import한다. */
export {
  drawMark,
  findTextMarkAt,
  fontString,
  layoutText,
  measureTextWidth,
  StrokeStore,
  textCaretOffsetAt,
  TEXT_FONT_FAMILY,
  TEXT_HIT_PADDING_PX,
  TEXT_LINE_HEIGHT_RATIO,
} from "./strokes";
export type {
  EllipseGeometry,
  LineGeometry,
  Mark,
  PenMark,
  RectGeometry,
  ShapeMark,
  TextMark,
  TextHit,
  TextLayout,
  TextLineLayout,
} from "./strokes";
export { strokePath } from "./smoothing";
export type { Point } from "./types";
