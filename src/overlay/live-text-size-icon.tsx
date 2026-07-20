import type { CSSProperties } from "react";
import type { TextSizeKey } from "../shared/constants";

const COLLAPSED_TEXT_DISPLAY_SIZES: Record<TextSizeKey, number> = {
  xsmall: 15,
  small: 17,
  medium: 19,
  large: 22,
  xlarge: 24,
};

export function LiveTextSizeIcon({ sizeKey }: { sizeKey: TextSizeKey }) {
  return <span style={{ ...textGlyph, fontSize: COLLAPSED_TEXT_DISPLAY_SIZES[sizeKey] }}>T</span>;
}

const textGlyph: CSSProperties = {
  color: "#E8EAF0",
  fontWeight: 650,
  lineHeight: 1,
};
