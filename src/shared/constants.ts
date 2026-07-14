/** 형광펜 5색 (REQUIREMENTS 확정, 순서 고정) */
export const COLORS = ["#FFD400", "#FF7A00", "#FF2D95", "#2ED573", "#00AEEF"] as const;
export type Color = (typeof COLORS)[number];
export const DEFAULT_COLOR: Color = "#FF2D95";

/** 굵기 5단계: 화면 짧은 변 대비 비율 (색과 같은 개수) */
export const WIDTHS = {
  xthin: 0.0025,
  thin: 0.004,
  medium: 0.0055,
  thick: 0.0075,
  xthick: 0.011,
} as const;
export type WidthKey = keyof typeof WIDTHS;
export const DEFAULT_WIDTH: WidthKey = "medium";
export const MIN_STROKE_PX = 2;

export function strokeWidthPx(key: WidthKey, screenShortSide: number): number {
  return Math.max(MIN_STROKE_PX, screenShortSide * WIDTHS[key]);
}

/** 텍스트 크기 = 굵기 5단계 연동 (전용 크기 UI 없음, REQUIREMENTS 확정) */
export const TEXT_SIZE_FACTOR = 5;
export const MIN_TEXT_PX = 14;

export function textSizePx(key: WidthKey, screenShortSide: number): number {
  return Math.max(MIN_TEXT_PX, strokeWidthPx(key, screenShortSide) * TEXT_SIZE_FACTOR);
}
