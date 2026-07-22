import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  Color,
  COLORS,
  TEXT_SIZE_KEYS,
  TextSizeKey,
  textSizePx,
  WidthKey,
  WIDTHS,
} from "../shared/constants";
import { t, type Key } from "../shared/i18n";
import { loadMarkerPos, MarkerPos, saveMarkerPos } from "../shared/settings";
import { FreehandToolLiveStrokeIcon } from "./freehand-tool-live-stroke-icon";
import { LiveTextSizeIcon } from "./live-text-size-icon";
import { ToolInspector } from "./tool-inspector";
import {
  DrawingTool,
  isQuickInsertTool,
  PEN_INSPECTOR_TOOLS,
  PenInspectorTool,
  QuickInsertTool,
} from "./tools";

type Panel = "collapsed" | "pen" | "text";

type Props = {
  color: Color;
  widthKey: WidthKey;
  textSizeKey: TextSizeKey;
  board: boolean;
  tool: DrawingTool;
  onColorChange: (c: Color) => void;
  onWidthChange: (w: WidthKey) => void;
  onTextSizeChange: (size: TextSizeKey) => void;
  onBoardToggle: () => void;
  onToolChange: (tool: DrawingTool) => void;
};

// 기본 위치 좌하단(시안 확정). 드래그하면 settings.json(markerPos)에 저장된다.
const DEFAULT_POS: MarkerPos = { xRatio: 0.04, yRatio: 0.92 };
const BAR_HEIGHTS: Record<WidthKey, number> = { xthin: 3, thin: 5, medium: 7, thick: 9, xthick: 12 };
const NEUTRAL = "#E8EAF0";
const COLOR_NAME_KEYS: Record<Color, Key> = {
  "#FFD400": "marker.colorName.yellow",
  "#FF7A00": "marker.colorName.orange",
  "#FF2D95": "marker.colorName.pink",
  "#2ED573": "marker.colorName.green",
  "#00AEEF": "marker.colorName.blue",
};
const WIDTH_NAME_KEYS: Record<WidthKey, Key> = {
  xthin: "marker.widthName.xthin",
  thin: "marker.widthName.thin",
  medium: "marker.widthName.medium",
  thick: "marker.widthName.thick",
  xthick: "marker.widthName.xthick",
};

// 마커는 모드 토글마다 언마운트되므로, 세션 내 위치는 모듈 레벨로 기억한다
let sessionPos: MarkerPos | null = null;

