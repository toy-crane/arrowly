/**
 * 점 커서: 현재 색·굵기의 점 + 이중 링(흰 링은 어두운 화면, 어두운 헤어라인은 밝은 화면 대비).
 * WebKit이 SVG data-URI 커서의 핫스팟을 무시해 점이 실제 포인터에서 어긋나 보이는 문제가 있어,
 * 캔버스로 그린 PNG 커서를 쓴다(핫스팟 보장). Retina는 -webkit-image-set 2x로 선명도 유지.
 */
export function applyPenCursor(color: string, strokeWidthPx: number) {
  const dotR = Math.max(8, strokeWidthPx * 2) / 2;
  const whiteR = dotR + 2.5;
  const hairR = whiteR + 1.75;
  const size = Math.ceil(hairR * 2 + 2);
  const center = size / 2;
  const hot = Math.round(center);

  const draw = (scale: number): string => {
    const cv = document.createElement("canvas");
    cv.width = size * scale;
    cv.height = size * scale;
    const ctx = cv.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.arc(center, center, hairR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center, center, whiteR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center, center, dotR, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    return cv.toDataURL("image/png");
  };

  const body = document.body;
  body.style.cursor = `-webkit-image-set(url("${draw(2)}") 2x) ${hot} ${hot}, crosshair`;
  if (!body.style.cursor) {
    // image-set 미지원 폴백: 1x PNG
    body.style.cursor = `url("${draw(1)}") ${hot} ${hot}, crosshair`;
  }
}

export function resetCursor() {
  document.body.style.cursor = "default";
}

/** 텍스트 모드 표시 — 표준 I-beam. */
export function applyTextCursor() {
  document.body.style.cursor = "text";
}
