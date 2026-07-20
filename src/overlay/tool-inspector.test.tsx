import { describe, expect, it } from "vitest";
import { calculateToolInspectorPlacement } from "./tool-inspector";

describe("ToolInspector placement", () => {
  it("clamps the panel, keeps the arrow on its anchor and opens below using measured height", () => {
    expect(
      calculateToolInspectorPlacement({
        anchorLeft: 214,
        anchorWidth: 42,
        markerTop: 80,
        panelWidth: 306,
        panelHeight: 86,
        viewportWidth: 320,
      }),
    ).toEqual({ panelLeft: 8, arrowLeft: 222.5, openBelow: true });
  });
});