export function Marker({
  color,
  widthKey,
  textSizeKey,
  board,
  tool,
  onColorChange,
  onWidthChange,
  onTextSizeChange,
  onBoardToggle,
  onToolChange,
}: Props) {
  const [panel, setPanel] = useState<Panel>("collapsed");
  const [pos, setPosState] = useState<MarkerPos>(sessionPos ?? DEFAULT_POS);
  const rootRef = useRef<HTMLDivElement>(null);
  const penButtonRef = useRef<HTMLButtonElement>(null);
  const textButtonRef = useRef<HTMLButtonElement>(null);
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
  }, [tool, board]);

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
  const pickPenTool = (next: PenInspectorTool) => {
    onToolChange(next);
    setPanel("collapsed");
  };

  const penActive = tool === "freehand" || isQuickInsertTool(tool);

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
        style={{ ...btn, ...toolSpacing, color, ...(penActive ? modeOn : undefined) }}
        aria-label={t("marker.freehandTool")}
        aria-pressed={penActive}
        aria-expanded={panel === "pen"}
        onClick={() => {
          if (tool !== "freehand") {
            setPanel("collapsed");
            onToolChange("freehand");
          } else {
            togglePanel("pen");
          }
        }}
      >
        {isQuickInsertTool(tool)
          ? <QuickInsertIcon tool={tool} />
          : <FreehandToolLiveStrokeIcon widthKey={widthKey} />}
      </button>
      <button
        ref={textButtonRef}
        style={{ ...btn, ...toolSpacing, ...(tool === "text" ? modeOn : undefined) }}
        aria-label={t("marker.textTool")}
        aria-pressed={tool === "text"}
        aria-expanded={panel === "text"}
        onClick={() => {
          if (tool !== "text") {
            setPanel("collapsed");
            onToolChange("text");
          } else {
            togglePanel("text");
          }
        }}
      >
        <LiveTextSizeIcon sizeKey={textSizeKey} />
      </button>
      <button
        style={{ ...btn, ...(tool === "delete" ? modeOn : undefined) }}
        aria-label={t("marker.deleteTool")}
        aria-pressed={tool === "delete"}
        onClick={() => {
          setPanel("collapsed");
          onToolChange("delete");
        }}
      >
        <DeleteIcon />
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
        <ToolInspector
          markerRef={rootRef}
          anchorRef={panel === "pen" ? penButtonRef : textButtonRef}
          ariaLabel={panel === "pen" ? t("marker.freehandProperties") : t("marker.textProperties")}
        >
          {panel === "pen" && (
            <>
              <div role="group" aria-label={t("marker.quickInsertLabel")} style={inspectorRow}>
                <div style={choiceStrip}>
                  {PEN_INSPECTOR_TOOLS.map((penTool) => (
                    <button
                      key={penTool}
                      style={{ ...choice, color: NEUTRAL }}
                      aria-label={
                        penTool === "freehand"
                          ? t("marker.freehandTool")
                          : t(`marker.quickInsert.${penTool}` as Key)
                      }
                      onClick={() => pickPenTool(penTool)}
                    >
                      <QuickInsertIcon tool={penTool} />
                    </button>
                  ))}
                </div>
              </div>
              <div role="group" aria-label={t("marker.colorLabel")} style={inspectorRow}>
                <div style={choiceStrip}>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      style={{ ...choice, ...(c === color ? activeCell : undefined) }}
                      aria-label={t("marker.colorValue", { value: t(COLOR_NAME_KEYS[c]) })}
                      aria-pressed={c === color}
                      onClick={() => pickColor(c)}
                    >
                      <span style={{ ...dot, background: c, ...(c === color ? currentRing : undefined) }} />
                    </button>
                  ))}
                </div>
              </div>
              <div role="group" aria-label={t("marker.widthLabel")} style={inspectorRow}>
                <div style={choiceStrip}>
                  {(Object.keys(WIDTHS) as WidthKey[]).map((w) => (
                    <button
                      key={w}
                      style={{ ...choice, ...(w === widthKey ? activeCell : undefined) }}
                      aria-label={t("marker.widthValue", { value: t(WIDTH_NAME_KEYS[w]) })}
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
            <div role="group" aria-label={t("marker.textSizeLabel")} style={inspectorRow}>
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
        </ToolInspector>
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
  width: 209,
  cursor: "default",
  touchAction: "none",
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
  minHeight: 32,
  display: "block",
};

const choiceStrip: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const choice: CSSProperties = {
  ...btn,
};

const toolSpacing: CSSProperties = {
  marginRight: 4,
};

function QuickInsertIcon({ tool }: { tool: QuickInsertTool | "freehand" }) {
  return (
    <svg
      data-quick-insert-icon={tool}
      width="24"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {tool === "freehand" && (
        <path d="M3 15.8c3.2-7.4 6.3-7.5 8.2-3.2 2.1 4.8 6 3.7 9.8-2.5" />
      )}
      {tool === "rect" && <rect x="4" y="5" width="16" height="14" rx="1.5" />}
      {tool === "ellipse" && <ellipse cx="12" cy="12" rx="8" ry="6.5" />}
      {tool === "triangle" && <path d="m12 4 8 15H4Z" />}
      {tool === "line" && <path d="M4 18 20 6" />}
      {tool === "arrow" && <path d="M4 18 19 7M13 6l6 1-1 6" />}
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={NEUTRAL}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 15 8.8-8.8a2.3 2.3 0 0 1 3.2 0l1.8 1.8a2.3 2.3 0 0 1 0 3.2L11 19H6.7a2.2 2.2 0 0 1-1.6-.7 2.3 2.3 0 0 1-.1-3.3Z" />
      <path d="M11 19h7" />
    </svg>
  );
}

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
