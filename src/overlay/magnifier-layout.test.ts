import { describe, expect, it } from "vitest";
import { placeMagnifier } from "./magnifier-layout";

describe("magnifier layout", () => {
  it("uses the default 800x400 lens over a 400x200 source on a 1080-high screen", () => {
    expect(placeMagnifier({ width: 1920, height: 1080 }, { x: 600, y: 700 })).toEqual({
      lens: { x: 626, y: 174, width: 800, height: 400 },
      source: { x: 400, y: 600, width: 400, height: 200 },
      zoom: 2,
    });
  });

  it("shrinks the lens and source together on a shorter screen", () => {
    const layout = placeMagnifier({ width: 1440, height: 900 }, { x: 700, y: 450 });

    expect(layout.lens.width).toBe(658);
    expect(layout.lens.height).toBe(329);
    expect(layout.source.width).toBe(329);
    expect(layout.source.height).toBe(164.5);
  });

  it.each([
    { width: 1440, height: 900 },
    { width: 1512, height: 982 },
    { width: 1920, height: 1080 },
  ])("never covers the source while the pointer sweeps a $width x $height screen", (viewport) => {
    for (let y = 0; y <= viewport.height; y += 10) {
      const layout = placeMagnifier(viewport, { x: viewport.width / 2, y });
      const verticallySeparate =
        layout.lens.y + layout.lens.height <= layout.source.y ||
        layout.source.y + layout.source.height <= layout.lens.y;
      expect(verticallySeparate, `pointer y=${y}`).toBe(true);
      expect(layout.lens.y).toBeGreaterThanOrEqual(12);
      expect(layout.lens.y + layout.lens.height).toBeLessThanOrEqual(viewport.height - 12);
    }
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
