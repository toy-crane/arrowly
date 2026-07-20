import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Color,
  COLORS,
  TEXT_SIZE_KEYS,
  TextSizeKey,
  textSizePx,
  WidthKey,
  WIDTHS,
} from "../shared/constants";
import { t } from "../shared/i18n";
import { loadMarkerPos, MarkerPos, saveMarkerPos } from "../shared/settings";

type Panel = "collapsed" | "pen" | "text";

type Props = {
  color: Color;
  widthKey: WidthKey;
  textSizeKey: TextSizeKey;
  board: boolean;
  textMode: boolean;
  onColorChange: (c: Color) => void;
  onWidthChange: (w: WidthKey) => void;
  onTextSizeChange: (size: TextSizeKey) => void;
  onBoardToggle: () => void;
  onTextToggle: () => void;
};

// 기본 위치 좌하단(시안 확정). 드래그하면 settings.json(markerPos)에 저장된다.
const DEFAULT_POS: MarkerPos = { xRatio: 0.04, yRatio: 0.92 };
const BAR_HEIGHTS: Record<WidthKey, number> = { xthin: 3, thin: 5, medium: 7, thick: 9, xthick: 12 };
const NEUTRAL = "#E8EAF0";
const SAFE_MARGIN = 6;
const ARROW_HALF_SIZE = 4.5;

// 마커는 모드 토글마다 언마운트되므로, 세션 내 위치는 모듈 레벨로 기억한다
let sessionPos: MarkerPos | null = null;

