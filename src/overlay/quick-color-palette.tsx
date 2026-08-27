import type { CSSProperties } from "react";
import type { Point } from "../shared/drawing";
import type { Color } from "../shared/constants";
import { t } from "../shared/i18n";
import { ColorSwatchStrip } from "./color-swatch-strip";
import { toolInspectorSurface } from "./tool-inspector";

const SAFE_MARGIN = 6;
const PALETTE_GAP = 13;
// 공용 색 행 226px + 좌우 패딩 16px + 테두리 2px.
const PALETTE_WIDTH = 244;
const PALETTE_HEIGHT = 50;

export function calculateQuickColorPalettePlacement(
  anchor: Point,
  viewportWidth: number,
  viewportHeight: number,
) {
  const left = Math.min(
    Math.max(anchor.x - PALETTE_WIDTH / 2, SAFE_MARGIN),
    Math.max(SAFE_MARGIN, viewportWidth - PALETTE_WIDTH - SAFE_MARGIN),
  );
  const opensAbove = anchor.y - PALETTE_HEIGHT - PALETTE_GAP >= SAFE_MARGIN;
  const top = opensAbove
    ? anchor.y - PALETTE_HEIGHT - PALETTE_GAP
    : Math.min(viewportHeight - PALETTE_HEIGHT - SAFE_MARGIN, anchor.y + PALETTE_GAP);
  return { left, top: Math.max(SAFE_MARGIN, top), opensAbove };
}

type Props = {
  anchor: Point;
  color: string;
  aimedColor: Color | null;
  onAimChange: (color: Color | null) => void;
};

export function QuickColorPalette({ anchor, color, aimedColor, onAimChange }: Props) {
  const placement = calculateQuickColorPalettePlacement(
    anchor,
    window.innerWidth,
    window.innerHeight,
  );

  return (
    <div
      role="group"
      aria-label={t("quickColor.palette")}
      data-placement={placement.opensAbove ? "above" : "below"}
      style={{ ...toolInspectorSurface, ...palette, left: placement.left, top: placement.top }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerLeave={() => onAimChange(null)}
    >
      <ColorSwatchStrip color={color} aimedColor={aimedColor} onAimChange={onAimChange} />
    </div>
  );
}

const palette: CSSProperties = {
  position: "fixed",
  transform: "none",
  width: PALETTE_WIDTH,
  height: PALETTE_HEIGHT,
  zIndex: 20,
};
