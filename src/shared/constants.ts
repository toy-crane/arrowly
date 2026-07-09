/** 형광펜 5색 (REQUIREMENTS 확정, 순서 고정) */
export const COLORS = ["#FFD400", "#FF7A00", "#FF2D95", "#2ED573", "#00AEEF"] as const;
export type Color = (typeof COLORS)[number];
export const DEFAULT_COLOR: Color = "#FF2D95";

/** 굵기 3단계: 화면 짧은 변 대비 비율 */
export const WIDTHS = { thin: 0.003, medium: 0.0055, thick: 0.01 } as const;
export type WidthKey = keyof typeof WIDTHS;
export const DEFAULT_WIDTH: WidthKey = "medium";
export const MIN_STROKE_PX = 2;

export function strokeWidthPx(key: WidthKey, screenShortSide: number): number {
  return Math.max(MIN_STROKE_PX, screenShortSide * WIDTHS[key]);
}
