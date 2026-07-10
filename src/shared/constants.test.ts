import { describe, expect, it } from "vitest";
import { COLORS, DEFAULT_COLOR, DEFAULT_WIDTH, MIN_STROKE_PX, strokeWidthPx, WIDTHS } from "./constants";

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
});
