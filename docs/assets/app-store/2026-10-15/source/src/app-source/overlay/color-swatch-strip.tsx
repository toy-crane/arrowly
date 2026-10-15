import type { CSSProperties } from "react";
import { type Color, COLORS } from "../shared/constants";
import { t, type Key } from "../shared/i18n";

const NEUTRAL = "#E8EAF0";

const COLOR_NAME_KEYS: Record<Color, Key> = {
  "#FFD400": "marker.colorName.yellow",
  "#FF7A00": "marker.colorName.orange",
  "#FF2D95": "marker.colorName.pink",
  "#2ED573": "marker.colorName.green",
  "#00AEEF": "marker.colorName.blue",
};

type Props = {
  color: string;
  aimedColor?: Color | null;
  onAimChange?: (color: Color) => void;
  onSelect?: (color: Color) => void;
};

/** 마커 속성창과 빠른 색 팔레트가 공유하는 단일 색 선택 행. */
export function ColorSwatchStrip({ color, aimedColor, onAimChange, onSelect }: Props) {
  return (
    <div style={strip}>
      {COLORS.map((swatch) => {
        const label = t("marker.colorValue", { value: t(COLOR_NAME_KEYS[swatch]) });
        return (
          <button
            key={swatch}
            type="button"
            aria-label={label}
            aria-pressed={swatch === color}
            title={label}
            style={{
              ...choice,
              cursor: onSelect ? "pointer" : "default",
              ...(swatch === color ? activeCell : undefined),
              ...(swatch === aimedColor ? aimedCell : undefined),
            }}
            onPointerEnter={() => onAimChange?.(swatch)}
            onClick={onSelect ? () => onSelect(swatch) : undefined}
          >
            <span
              style={{
                ...dot,
                background: swatch,
                ...(swatch === color ? currentRing : undefined),
                ...(swatch === aimedColor ? aimedRing : undefined),
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

const strip: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const choice: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 42,
  height: 32,
  padding: 0,
  background: "none",
  border: "none",
  borderRadius: 8,
  lineHeight: 1,
};

const activeCell: CSSProperties = { background: "rgba(255,255,255,0.08)" };
const aimedCell: CSSProperties = {
  background: "rgba(255,255,255,0.20)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.20)",
};
const dot: CSSProperties = { width: 17, height: 17, borderRadius: "50%", display: "block" };
const currentRing: CSSProperties = { outline: `2px solid ${NEUTRAL}`, outlineOffset: 2.5 };
const aimedRing: CSSProperties = { outline: "2px solid #FFFFFF", outlineOffset: 3.5 };
