/** drawing 도메인 공개 API — 외부에서는 이 배럴로만 import한다. */
export {
  drawMark,
  fontString,
  measureTextWidth,
  StrokeStore,
  TEXT_FONT_FAMILY,
} from "./strokes";
export type {
  ArrowGeometry,
  EllipseGeometry,
  Mark,
  PenMark,
  RectGeometry,
  ShapeMark,
  TextMark,
} from "./strokes";
export { strokePath } from "./smoothing";
export type { Point } from "./types";
