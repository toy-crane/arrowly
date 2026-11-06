import type { CSSProperties } from "react";
import type { Point } from "../shared/drawing";
import { type Color, COLORS } from "../shared/constants";
import { t } from "../shared/i18n";
import { ColorSwatchStrip } from "./color-swatch-strip";
import { toolInspectorSurface } from "./tool-inspector";

const SAFE_MARGIN = 6;
const PALETTE_GAP = 13;
// 공용 색 행 226px + 좌우 패딩 16px + 테두리 2px.
const PALETTE_WIDTH = 244;
const PALETTE_HEIGHT = 50;
// 테두리 1px + 패딩 8px + 셀 반폭 21px.
const FIRST_SWATCH_CENTER = 30;
// 셀 42px + 간격 4px. 문지르기 한 칸의 거리도 이 값이다.
const SWATCH_PITCH = 46;

/** 현재 색 견본이 포인터 바로 위에 오도록 두되, 안전 여백 안으로 밀어 넣는다. */
export function calculateQuickColorPalettePlacement(
  anchor: Point,
  viewportWidth: number,
  viewportHeight: number,
  currentIndex: number,
) {
  const centered = anchor.x - FIRST_SWATCH_CENTER - currentIndex * SWATCH_PITCH;
  const left = Math.min(
    Math.max(centered, SAFE_MARGIN),
    Math.max(SAFE_MARGIN, viewportWidth - PALETTE_WIDTH - SAFE_MARGIN),
  );
  const opensAbove = anchor.y - PALETTE_HEIGHT - PALETTE_GAP >= SAFE_MARGIN;
  const top = opensAbove
    ? anchor.y - PALETTE_HEIGHT - PALETTE_GAP
    : Math.min(viewportHeight - PALETTE_HEIGHT - SAFE_MARGIN, anchor.y + PALETTE_GAP);
  return { left, top: Math.max(SAFE_MARGIN, top), opensAbove };
}

/** 포인터의 가로 위치 아래에 있는 견본 열. 팔레트 바깥은 가까운 끝 열이다. */
export function quickColorColumnAt(x: number, paletteLeft: number): number {
  const column = Math.round((x - paletteLeft - FIRST_SWATCH_CENTER) / SWATCH_PITCH);
  return Math.min(Math.max(column, 0), COLORS.length - 1);
}

type Props = {
  anchor: Point;
  color: Color;
  previewColor: Color;
  onSelect: (color: Color) => void;
};

export function QuickColorPalette({ anchor, color, previewColor, onSelect }: Props) {
  const placement = calculateQuickColorPalettePlacement(
    anchor,
    window.innerWidth,
    window.innerHeight,
    COLORS.indexOf(color),
  );

  return (
    <div
      role="group"
      aria-label={t("quickColor.palette")}
      data-placement={placement.opensAbove ? "above" : "below"}
      style={{ ...toolInspectorSurface, ...palette, left: placement.left, top: placement.top }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <ColorSwatchStrip color={color} aimedColor={previewColor} onSelect={onSelect} />
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
