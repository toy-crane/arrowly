import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  Color,
  DEFAULT_COLOR,
  DEFAULT_TEXT_SIZE,
  DEFAULT_WIDTH,
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
  toggleBoard,
} from "../shared/ipc";
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
import { Marker } from "./marker";

export function OverlayApp() {
  const [drawing, setDrawing] = useState(false);
  const [board, setBoard] = useState(false);
  const [markerHidden, setMarkerHidden] = useState(false);
  const [color, setColor] = useState<Color>(DEFAULT_COLOR);
  const [widthKey, setWidthKey] = useState<WidthKey>(DEFAULT_WIDTH);
  const [textSizeKey, setTextSizeKey] = useState<TextSizeKey>(DEFAULT_TEXT_SIZE);
  const [clearAccel, setClearAccel] = useState(DEFAULT_SHORTCUTS.clear);
  const [textAccel, setTextAccel] = useState(DEFAULT_SHORTCUTS.text);
  const [textMode, setTextMode] = useState(false);
  const [editingTextSizeKey, setEditingTextSizeKey] = useState<TextSizeKey | null>(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);

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
      setDrawing(p.drawing);
      setBoard(p.board);
      if (!p.drawing) setTextMode(false); // Esc·토글로 나가면 텍스트 모드도 폐기
    });
    const unBoard = onBoardChanged((p) => setBoard(p.on));
    const unMarker = onMarkerHiddenChanged((p) => setMarkerHidden(p.hidden));
    const unShortcuts = onShortcutsChanged((p) => {
      setClearAccel(p.clear);
      setTextAccel(p.text);
    });
    // 트레이 "텍스트 입력" — Rust가 그리기 진입을 보장한 뒤 emit한다
    const unEnterText = onEnterTextMode(() => setTextMode(true));
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
    if (textMode) {
      applyTextCursor();
      return;
    }
    applyPenCursor(color, strokeWidthPx(widthKey, Math.min(window.innerWidth, window.innerHeight)));
  }, [drawing, textMode, color, widthKey]);

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
        textMode={textMode}
        onTextModeChange={setTextMode}
        onEditingTextSizeChange={setEditingTextSizeKey}
        onNewTextSizeCommit={(size) => {
          setTextSizeKey(size);
          void saveTextSize(size);
        }}
      />
      {drawing && !markerHidden && (
        <Marker
          color={color}
          widthKey={widthKey}
          textSizeKey={editingTextSizeKey ?? textSizeKey}
          board={board}
          textMode={textMode}
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
          onTextToggle={() => {
            if (canvasRef.current?.isEditing()) {
              canvasRef.current.finishTextEditing();
            } else {
              setTextMode((v) => !v);
            }
          }}
        />
      )}
    </>
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
