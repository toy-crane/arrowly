import { describe, expect, it } from "vitest";
import {
  COLORS,
  DEFAULT_COLOR,
  DEFAULT_TEXT_SIZE,
  DEFAULT_WIDTH,
  MIN_STROKE_PX,
  stepTextSize,
  strokeWidthPx,
  TEXT_SIZE_KEYS,
  TEXT_SIZES,
  textSizePx,
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

  it("keeps text size independent as five fixed pixel steps", () => {
    expect(TEXT_SIZES).toEqual({ xsmall: 16, small: 22, medium: 30, large: 40, xlarge: 54 });
    expect(TEXT_SIZE_KEYS).toEqual(["xsmall", "small", "medium", "large", "xlarge"]);
    expect(DEFAULT_TEXT_SIZE).toBe("medium");
    expect(textSizePx("xsmall")).toBe(16);
    expect(textSizePx("xlarge")).toBe(54);
  });

  it("steps text size and clamps silently at both ends", () => {
    expect(stepTextSize("medium", -1)).toBe("small");
    expect(stepTextSize("medium", 1)).toBe("large");
    expect(stepTextSize("xsmall", -1)).toBe("xsmall");
    expect(stepTextSize("xlarge", 1)).toBe("xlarge");
  });
});
