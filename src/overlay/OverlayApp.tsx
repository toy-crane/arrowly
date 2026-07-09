import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Color, DEFAULT_COLOR, DEFAULT_WIDTH, strokeWidthPx, WidthKey } from "../shared/constants";
import { applyPenCursor, resetCursor } from "./cursor";
import { DrawingCanvas } from "./DrawingCanvas";
import { Marker } from "./Marker";

export function OverlayApp() {
  const [drawing, setDrawing] = useState(false);
  const [markerHidden, setMarkerHidden] = useState(false);
  const [color, setColor] = useState<Color>(DEFAULT_COLOR);
  const [widthKey, setWidthKey] = useState<WidthKey>(DEFAULT_WIDTH);

  useEffect(() => {
    const unMode = listen<{ drawing: boolean }>("mode-changed", (e) => setDrawing(e.payload.drawing));
    const unMarker = listen<{ hidden: boolean }>("marker-hidden-changed", (e) =>
      setMarkerHidden(e.payload.hidden),
    );
    return () => {
      unMode.then((f) => f());
      unMarker.then((f) => f());
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
      <DrawingCanvas color={color} widthKey={widthKey} />
      {drawing && !markerHidden && (
        <Marker color={color} widthKey={widthKey} onColorChange={setColor} onWidthChange={setWidthKey} />
      )}
    </>
  );
}
