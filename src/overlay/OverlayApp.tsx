import { CSSProperties, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

// M2 스파이크: keydown HUD + 테스트 사각형. M3에서 DrawingCanvas로 교체.
export function OverlayApp() {
  const [drawing, setDrawing] = useState(false);
  const [lastKey, setLastKey] = useState("");
  const [undoCount, setUndoCount] = useState(0);

  useEffect(() => {
    const unlisten = listen<{ drawing: boolean }>("mode-changed", (e) => {
      setDrawing(e.payload.drawing);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const combo = [
        e.ctrlKey ? "⌃" : "",
        e.altKey ? "⌥" : "",
        e.shiftKey ? "⇧" : "",
        e.metaKey ? "⌘" : "",
        e.key,
      ].join("");
      setLastKey(combo);
      console.log("keydown:", combo);
      if (e.metaKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setUndoCount((c) => c + 1);
        console.log("⌘Z received");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <div style={hud}>
        <div>mode: {drawing ? "DRAWING" : "PASS"}</div>
        <div>last key: {lastKey || "—"}</div>
        <div>⌘Z count: {undoCount}</div>
      </div>
    </div>
  );
}

const hud: CSSProperties = {
  position: "fixed",
  top: 48,
  left: 24,
  padding: "12px 16px",
  borderRadius: 12,
  background: "rgba(24, 26, 32, 0.88)",
  color: "#E8EAF0",
  font: "600 16px/1.5 -apple-system, sans-serif",
  whiteSpace: "pre",
};