export function Marker({
  color,
  widthKey,
  textSizeKey,
  board,
  textMode,
  onColorChange,
  onWidthChange,
  onTextSizeChange,
  onBoardToggle,
  onTextToggle,
}: Props) {
  const [panel, setPanel] = useState<Panel>("collapsed");
  const [pos, setPosState] = useState<MarkerPos>(sessionPos ?? DEFAULT_POS);
  const [viewportRevision, setViewportRevision] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const penButtonRef = useRef<HTMLButtonElement>(null);
  const textButtonRef = useRef<HTMLButtonElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
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

  // 단축키나 외부 이벤트가 도구·블랙보드 상태를 바꾸면 열려 있던 속성을 접는다.
  useEffect(() => {
    setPanel("collapsed");
  }, [textMode, board]);

  useEffect(() => {
    const onResize = () => setViewportRevision((revision) => revision + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 패널은 화면 안으로 클램프하고, 화살표는 이동한 패널 안에서 활성 도구 중심을 다시 가리킨다.
  useLayoutEffect(() => {
    const pop = popRef.current;
    const root = rootRef.current;
    const arrow = arrowRef.current;
    const anchor = panel === "pen" ? penButtonRef.current : textButtonRef.current;
    if (!pop || !root || !arrow || !anchor || panel === "collapsed") return;

    const rootRect = root.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const panelWidth = pop.getBoundingClientRect().width;
    const { panelLeft, arrowLeft } = calculateInspectorLayout({
      anchorLeft: anchorRect.left,
      anchorWidth: anchorRect.width,
      panelWidth,
      viewportWidth: window.innerWidth,
    });

    pop.style.left = `${panelLeft - rootRect.left}px`;
    pop.style.transform = "none";
    arrow.style.left = `${arrowLeft}px`;
  }, [panel, pos, viewportRevision]);

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
  const pickTextSize = (size: TextSizeKey) => {
    onTextSizeChange(size);
    setPanel("collapsed");
  };

  // 최상단 근처에서는 팝오버를 아래로 뒤집는다
  const openBelow = pos.yRatio * window.innerHeight < 64;

  return (
    <div
      ref={rootRef}
      data-arrowly-marker=""
      style={{ ...capsule, left: `${pos.xRatio * 100}%`, top: `${pos.yRatio * 100}%` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <button
        ref={penButtonRef}
        style={{ ...btn, ...(!textMode ? modeOn : undefined) }}
        aria-label={t("marker.freehandTool")}
        aria-pressed={!textMode}
        aria-expanded={panel === "pen"}
        onClick={() => {
          if (textMode) {
            setPanel("collapsed");
            onTextToggle();
          } else {
            togglePanel("pen");
          }
        }}
      >
        <svg
          width="24"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2.15"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 16.7c2.4-5.8 4.6-8.3 6.1-6.5 1.4 1.8-2.8 7.1-.5 8.1 2.7 1.2 5.8-8.7 8-6.5 1.6 1.6-2 5.4-.2 6.4 1.3.8 3.6-1 5.6-3.6" />
        </svg>
      </button>
      <button
        ref={textButtonRef}
        style={{ ...btn, ...(textMode ? modeOn : undefined) }}
        aria-label={t("marker.textTool")}
        aria-pressed={textMode}
        aria-expanded={panel === "text"}
        onClick={() => {
          if (!textMode) {
            setPanel("collapsed");
            onTextToggle();
          } else {
            togglePanel("text");
          }
        }}
      >
        <span style={textGlyph}>T</span>
      </button>
      <span style={divider} />
      <button
        style={{ ...btn, ...(board ? modeOn : undefined) }}
        aria-label={t("marker.toggleBoard")}
        aria-pressed={board}
        onClick={() => {
          setPanel("collapsed");
          onBoardToggle();
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke={NEUTRAL}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="4" width="16" height="9.5" rx="1.5" />
          <path d="M6 9 C 7.6 6.6, 9.8 10.6, 12.4 8" />
          <path d="M6.5 17 L 8.3 13.5 M13.5 17 L 11.7 13.5" />
        </svg>
      </button>

      {panel !== "collapsed" && (
        <div
          ref={popRef}
          role="group"
          aria-label={panel === "pen" ? t("marker.freehandProperties") : t("marker.textProperties")}
          style={{
            ...popover,
            ...(openBelow ? { top: "calc(100% + 8px)" } : { bottom: "calc(100% + 8px)" }),
          }}
        >
          <span
            ref={arrowRef}
            data-arrowly-inspector-arrow=""
            aria-hidden="true"
            style={{
              ...inspectorArrow,
              ...(openBelow ? inspectorArrowAbove : inspectorArrowBelow),
            }}
          />
          {panel === "pen" && (
            <>
              <div style={inspectorRow}>
                <span style={inspectorLabel}>{t("marker.colorLabel")}</span>
                <div style={choiceStrip}>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      style={{ ...choice, ...(c === color ? activeCell : undefined) }}
                      aria-label={t("marker.colorValue", { value: c })}
                      aria-pressed={c === color}
                      onClick={() => pickColor(c)}
                    >
                      <span style={{ ...dot, background: c, ...(c === color ? currentRing : undefined) }} />
                    </button>
                  ))}
                </div>
              </div>
              <div style={inspectorRow}>
                <span style={inspectorLabel}>{t("marker.widthLabel")}</span>
                <div style={choiceStrip}>
                  {(Object.keys(WIDTHS) as WidthKey[]).map((w) => (
                    <button
                      key={w}
                      style={{ ...choice, ...(w === widthKey ? activeCell : undefined) }}
                      aria-label={t("marker.widthValue", { value: w })}
                      aria-pressed={w === widthKey}
                      onClick={() => pickWidth(w)}
                    >
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
              </div>
            </>
          )}
          {panel === "text" && (
            <div style={inspectorRow}>
              <span style={inspectorLabel}>{t("marker.textSizeLabel")}</span>
              <div style={choiceStrip}>
                {TEXT_SIZE_KEYS.map((size) => (
                  <button
                    key={size}
                    style={{ ...choice, ...(size === textSizeKey ? activeCell : undefined) }}
                    aria-label={t("marker.textSizeValue", { value: textSizePx(size) })}
                    aria-pressed={size === textSizeKey}
                    title={`${textSizePx(size)}px`}
                    onClick={() => pickTextSize(size)}
                  >
                    <span style={{ ...textOption, fontSize: TEXT_DISPLAY_SIZES[size] }}>T</span>
                  </button>
                ))}
              </div>
            </div>
          )}
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
  boxSizing: "border-box",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
};

const capsule: CSSProperties = {
  ...surface,
  position: "fixed",
  cursor: "default",
  touchAction: "none",
};

// 캡슐 위(또는 아래)에 뜨는 선택지 — 캡슐 자체는 위치·크기 불변
const popover: CSSProperties = {
  position: "absolute",
  left: "50%",
  transform: "translateX(-50%)",
  display: "grid",
  minWidth: 306,
  padding: "8px 9px",
  borderRadius: 14,
  color: NEUTRAL,
  background: "rgba(24,26,32,0.97)",
  border: "1px solid rgba(255,255,255,0.14)",
  boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
  boxSizing: "border-box",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
};

const inspectorArrow: CSSProperties = {
  position: "absolute",
  width: 9,
  height: 9,
  background: "rgba(24,26,32,0.97)",
};

const inspectorArrowBelow: CSSProperties = {
  bottom: -5,
  borderRight: "1px solid rgba(255,255,255,0.14)",
  borderBottom: "1px solid rgba(255,255,255,0.14)",
  transform: "rotate(45deg)",
};

const inspectorArrowAbove: CSSProperties = {
  top: -5,
  borderRight: "1px solid rgba(255,255,255,0.14)",
  borderBottom: "1px solid rgba(255,255,255,0.14)",
  transform: "rotate(225deg)",
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

// 모드 ON 표시(보드·텍스트 공용) — 팝오버 열림(activeCell)보다 한 단계 진한 중립 하이라이트.
// 색은 색 차원 전용.
const modeOn: CSSProperties = {
  background: "rgba(255,255,255,0.16)",
  borderRadius: 8,
};

const TEXT_DISPLAY_SIZES: Record<TextSizeKey, number> = {
  xsmall: 13,
  small: 16,
  medium: 20,
  large: 25,
  xlarge: 30,
};

const textGlyph: CSSProperties = {
  color: NEUTRAL,
  fontWeight: 650,
  lineHeight: 1,
  fontSize: 19,
};

const textOption: CSSProperties = {
  width: 32,
  height: 32,
  display: "grid",
  placeItems: "center",
  color: NEUTRAL,
  borderRadius: 7,
  fontWeight: 650,
};

const inspectorRow: CSSProperties = {
  minHeight: 34,
  display: "grid",
  gridTemplateColumns: "43px 1fr",
  alignItems: "center",
  gap: 5,
};

const inspectorLabel: CSSProperties = {
  paddingLeft: 5,
  color: "#AEB2BC",
  fontSize: 11,
};

const choiceStrip: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 3,
};

const choice: CSSProperties = {
  ...btn,
};

const dot: CSSProperties = { width: 17, height: 17, borderRadius: "50%", display: "block" };

const currentRing: CSSProperties = { outline: `2px solid ${NEUTRAL}`, outlineOffset: 2.5 };

const divider: CSSProperties = {
  width: 1,
  height: 20,
  margin: "0 8px",
  background: "rgba(255,255,255,0.14)",
  flexShrink: 0,
};

const bar = (w: WidthKey): CSSProperties => ({
  width: 28,
  height: BAR_HEIGHTS[w],
  borderRadius: 99,
  display: "block",
  boxSizing: "border-box",
});

function calculateInspectorLayout({
  anchorLeft,
  anchorWidth,
  panelWidth,
  viewportWidth,
}: {
  anchorLeft: number;
  anchorWidth: number;
  panelWidth: number;
  viewportWidth: number;
}) {
  const anchorCenter = anchorLeft + anchorWidth / 2;
  const rightmostPanelLeft = Math.max(SAFE_MARGIN, viewportWidth - panelWidth - SAFE_MARGIN);
  const panelLeft = Math.min(
    Math.max(anchorCenter - panelWidth / 2, SAFE_MARGIN),
    rightmostPanelLeft,
  );
  return {
    panelLeft,
    arrowLeft: anchorCenter - panelLeft - ARROW_HALF_SIZE,
  };
}
