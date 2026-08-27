import { describe, expect, it } from "vitest";
import { placeMagnifier } from "./magnifier-layout";

describe("magnifier layout", () => {
  it("places the 2x lens above-right of a central pointer and maps its source exactly", () => {
    expect(placeMagnifier({ width: 1200, height: 800 }, { x: 600, y: 400 })).toEqual({
      lens: { x: 626, y: 154, width: 348, height: 176 },
      source: { x: 513, y: 356, width: 174, height: 88 },
      zoom: 2,
    });
  });

  it("flips below-left at the top-right edge without clipping or covering the source", () => {
    const layout = placeMagnifier({ width: 1200, height: 800 }, { x: 1180, y: 20 });

    expect(layout.lens).toEqual({ x: 806, y: 90, width: 348, height: 176 });
    expect(layout.lens.x).toBeGreaterThanOrEqual(12);
    expect(layout.lens.y).toBeGreaterThanOrEqual(12);
    expect(layout.lens.x + layout.lens.width).toBeLessThanOrEqual(1188);
    expect(layout.lens.y + layout.lens.height).toBeLessThanOrEqual(788);
    expect(layout.lens.y).toBeGreaterThanOrEqual(layout.source.y + layout.source.height + 26);
  });

  it.each([
    { x: 20, y: 20 },
    { x: 1180, y: 20 },
    { x: 20, y: 780 },
    { x: 1180, y: 780 },
  ])("keeps the lens safe and separate from the source at edge pointer $x,$y", (pointer) => {
    const layout = placeMagnifier({ width: 1200, height: 800 }, pointer);

    expect(layout.lens.x).toBeGreaterThanOrEqual(12);
    expect(layout.lens.y).toBeGreaterThanOrEqual(12);
    expect(layout.lens.x + layout.lens.width).toBeLessThanOrEqual(1188);
    expect(layout.lens.y + layout.lens.height).toBeLessThanOrEqual(788);

    const horizontallySeparate =
      layout.lens.x + layout.lens.width <= layout.source.x ||
      layout.source.x + layout.source.width <= layout.lens.x;
    const verticallySeparate =
      layout.lens.y + layout.lens.height <= layout.source.y ||
      layout.source.y + layout.source.height <= layout.lens.y;
    expect(horizontallySeparate || verticallySeparate).toBe(true);
  });
});
