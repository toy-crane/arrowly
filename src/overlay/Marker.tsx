import { CSSProperties, useEffect, useRef, useState } from "react";
import { Color, COLORS, WidthKey, WIDTHS } from "../shared/constants";

type Panel = "collapsed" | "colors" | "widths";

type Props = {
  color: Color;
  widthKey: WidthKey;
  onColorChange: (c: Color) => void;
  onWidthChange: (w: WidthKey) => void;
};

// 기본 위치 좌하단(시안 확정). 위치 영속화(settings.json markerPos)는 M7에서.
const DEFAULT_POS = { xRatio: 0.04, yRatio: 0.92 };
const BAR_HEIGHTS: Record<WidthKey, number> = { thin: 3, medium: 5, thick: 8 };
const NEUTRAL = "#E8EAF0";

export function Marker({ color, widthKey, onColorChange, onWidthChange }: Props) {
  const [panel, setPanel] = useState<Panel>("collapsed");
  const [pos, setPos] = useState(DEFAULT_POS);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    dragging: boolean;
    pointerId: number;
  } | null>(null);

  // 바깥 pointerdown(그리기 시작 포함) → 접힘
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPanel("collapsed");
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation(); // 마커 위에서 획이 시작되면 안 된다
    const rect = rootRef.current!.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: rect.left,
      baseY: rect.top,
      dragging: false,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.dragging) {
      if (Math.hypot(dx, dy) < 4) return; // 4px 임계값으로 탭과 구분
      d.dragging = true;
      rootRef.current!.setPointerCapture(d.pointerId);
    }
    const el = rootRef.current!;
    const x = Math.min(Math.max(d.baseX + dx, 6), window.innerWidth - el.offsetWidth - 6);
    const y = Math.min(Math.max(d.baseY + dy, 6), window.innerHeight - el.offsetHeight - 6);
    setPos({ xRatio: x / window.innerWidth, yRatio: y / window.innerHeight });
  };

  const onPointerUp = () => {
    dragRef.current = null;
    // M7: 드래그 종료 시 markerPos를 settings.json에 저장
  };

  const pickColor = (c: Color) => {
    onColorChange(c);
    setPanel("collapsed");
  };
  const pickWidth = (w: WidthKey) => {
    onWidthChange(w);
    setPanel("collapsed");
  };

  return (
    <div
      ref={rootRef}
      style={{ ...capsule, left: `${pos.xRatio * 100}%`, top: `${pos.yRatio * 100}%` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {panel === "collapsed" && (
        <>
          <button style={btn} aria-label="색 바꾸기" onClick={() => setPanel("colors")}>
            <span style={{ ...dot, background: color }} />
          </button>
          <span style={divider} />
          <button style={btn} aria-label="굵기 바꾸기" onClick={() => setPanel("widths")}>
            <span style={{ ...bar(widthKey), background: NEUTRAL }} />
          </button>
        </>
      )}
      {panel === "colors" && (
        <>
          <BackButton onClick={() => setPanel("collapsed")} />
          {COLORS.map((c) => (
            <button key={c} style={btn} aria-label={`색 ${c}`} onClick={() => pickColor(c)}>
              <span style={{ ...dot, background: c, ...(c === color ? currentRing : undefined) }} />
            </button>
          ))}
        </>
      )}
      {panel === "widths" && (
        <>
          <BackButton onClick={() => setPanel("collapsed")} />
          {(Object.keys(WIDTHS) as WidthKey[]).map((w) => (
            <button key={w} style={btn} aria-label={`굵기 ${w}`} onClick={() => pickWidth(w)}>
              <span
                style={
                  w === widthKey
                    ? { ...bar(w), background: NEUTRAL }
                    : { ...bar(w), border: "1.5px solid rgba(232,234,240,0.85)" }
                }
              />
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button style={{ ...btn, color: NEUTRAL, fontSize: 16 }} aria-label="닫기" onClick={onClick}>
      ‹
    </button>
  );
}

const capsule: CSSProperties = {
  position: "fixed",
  height: 34,
  display: "flex",
  alignItems: "center",
  gap: 2,
  padding: "0 8px",
  borderRadius: 999,
  background: "rgba(24,26,32,0.88)",
  border: "1px solid rgba(255,255,255,0.14)",
  boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
  cursor: "default",
  touchAction: "none",
};

const btn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  padding: 0,
  background: "none",
  border: "none",
  cursor: "pointer",
  lineHeight: 1,
};

const dot: CSSProperties = { width: 14, height: 14, borderRadius: "50%", display: "block" };

const currentRing: CSSProperties = { outline: `2px solid ${NEUTRAL}`, outlineOffset: 2.5 };

const divider: CSSProperties = { width: 1, height: 16, background: "rgba(255,255,255,0.14)" };

const bar = (w: WidthKey): CSSProperties => ({
  width: 26,
  height: BAR_HEIGHTS[w],
  borderRadius: 99,
  display: "block",
  boxSizing: "border-box",
});
