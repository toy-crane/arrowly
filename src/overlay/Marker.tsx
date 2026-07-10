import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Color, COLORS, WidthKey, WIDTHS } from "../shared/constants";
import { t } from "../shared/i18n";
import { loadMarkerPos, MarkerPos, saveMarkerPos } from "../shared/settings";

type Panel = "collapsed" | "colors" | "widths";

type Props = {
  color: Color;
  widthKey: WidthKey;
  board: boolean;
  onColorChange: (c: Color) => void;
  onWidthChange: (w: WidthKey) => void;
  onBoardToggle: () => void;
};

// 기본 위치 좌하단(시안 확정). 드래그하면 settings.json(markerPos)에 저장된다.
const DEFAULT_POS: MarkerPos = { xRatio: 0.04, yRatio: 0.92 };
const BAR_HEIGHTS: Record<WidthKey, number> = { xthin: 3, thin: 5, medium: 7, thick: 9, xthick: 12 };
const NEUTRAL = "#E8EAF0";

// 마커는 모드 토글마다 언마운트되므로, 세션 내 위치는 모듈 레벨로 기억한다
let sessionPos: MarkerPos | null = null;

export function Marker({ color, widthKey, board, onColorChange, onWidthChange, onBoardToggle }: Props) {
  const [panel, setPanel] = useState<Panel>("collapsed");
  const [pos, setPosState] = useState<MarkerPos>(sessionPos ?? DEFAULT_POS);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
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

  // 팝오버가 화면 밖으로 나가지 않게 좌우 클램프 (기본은 캡슐 중앙 정렬)
  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!pop || panel === "collapsed") return;
    pop.style.transform = "translateX(-50%)";
    const r = pop.getBoundingClientRect();
    let dx = 0;
    if (r.left < 6) dx = 6 - r.left;
    else if (r.right > window.innerWidth - 6) dx = window.innerWidth - 6 - r.right;
    if (dx !== 0) pop.style.transform = `translateX(calc(-50% + ${dx}px))`;
  }, [panel, pos]);

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

  const togglePanel = (p: Exclude<Panel, "collapsed">) => {
    setPanel((cur) => (cur === p ? "collapsed" : p));
  };
  const pickColor = (c: Color) => {
    onColorChange(c);
    setPanel("collapsed");
  };
  const pickWidth = (w: WidthKey) => {
    onWidthChange(w);
    setPanel("collapsed");
  };

  // 최상단 근처에서는 팝오버를 아래로 뒤집는다
  const openBelow = pos.yRatio * window.innerHeight < 64;

  return (
    <div
      ref={rootRef}
      style={{ ...capsule, left: `${pos.xRatio * 100}%`, top: `${pos.yRatio * 100}%` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <button
        style={{ ...btn, ...(panel === "colors" ? activeCell : undefined) }}
        aria-label={t("marker.changeColor")}
        onClick={() => togglePanel("colors")}
      >
        <span style={{ ...dot, background: color }} />
      </button>
      <span style={divider} />
      <button
        style={{ ...btn, ...(panel === "widths" ? activeCell : undefined) }}
        aria-label={t("marker.changeWidth")}
        onClick={() => togglePanel("widths")}
      >
        <span style={{ ...bar(widthKey), background: NEUTRAL }} />
      </button>
      <span style={divider} />
      <button
        style={{ ...btn, ...(board ? boardOn : undefined) }}
        aria-label={t("marker.toggleBoard")}
        onClick={() => {
          setPanel("collapsed");
          onBoardToggle();
        }}
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 20 20"
          fill="none"
          stroke={NEUTRAL}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2.8" y="3.2" width="14.4" height="10.6" rx="1.5" />
          <path d="M6.2 8.8 C 7.6 6.8, 9.4 10.4, 11.6 7.9" />
          <path d="M6.6 16.8 L 8.2 13.8 M13.4 16.8 L 11.8 13.8" />
        </svg>
      </button>

      {panel !== "collapsed" && (
        <div
          ref={popRef}
          style={{
            ...popover,
            ...(openBelow ? { top: "calc(100% + 8px)" } : { bottom: "calc(100% + 8px)" }),
          }}
        >
          {panel === "colors"
            ? COLORS.map((c) => (
                <button key={c} style={btn} aria-label={t("marker.colorValue", { value: c })} onClick={() => pickColor(c)}>
                  <span style={{ ...dot, background: c, ...(c === color ? currentRing : undefined) }} />
                </button>
              ))
            : (Object.keys(WIDTHS) as WidthKey[]).map((w) => (
                <button key={w} style={btn} aria-label={t("marker.widthValue", { value: w })} onClick={() => pickWidth(w)}>
                  <span
                    style={
                      w === widthKey
                        ? { ...bar(w), background: NEUTRAL }
                        : { ...bar(w), border: "1.5px solid rgba(232,234,240,0.85)" }
                    }
                  />
                </button>
              ))}
        </div>
      )}
    </div>
  );
}

const surface: CSSProperties = {
  height: 44,
  display: "flex",
  alignItems: "center",
  padding: "0 8px",
  borderRadius: 999,
  background: "rgba(24,26,32,0.88)",
  border: "1px solid rgba(255,255,255,0.14)",
  boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
};

const capsule: CSSProperties = {
  ...surface,
  position: "fixed",
  cursor: "default",
  touchAction: "none",
};

// 캡슐 위(또는 아래)에 뜨는 선택지 — 캡슐 자체는 위치·크기 불변
const popover: CSSProperties = {
  ...surface,
  position: "absolute",
  left: "50%",
  transform: "translateX(-50%)",
  width: "max-content",
};

// 셀은 고정폭 42(최대 내용물인 굵기 획 34 + 좌우 4) — 캡슐 셀과 팝오버 셀이 모두 같은 폭으로 정렬된다
const btn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 42,
  height: 32,
  padding: 0,
  background: "none",
  border: "none",
  cursor: "pointer",
  lineHeight: 1,
};

const activeCell: CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  borderRadius: 8,
};

// 보드 ON 표시 — 팝오버 열림(activeCell)보다 한 단계 진한 중립 하이라이트. 색은 색 차원 전용.
const boardOn: CSSProperties = {
  background: "rgba(255,255,255,0.16)",
  borderRadius: 8,
};

const dot: CSSProperties = { width: 20, height: 20, borderRadius: "50%", display: "block" };

const currentRing: CSSProperties = { outline: `2px solid ${NEUTRAL}`, outlineOffset: 2.5 };

const divider: CSSProperties = {
  width: 1,
  height: 20,
  margin: "0 8px",
  background: "rgba(255,255,255,0.14)",
  flexShrink: 0,
};

const bar = (w: WidthKey): CSSProperties => ({
  width: 34,
  height: BAR_HEIGHTS[w],
  borderRadius: 99,
  display: "block",
  boxSizing: "border-box",
});
