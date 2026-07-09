/**
 * 점 커서: 현재 색·굵기의 점 + 흐린 흰 링(어두운 화면 대비).
 * 링은 커서에만 허용 — 획 자체의 외곽선 금지 원칙과 별개다.
 */
export function applyPenCursor(color: string, strokeWidthPx: number) {
  const dot = Math.max(8, strokeWidthPx * 2);
  const ringR = dot / 2 + 2;
  const size = Math.ceil(ringR * 2 + 3);
  const c = Math.round(size / 2);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${c}" cy="${c}" r="${ringR}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>` +
    `<circle cx="${c}" cy="${c}" r="${dot / 2}" fill="${color}"/>` +
    `</svg>`;
  document.body.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${c} ${c}, crosshair`;
}

export function resetCursor() {
  document.body.style.cursor = "default";
}
