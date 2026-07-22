/** 그리기 스펙의 형광펜 5색 — 순서 고정. */
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
export const WIDTH_KEYS = Object.keys(WIDTHS) as WidthKey[];
export const DEFAULT_WIDTH: WidthKey = "medium";
export const MIN_STROKE_PX = 2;

export function strokeWidthPx(key: WidthKey, screenShortSide: number): number {
  return Math.max(MIN_STROKE_PX, screenShortSide * WIDTHS[key]);
}

export function stepWidth(key: WidthKey, delta: -1 | 1): WidthKey {
  const index = WIDTH_KEYS.indexOf(key);
  const next = Math.min(WIDTH_KEYS.length - 1, Math.max(0, index + delta));
  return WIDTH_KEYS[next];
}

/** 텍스트 크기 5단계 — 펜 굵기·화면 해상도와 독립적인 고정 CSS px. */
export const TEXT_SIZES = {
  xsmall: 24,
  small: 32,
  medium: 44,
  large: 60,
  xlarge: 80,
} as const;
export type TextSizeKey = keyof typeof TEXT_SIZES;
export const TEXT_SIZE_KEYS = Object.keys(TEXT_SIZES) as TextSizeKey[];
export const DEFAULT_TEXT_SIZE: TextSizeKey = "small";

export function textSizePx(key: TextSizeKey): number {
  return TEXT_SIZES[key];
}

export function stepTextSize(key: TextSizeKey, delta: -1 | 1): TextSizeKey {
  const index = TEXT_SIZE_KEYS.indexOf(key);
  const next = Math.min(TEXT_SIZE_KEYS.length - 1, Math.max(0, index + delta));
  return TEXT_SIZE_KEYS[next];
}
