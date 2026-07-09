/**
 * 점 커서: 현재 색·굵기의 점 + 이중 링(흰 링은 어두운 화면, 어두운 헤어라인은 밝은 화면 대비).
 * 링은 커서에만 허용 — 획 자체의 외곽선 금지 원칙과 별개다.
 */
export function applyPenCursor(color: string, strokeWidthPx: number) {
  const dotR = Math.max(8, strokeWidthPx * 2) / 2;
  const whiteR = dotR + 2.5;
  const hairR = whiteR + 1.75;
  const size = Math.ceil(hairR * 2 + 2);
  const c = Math.round(size / 2);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${c}" cy="${c}" r="${hairR}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>` +
    `<circle cx="${c}" cy="${c}" r="${whiteR}" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="1.8"/>` +
    `<circle cx="${c}" cy="${c}" r="${dotR}" fill="${color}"/>` +
    `</svg>`;
  document.body.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${c} ${c}, crosshair`;
}

export function resetCursor() {
  document.body.style.cursor = "default";
}
