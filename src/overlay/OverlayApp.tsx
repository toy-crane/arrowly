import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Color, DEFAULT_COLOR, DEFAULT_WIDTH, strokeWidthPx, WidthKey } from "../shared/constants";
import { DEFAULT_SHORTCUTS, loadShortcuts, loadTool, saveColor, saveWidth } from "../shared/settings";
import { applyPenCursor, resetCursor } from "./cursor";
import { DrawingCanvas } from "./DrawingCanvas";
import { Marker } from "./Marker";

export function OverlayApp() {
  const [drawing, setDrawing] = useState(false);
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
    const unMode = listen<{ drawing: boolean }>("mode-changed", (e) => setDrawing(e.payload.drawing));
    const unMarker = listen<{ hidden: boolean }>("marker-hidden-changed", (e) =>
      setMarkerHidden(e.payload.hidden),
    );
    const unShortcuts = listen<{ clear: string }>("shortcuts-changed", (e) =>
      setClearAccel(e.payload.clear),
    );
    return () => {
      unMode.then((f) => f());
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
      <DrawingCanvas color={color} widthKey={widthKey} clearAccel={clearAccel} />
      {drawing && !markerHidden && (
        <Marker
          color={color}
          widthKey={widthKey}
          onColorChange={(c) => {
            setColor(c);
            void saveColor(c);
          }}
          onWidthChange={(w) => {
            setWidthKey(w);
            void saveWidth(w);
          }}
        />
      )}
    </>
  );
}
