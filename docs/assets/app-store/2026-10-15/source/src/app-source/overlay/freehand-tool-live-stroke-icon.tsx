import type { WidthKey } from "../shared/constants";

const ICON_STROKE_WIDTHS: Record<WidthKey, number> = {
  xthin: 2,
  thin: 2.6,
  medium: 3.2,
  thick: 4.2,
  xthick: 5.6,
};

export function drawingToolIconStrokeWidth(widthKey: WidthKey): number {
  return ICON_STROKE_WIDTHS[widthKey];
}

export function FreehandToolLiveStrokeIcon({ widthKey }: { widthKey: WidthKey }) {
  return (
    <svg
      width="24"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={drawingToolIconStrokeWidth(widthKey)}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 15.8c3.2-7.4 6.3-7.5 8.2-3.2 2.1 4.8 6 3.7 9.8-2.5" />
    </svg>
  );
}
