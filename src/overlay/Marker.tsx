import { CSSProperties, useEffect, useRef, useState } from "react";
import { Color, COLORS, WidthKey, WIDTHS } from "../shared/constants";
import { loadMarkerPos, MarkerPos, saveMarkerPos } from "../shared/settings";

type Panel = "collapsed" | "colors" | "widths";

type Props = {
  color: Color;
  widthKey: WidthKey;
  onColorChange: (c: Color) => void;
  onWidthChange: (w: WidthKey) => void;
};

// 기본 위치 좌하단(시안 확정). 드래그하면 settings.json(markerPos)에 저장된다.
const DEFAULT_POS: MarkerPos = { xRatio: 0.04, yRatio: 0.92 };
const BAR_HEIGHTS: Record<WidthKey, number> = { thin: 4, medium: 7, thick: 11 };
const NEUTRAL = "#E8EAF0";

// 마커는 모드 토글마다 언마운트되므로, 세션 내 위치는 모듈 레벨로 기억한다
let sessionPos: MarkerPos | null = null;

export function Marker({ color, widthKey, onColorChange, onWidthChange }: Props) {
  const [panel, setPanel] = useState<Panel>("collapsed");
  const [pos, setPosState] = useState<MarkerPos>(sessionPos ?? DEFAULT_POS);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    dragging: boolean;
    pointerId: number;
  } | null>(null);

  const setPos = (p: MarkerPos) => {
    sessionPos = p;
    setPosState(p);
  };

  // 첫 마운트에서 저장된 위치 복원
  useEffect(() => {
    if (sessionPos) return;
    loadMarkerPos().then((p) => {
      if (p && !sessionPos) {
        sessionPos = p;
        setPosState(p);
      }
    });
  }, []);

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
    const wasDragging = dragRef.current?.dragging;
    dragRef.current = null;
    if (!wasDragging) return;
    const el = rootRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      void saveMarkerPos({ xRatio: r.left / window.innerWidth, yRatio: r.top / window.innerHeight });
    }
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
    <button style={{ ...btn, color: NEUTRAL, fontSize: 20 }} aria-label="닫기" onClick={onClick}>
      ‹
    </button>
  );
}

const capsule: CSSProperties = {
  position: "fixed",
  height: 44,
  display: "flex",
  alignItems: "center",
  gap: 3,
  padding: "0 10px",
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
  width: 32,
  height: 32,
  padding: 0,
  background: "none",
  border: "none",
  cursor: "pointer",
  lineHeight: 1,
};

const dot: CSSProperties = { width: 20, height: 20, borderRadius: "50%", display: "block" };

const currentRing: CSSProperties = { outline: `2px solid ${NEUTRAL}`, outlineOffset: 2.5 };

const divider: CSSProperties = { width: 1, height: 20, background: "rgba(255,255,255,0.14)" };

const bar = (w: WidthKey): CSSProperties => ({
  width: 34,
  height: BAR_HEIGHTS[w],
  borderRadius: 99,
  display: "block",
  boxSizing: "border-box",
});
