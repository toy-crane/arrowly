import { CSSProperties, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Color, DEFAULT_COLOR, DEFAULT_WIDTH, strokeWidthPx, WidthKey } from "../shared/constants";
import { DEFAULT_SHORTCUTS, loadShortcuts, loadTool, saveColor, saveWidth } from "../shared/settings";
import { applyPenCursor, resetCursor } from "./cursor";
import { DrawingCanvas } from "./drawing-canvas";
import { Marker } from "./marker";

export function OverlayApp() {
  const [drawing, setDrawing] = useState(false);
  const [board, setBoard] = useState(false);
  const [markerHidden, setMarkerHidden] = useState(false);
  const [color, setColor] = useState<Color>(DEFAULT_COLOR);
  const [widthKey, setWidthKey] = useState<WidthKey>(DEFAULT_WIDTH);
  const [clearAccel, setClearAccel] = useState(DEFAULT_SHORTCUTS.clear);

  useEffect(() => {
    loadShortcuts().then((s) => setClearAccel(s.clear));
    loadTool().then(({ color, width }) => {
      setColor(color);
      setWidthKey(width);
    });
    // mode-changed에 board가 동봉된다 — 웹뷰가 리로드돼도 모드 전환에서 보드 상태가 재동기화된다
    const unMode = listen<{ drawing: boolean; board: boolean }>("mode-changed", (e) => {
      setDrawing(e.payload.drawing);
      setBoard(e.payload.board);
    });
    const unBoard = listen<{ on: boolean }>("board-changed", (e) => setBoard(e.payload.on));
    const unMarker = listen<{ hidden: boolean }>("marker-hidden-changed", (e) =>
      setMarkerHidden(e.payload.hidden),
    );
    const unShortcuts = listen<{ clear: string }>("shortcuts-changed", (e) =>
      setClearAccel(e.payload.clear),
    );
    return () => {
      unMode.then((f) => f());
      unBoard.then((f) => f());
      unMarker.then((f) => f());
      unShortcuts.then((f) => f());
    };
  }, []);

  // 색·굵기가 바뀌면 커서도 즉시 갱신
  useEffect(() => {
    if (!drawing) {
      resetCursor();
      return;
    }
    applyPenCursor(color, strokeWidthPx(widthKey, Math.min(window.innerWidth, window.innerHeight)));
  }, [drawing, color, widthKey]);

  return (
    <>
      <div style={boardBackdrop(board)} />
      <DrawingCanvas color={color} widthKey={widthKey} clearAccel={clearAccel} />
      {drawing && !markerHidden && (
        <Marker
          color={color}
          widthKey={widthKey}
          board={board}
          onColorChange={(c) => {
            setColor(c);
            void saveColor(c);
          }}
          onWidthChange={(w) => {
            setWidthKey(w);
            void saveWidth(w);
          }}
          onBoardToggle={() => void invoke("toggle_board")}
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
