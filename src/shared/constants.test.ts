import { describe, expect, it } from "vitest";
import {
  COLORS,
  DEFAULT_COLOR,
  DEFAULT_WIDTH,
  MIN_STROKE_PX,
  MIN_TEXT_PX,
  strokeWidthPx,
  TEXT_SIZE_FACTOR,
  textSizePx,
  WidthKey,
  WIDTHS,
} from "./constants";

describe("drawing constants", () => {
  it("keeps the fixed five-color and five-width product contract", () => {
    expect(COLORS).toEqual(["#FFD400", "#FF7A00", "#FF2D95", "#2ED573", "#00AEEF"]);
    expect(Object.keys(WIDTHS)).toEqual(["xthin", "thin", "medium", "thick", "xthick"]);
    expect(COLORS).toContain(DEFAULT_COLOR);
    expect(DEFAULT_WIDTH).toBe("medium");
  });

  it("scales widths by the short side with a minimum floor", () => {
    expect(strokeWidthPx("xthin", 100)).toBe(MIN_STROKE_PX);
    expect(strokeWidthPx("medium", 1000)).toBe(5.5);
    expect(strokeWidthPx("xthick", 2000)).toBe(22);
  });

  it("derives text size from the five width steps with a readable floor", () => {
    // 굵기 5단계 × TEXT_SIZE_FACTOR, 최소 MIN_TEXT_PX — 1080px 짧은 변 기준 테이블
    const expected: Record<WidthKey, number> = {
      xthin: Math.max(MIN_TEXT_PX, 1080 * 0.0025 * TEXT_SIZE_FACTOR),
      thin: 1080 * 0.004 * TEXT_SIZE_FACTOR,
      medium: 1080 * 0.0055 * TEXT_SIZE_FACTOR,
      thick: 1080 * 0.0075 * TEXT_SIZE_FACTOR,
      xthick: 1080 * 0.011 * TEXT_SIZE_FACTOR,
    };
    for (const key of Object.keys(WIDTHS) as WidthKey[]) {
      expect(textSizePx(key, 1080)).toBeCloseTo(expected[key]);
    }
    // 아주 작은 화면에서도 강의 판서로 읽히는 최소 크기를 지킨다
    expect(textSizePx("xthin", 100)).toBe(MIN_TEXT_PX);
  });
});
