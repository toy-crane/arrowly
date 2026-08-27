import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  Color,
  DEFAULT_COLOR,
  DEFAULT_TEXT_SIZE,
  DEFAULT_WIDTH,
  stepTextSize,
  stepWidth,
  strokeWidthPx,
  TextSizeKey,
  WidthKey,
} from "../shared/constants";
import {
  onBoardChanged,
  onEnterTextMode,
  onMarkerHiddenChanged,
  onModeChanged,
  onShortcutsChanged,
  openScreenRecordingSettings,
  requestMagnifierAccess,
  restartArrowly,
  toggleBoard,
} from "../shared/ipc";
import { t } from "../shared/i18n";
import {
  DEFAULT_SHORTCUTS,
  loadShortcuts,
  loadTool,
  saveColor,
  saveTextSize,
  saveWidth,
} from "../shared/settings";
import { applyPenCursor, applyTextCursor, resetCursor } from "./cursor";
import { DrawingCanvas, type DrawingCanvasHandle } from "./drawing-canvas";
import { MagnifierLayer } from "./magnifier-layer";
import { Marker } from "./marker";
import { PointerPingLayer, type PointerPingLayerHandle } from "./pointer-ping-layer";
import {
  isGeometricTool,
  type DrawingInspectorTool,
  type DrawingTool,
} from "./tools";

