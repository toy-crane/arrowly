import { describe, expect, it } from "vitest";
import {
  COLORS,
  DEFAULT_COLOR,
  DEFAULT_TEXT_SIZE,
  DEFAULT_WIDTH,
  MIN_STROKE_PX,
  stepWidth,
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
    expect(TEXT_SIZES).toEqual({ xsmall: 24, small: 32, medium: 44, large: 60, xlarge: 80 });
    expect(TEXT_SIZE_KEYS).toEqual(["xsmall", "small", "medium", "large", "xlarge"]);
    expect(DEFAULT_TEXT_SIZE).toBe("small");
    expect(textSizePx("xsmall")).toBe(24);
    expect(textSizePx("xlarge")).toBe(80);
  });

  it("steps text size and clamps silently at both ends", () => {
    expect(stepTextSize("medium", -1)).toBe("small");
    expect(stepTextSize("medium", 1)).toBe("large");
    expect(stepTextSize("xsmall", -1)).toBe("xsmall");
    expect(stepTextSize("xlarge", 1)).toBe("xlarge");
  });

  it("steps pen width and clamps silently at both ends", () => {
    expect(stepWidth("medium", -1)).toBe("thin");
    expect(stepWidth("medium", 1)).toBe("thick");
    expect(stepWidth("xthin", -1)).toBe("xthin");
    expect(stepWidth("xthick", 1)).toBe("xthick");
  });
});
