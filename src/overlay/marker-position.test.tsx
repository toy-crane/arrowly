import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Marker } from "./marker";

const settings = vi.hoisted(() => ({
  loadMarkerPos: vi.fn(),
  saveMarkerPos: vi.fn(),
}));

vi.mock("../shared/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/settings")>();
  return { ...actual, loadMarkerPos: settings.loadMarkerPos, saveMarkerPos: settings.saveMarkerPos };
});

describe("Marker saved position", () => {
  beforeEach(() => {
    settings.loadMarkerPos.mockReset().mockResolvedValue({ xRatio: 0.31, yRatio: 0.27 });
    settings.saveMarkerPos.mockReset().mockResolvedValue(undefined);
  });

  it("restores persisted ratios on the first mount of an isolated marker module", async () => {
    const { container } = render(
      <Marker
        color="#FF2D95"
        widthKey="medium"
        textSizeKey="medium"
        board={false}
        tool="freehand"
        drawingTool="freehand"
        onColorChange={vi.fn()}
        onWidthChange={vi.fn()}
        onTextSizeChange={vi.fn()}
        onBoardToggle={vi.fn()}
        onToolChange={vi.fn()}
      />,
    );
    const root = container.firstElementChild as HTMLElement;

    await waitFor(() => {
      expect(settings.loadMarkerPos).toHaveBeenCalledOnce();
      expect(root).toHaveStyle({ left: "31%", top: "27%" });
    });
  });
});