export function OverlayApp() {
  const [drawing, setDrawing] = useState(false);
  const [board, setBoard] = useState(false);
  const [markerHidden, setMarkerHidden] = useState(false);
  const [color, setColor] = useState<Color>(DEFAULT_COLOR);
  const [widthKey, setWidthKey] = useState<WidthKey>(DEFAULT_WIDTH);
  const [textSizeKey, setTextSizeKey] = useState<TextSizeKey>(DEFAULT_TEXT_SIZE);
  const [clearAccel, setClearAccel] = useState(DEFAULT_SHORTCUTS.clear);
  const [textAccel, setTextAccel] = useState(DEFAULT_SHORTCUTS.text);
  const [tool, setTool] = useState<DrawingTool>("freehand");
  const [drawingTool, setDrawingTool] = useState<DrawingInspectorTool>("freehand");
  const [editingTextSizeKey, setEditingTextSizeKey] = useState<TextSizeKey | null>(null);
  const [quickColorPaletteOpen, setQuickColorPaletteOpen] = useState(false);
  const [magnifierNotice, setMagnifierNotice] = useState<
    "permission" | "capture" | "restart" | "build" | null
  >(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const pingLayerRef = useRef<PointerPingLayerHandle>(null);
  const activeToolRef = useRef<DrawingTool>("freehand");
  const drawingToolRef = useRef<DrawingInspectorTool>("freehand");
  const lastToolBeforeDeleteRef = useRef<DrawingTool>("freehand");
  const drawingRef = useRef(false);
  const magnifierRequestRef = useRef(0);
  const preserveToolOnExitRef = useRef(false);

  const changeTool = (next: DrawingTool) => {
    const current = activeToolRef.current;
    let resolved = next;

    if (next === "magnifier") {
      resolved = "magnifier";
    } else if (next === "delete") {
      if (current === "delete") {
        resolved = lastToolBeforeDeleteRef.current;
      } else {
        lastToolBeforeDeleteRef.current = current === "magnifier" ? drawingToolRef.current : current;
      }
    } else if (next === "freehand" && current === "text") {
      resolved = drawingToolRef.current;
    } else if (next === "freehand" || isGeometricTool(next)) {
      drawingToolRef.current = next;
      setDrawingTool(next);
    }

    activeToolRef.current = resolved;
    setTool(resolved);
  };

  const activateMagnifier = async () => {
    const request = ++magnifierRequestRef.current;
    try {
      const result = await requestMagnifierAccess();
      if (request !== magnifierRequestRef.current || !drawingRef.current) return;
      if (result === "denied") {
        setMagnifierNotice("permission");
        return;
      }
      if (result === "restartRequired") {
        setMagnifierNotice("restart");
        return;
      }
      setMagnifierNotice(null);
      changeTool("magnifier");
    } catch {
      if (request === magnifierRequestRef.current && drawingRef.current) {
        setMagnifierNotice("capture");
      }
    }
  };

  const stopMagnifierAfterCaptureError = (reason: string) => {
    if (activeToolRef.current !== "magnifier") return;
    const fallback = drawingToolRef.current;
    activeToolRef.current = fallback;
    lastToolBeforeDeleteRef.current = fallback;
    setTool(fallback);
    setMagnifierNotice(
      reason === "error:screen_capture_permission"
        ? "permission"
        : reason === "error:screen_capture_app_not_shareable"
          ? "build"
          : "capture",
    );
  };

  useEffect(() => {
    loadShortcuts().then((s) => {
      setClearAccel(s.clear);
      setTextAccel(s.text);
    });
    loadTool().then(({ color, width, textSize }) => {
      setColor(color);
      setWidthKey(width);
      setTextSizeKey(textSize);
    });
    // mode-changed에 board가 동봉된다 — 웹뷰가 리로드돼도 모드 전환에서 보드 상태가 재동기화된다
    const unMode = onModeChanged((p) => {
      drawingRef.current = p.drawing;
      setDrawing(p.drawing);
      setBoard(p.board);
      if (!p.drawing) {
        magnifierRequestRef.current += 1;
        setMagnifierNotice(null);
        const preserveTool = preserveToolOnExitRef.current;
        preserveToolOnExitRef.current = false;
        const fallback =
          activeToolRef.current === "magnifier"
            ? drawingToolRef.current
            : preserveTool
              ? activeToolRef.current
              : "freehand";
        activeToolRef.current = fallback;
        lastToolBeforeDeleteRef.current = fallback;
        if (fallback === "freehand") {
          drawingToolRef.current = "freehand";
          setDrawingTool("freehand");
        }
        setTool(fallback); // 확대는 자동 재개하지 않고 기억한 그리기 도구로 복귀한다
      }
    });
    const unBoard = onBoardChanged((p) => setBoard(p.on));
    const unMarker = onMarkerHiddenChanged((p) => setMarkerHidden(p.hidden));
    const unShortcuts = onShortcutsChanged((p) => {
      setClearAccel(p.clear);
      setTextAccel(p.text);
    });
    // 트레이 "텍스트 입력" — Rust가 그리기 진입을 보장한 뒤 emit한다
    const unEnterText = onEnterTextMode(() => {
      activeToolRef.current = "text";
      setTool("text");
    });
    return () => {
      unMode.then((f) => f());
      unBoard.then((f) => f());
      unMarker.then((f) => f());
      unShortcuts.then((f) => f());
      unEnterText.then((f) => f());
    };
  }, []);

  // 색·굵기·모드가 바뀌면 커서도 즉시 갱신
  useEffect(() => {
    if (!drawing) {
      resetCursor();
      return;
    }
    if (tool === "text") {
      applyTextCursor();
      return;
    }
    if (tool === "delete" || tool === "magnifier") {
      resetCursor();
      return;
    }
    applyPenCursor(color, strokeWidthPx(widthKey, Math.min(window.innerWidth, window.innerHeight)));
  }, [drawing, tool, color, widthKey]);

  const changeWidthBy = (delta: -1 | 1) => {
    setWidthKey((current) => {
      const next = stepWidth(current, delta);
      if (next !== current) void saveWidth(next);
      return next;
    });
  };

  const changeTextSizeBy = (delta: -1 | 1) => {
    setTextSizeKey((current) => {
      const next = stepTextSize(current, delta);
      if (next !== current) void saveTextSize(next);
      return next;
    });
  };

  return (
    <>
      <div style={boardBackdrop(board)} />
      <DrawingCanvas
        ref={canvasRef}
        color={color}
        widthKey={widthKey}
        textSizeKey={textSizeKey}
        clearAccel={clearAccel}
        textAccel={textAccel}
        tool={tool}
        onToolChange={(next) => {
          magnifierRequestRef.current += 1;
          setMagnifierNotice(null);
          changeTool(next);
        }}
        onWidthStep={changeWidthBy}
        onTextSizeStep={changeTextSizeBy}
        onColorPick={(c) => {
          setColor(c);
          void saveColor(c);
        }}
        onQuickColorPaletteOpenChange={setQuickColorPaletteOpen}
        onPointerPing={(point) => pingLayerRef.current?.pingAt(point)}
        onEditingTextSizeChange={setEditingTextSizeKey}
        onNewTextSizeCommit={(size) => {
          setTextSizeKey(size);
          void saveTextSize(size);
        }}
      />
      <PointerPingLayer ref={pingLayerRef} />
      {drawing && tool === "magnifier" && (
        <MagnifierLayer
          board={board}
          drawMarks={(target, source) =>
            canvasRef.current?.drawMarksForMagnifier(target, source)
          }
          onCaptureError={stopMagnifierAfterCaptureError}
        />
      )}
      {drawing && !markerHidden && (
        <Marker
          color={color}
          widthKey={widthKey}
          textSizeKey={editingTextSizeKey ?? textSizeKey}
          board={board}
          tool={tool}
          drawingTool={drawingTool}
          onColorChange={(c) => {
            setColor(c);
            void saveColor(c);
          }}
          onWidthChange={(w) => {
            setWidthKey(w);
            void saveWidth(w);
          }}
          onTextSizeChange={(size) => {
            if (canvasRef.current?.isEditing()) {
              canvasRef.current.setTextSize(size);
            } else {
              setTextSizeKey(size);
              void saveTextSize(size);
            }
          }}
          onBoardToggle={() => void toggleBoard()}
          quickColorPaletteOpen={quickColorPaletteOpen}
          onInteractionStart={() => canvasRef.current?.dismissQuickColorPalette()}
          onToolChange={(next) => {
            if (next === "delete" && canvasRef.current?.isEditing()) {
              return;
            }
            if (canvasRef.current?.isEditing()) {
              canvasRef.current.finishTextEditing();
            }
            if (next === "magnifier") {
              void activateMagnifier();
              return;
            }
            magnifierRequestRef.current += 1;
            setMagnifierNotice(null);
            changeTool(next);
          }}
        />
      )}
      {drawing && magnifierNotice && (
        <MagnifierNotice
          kind={magnifierNotice}
          onAction={() => {
            if (magnifierNotice === "restart") {
              void restartArrowly();
            } else {
              preserveToolOnExitRef.current = true;
              void openScreenRecordingSettings();
            }
          }}
        />
      )}
    </>
  );
}

function MagnifierNotice({
  kind,
  onAction,
}: {
  kind: "permission" | "capture" | "restart" | "build";
  onAction: () => void;
}) {
  const restart = kind === "restart";
  const invalidBuild = kind === "build";
  const titleKey = restart
    ? "magnifier.restartTitle"
    : invalidBuild
      ? "magnifier.buildTitle"
      : kind === "permission"
        ? "magnifier.permissionTitle"
        : "magnifier.captureStopped";
  const bodyKey = restart
    ? "magnifier.restartBody"
    : invalidBuild
      ? "magnifier.buildBody"
      : kind === "permission"
        ? "magnifier.permissionBody"
        : "magnifier.captureBody";
  return (
    <div role="alert" style={noticeStyle}>
      <strong style={noticeTitle}>{t(titleKey)}</strong>
      <span style={noticeBody}>{t(bodyKey)}</span>
      {!invalidBuild && (
        <button type="button" style={noticeButton} onClick={onAction}>
          {t(restart ? "magnifier.restartAction" : "magnifier.openSettings")}
        </button>
      )}
    </div>
  );
}

// 블랙보드 백드롭. visibility를 함께 꺼서 OFF 상태에 전체 화면 크기 레이어가 상주하지 않게 한다.
// visibility 딜레이는 켤 때 0(즉시 보이며 페이드인), 끌 때 150ms(페이드아웃이 끝난 뒤 숨김).
const boardBackdrop = (on: boolean): CSSProperties => ({
  position: "fixed",
  inset: 0,
  background: "#000",
  pointerEvents: "none",
  opacity: on ? 1 : 0,
  visibility: on ? "visible" : "hidden",
  transition: `opacity 150ms ease-out, visibility 0s linear ${on ? "0s" : "150ms"}`,
});

const noticeStyle: CSSProperties = {
  position: "fixed",
  zIndex: 40,
  left: "50%",
  top: 22,
  transform: "translateX(-50%)",
  width: 360,
  padding: "12px 14px",
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: "4px 12px",
  alignItems: "center",
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 12,
  background: "rgba(28,30,36,0.96)",
  color: "#fff",
  boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
  pointerEvents: "auto",
  font: "13px/1.35 -apple-system, BlinkMacSystemFont, sans-serif",
};

const noticeTitle: CSSProperties = {
  gridColumn: 1,
  fontWeight: 650,
};

const noticeBody: CSSProperties = {
  gridColumn: 1,
  color: "rgba(255,255,255,0.72)",
};

const noticeButton: CSSProperties = {
  gridColumn: 2,
  gridRow: "1 / span 2",
  padding: "7px 10px",
  border: 0,
  borderRadius: 8,
  background: "#f2f3f5",
  color: "#1c1e24",
  font: "600 12px/1 -apple-system, BlinkMacSystemFont, sans-serif",
  cursor: "pointer",
};
