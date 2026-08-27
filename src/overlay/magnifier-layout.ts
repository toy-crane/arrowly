export const MAGNIFIER_ZOOM = 2;
export const MAGNIFIER_WIDTH = 348;
export const MAGNIFIER_HEIGHT = 176;

const GAP = 26;
const SAFE_MARGIN = 12;

type Size = { width: number; height: number };
type Point = { x: number; y: number };
export type MagnifierRect = Point & Size;

export type MagnifierLayout = {
  lens: MagnifierRect;
  source: MagnifierRect;
  zoom: typeof MAGNIFIER_ZOOM;
};

export function placeMagnifier(viewport: Size, pointer: Point): MagnifierLayout {
  const sourceWidth = MAGNIFIER_WIDTH / MAGNIFIER_ZOOM;
  const sourceHeight = MAGNIFIER_HEIGHT / MAGNIFIER_ZOOM;
  let x = pointer.x + GAP;
  let y = pointer.y - sourceHeight / 2 - MAGNIFIER_HEIGHT - GAP;

  if (x + MAGNIFIER_WIDTH > viewport.width - SAFE_MARGIN) {
    x = pointer.x - MAGNIFIER_WIDTH - GAP;
  }
  x = Math.min(
    Math.max(x, SAFE_MARGIN),
    Math.max(SAFE_MARGIN, viewport.width - MAGNIFIER_WIDTH - SAFE_MARGIN),
  );

  if (y < SAFE_MARGIN) y = pointer.y + sourceHeight / 2 + GAP;
  y = Math.min(
    Math.max(y, SAFE_MARGIN),
    Math.max(SAFE_MARGIN, viewport.height - MAGNIFIER_HEIGHT - SAFE_MARGIN),
  );

  return {
    lens: { x, y, width: MAGNIFIER_WIDTH, height: MAGNIFIER_HEIGHT },
    source: {
      x: pointer.x - sourceWidth / 2,
      y: pointer.y - sourceHeight / 2,
      width: sourceWidth,
      height: sourceHeight,
    },
    zoom: MAGNIFIER_ZOOM,
  };
}
