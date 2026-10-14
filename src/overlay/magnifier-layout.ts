export const MAGNIFIER_ZOOM = 2;
const DEFAULT_LENS_WIDTH = 800;
const DEFAULT_LENS_HEIGHT = 400;

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

// 렌즈는 커서 위나 아래에 확대 원본과 겹치지 않게 놓인다. 어느 높이의 커서에서도
// 둘 중 한쪽에 들어가려면 화면 절반이 여백·간격·렌즈·원본 절반을 담아야 하므로,
// 낮은 화면에서는 비율과 배율을 유지한 채 그 높이에 맞춰 렌즈와 원본을 함께 줄인다.
function lensSize(viewport: Size): Size {
  const sourceHalfPerLens = 1 / MAGNIFIER_ZOOM / 2;
  const fitHeight = (viewport.height / 2 - SAFE_MARGIN - GAP) / (1 + sourceHalfPerLens);
  const fitWidth = viewport.width - SAFE_MARGIN * 2;
  const aspect = DEFAULT_LENS_WIDTH / DEFAULT_LENS_HEIGHT;
  const height = Math.max(
    0,
    Math.floor(Math.min(DEFAULT_LENS_HEIGHT, fitHeight, fitWidth / aspect)),
  );
  return { width: height * aspect, height };
}

export function placeMagnifier(viewport: Size, pointer: Point): MagnifierLayout {
  const { width, height } = lensSize(viewport);
  const sourceWidth = width / MAGNIFIER_ZOOM;
  const sourceHeight = height / MAGNIFIER_ZOOM;
  let x = pointer.x + GAP;
  let y = pointer.y - sourceHeight / 2 - height - GAP;

  if (x + width > viewport.width - SAFE_MARGIN) {
    x = pointer.x - width - GAP;
  }
  x = Math.min(
    Math.max(x, SAFE_MARGIN),
    Math.max(SAFE_MARGIN, viewport.width - width - SAFE_MARGIN),
  );

  if (y < SAFE_MARGIN) y = pointer.y + sourceHeight / 2 + GAP;
  y = Math.min(
    Math.max(y, SAFE_MARGIN),
    Math.max(SAFE_MARGIN, viewport.height - height - SAFE_MARGIN),
  );

  return {
    lens: { x, y, width, height },
    source: {
      x: pointer.x - sourceWidth / 2,
      y: pointer.y - sourceHeight / 2,
      width: sourceWidth,
      height: sourceHeight,
    },
    zoom: MAGNIFIER_ZOOM,
  };
}
