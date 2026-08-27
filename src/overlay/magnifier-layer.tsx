import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  captureMagnifierFrame,
  stopMagnifierCapture,
  type MagnifierSourceRect,
} from "../shared/ipc";
import { t } from "../shared/i18n";
import {
  MAGNIFIER_HEIGHT,
  MAGNIFIER_WIDTH,
  placeMagnifier,
  type MagnifierRect,
} from "./magnifier-layout";

const CAPTURE_INTERVAL_MS = 50;

type Props = {
  board: boolean;
  drawMarks: (target: CanvasRenderingContext2D, source: MagnifierRect) => void;
  onCaptureError: (reason: string) => void;
};

export function MagnifierLayer({ board, drawMarks, onCaptureError }: Props) {
  const initialPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const [pointer, setPointer] = useState(initialPointer);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef(initialPointer);
  const boardRef = useRef(board);
  const drawMarksRef = useRef(drawMarks);
  const onCaptureErrorRef = useRef(onCaptureError);
  const captureInFlightRef = useRef(false);
  const failedRef = useRef(false);
  const tickRef = useRef<() => void>(() => undefined);
  const layout = placeMagnifier(
    { width: window.innerWidth, height: window.innerHeight },
    pointer,
  );
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const outputWidth = Math.round(MAGNIFIER_WIDTH * pixelRatio);
  const outputHeight = Math.round(MAGNIFIER_HEIGHT * pixelRatio);

  boardRef.current = board;
  drawMarksRef.current = drawMarks;
  onCaptureErrorRef.current = onCaptureError;

  useEffect(() => {
    const previousCursor = document.body.style.cursor;
    let mounted = true;

    const contextForLens = () => canvasRef.current?.getContext("2d") ?? null;
    const drawBoard = (source: MagnifierSourceRect) => {
      const context = contextForLens();
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, MAGNIFIER_WIDTH, MAGNIFIER_HEIGHT);
      context.fillStyle = "#000";
      context.fillRect(0, 0, MAGNIFIER_WIDTH, MAGNIFIER_HEIGHT);
      drawMarksRef.current(context, source);
    };
    const tick = () => {
      if (!mounted || failedRef.current) return;
      const source = placeMagnifier(
        { width: window.innerWidth, height: window.innerHeight },
        pointerRef.current,
      ).source;
      if (boardRef.current) {
        drawBoard(source);
        return;
      }
      if (captureInFlightRef.current) return;
      captureInFlightRef.current = true;
      void captureMagnifierFrame({ ...source, outputWidth, outputHeight })
        .then((buffer) => {
          if (!mounted || boardRef.current || failedRef.current) return;
          const context = contextForLens();
          if (!context) return;
          if (buffer.byteLength !== outputWidth * outputHeight * 4) {
            throw new Error("invalid magnifier frame");
          }
          const pixels = new ImageData(
            new Uint8ClampedArray(buffer),
            outputWidth,
            outputHeight,
          );
          context.putImageData(pixels, 0, 0);
          context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
          drawMarksRef.current(context, source);
        })
        .catch((error: unknown) => {
          if (!mounted || failedRef.current) return;
          failedRef.current = true;
          onCaptureErrorRef.current(
            typeof error === "string" ? error : "error:screen_capture_failed",
          );
        })
        .finally(() => {
          captureInFlightRef.current = false;
        });
    };
    tickRef.current = tick;

    document.body.style.cursor = "none";
    const follow = (event: PointerEvent) => {
      const next = { x: event.clientX, y: event.clientY };
      pointerRef.current = next;
      setPointer(next);
    };
    window.addEventListener("pointermove", follow);
    tick();
    const interval = window.setInterval(tick, CAPTURE_INTERVAL_MS);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("pointermove", follow);
      document.body.style.cursor = previousCursor;
      tickRef.current = () => undefined;
      captureInFlightRef.current = false;
      void stopMagnifierCapture();
    };
  }, []);

  useEffect(() => {
    tickRef.current();
  }, [board]);

  return (
    <div aria-hidden={false} style={layer}>
      <div
        data-arrowly-magnifier-source=""
        style={{
          ...sourceFrame,
          left: layout.source.x,
          top: layout.source.y,
          width: layout.source.width,
          height: layout.source.height,
        }}
      />
      <div style={{ ...pointerDot, left: pointer.x, top: pointer.y }} />
      <div
        role="img"
        aria-label={t("magnifier.lens")}
        data-arrowly-magnifier-lens=""
        style={{
          ...lens,
          left: layout.lens.x,
          top: layout.lens.y,
          width: layout.lens.width,
          height: layout.lens.height,
        }}
      >
        <canvas
          ref={canvasRef}
          width={outputWidth}
          height={outputHeight}
          style={lensCanvas}
        />
        <span style={zoomBadge}>{t("magnifier.zoom")}</span>
      </div>
    </div>
  );
}

const layer: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 20,
  pointerEvents: "none",
};

const sourceFrame: CSSProperties = {
  position: "absolute",
  boxSizing: "border-box",
  border: "1.5px solid #fff",
  borderRadius: 8,
  boxShadow: "0 0 0 1px #1c1e24",
};

const pointerDot: CSSProperties = {
  position: "absolute",
  width: 9,
  height: 9,
  borderRadius: "50%",
  background: "#1c1e24",
  border: "2px solid #fff",
  boxShadow: "0 0 0 1px #1c1e24",
  transform: "translate(-50%, -50%)",
};

const lens: CSSProperties = {
  position: "absolute",
  boxSizing: "border-box",
  overflow: "hidden",
  border: "2px solid #555",
  borderRadius: 18,
  boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
  background: "#000",
};

const lensCanvas: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
};

const zoomBadge: CSSProperties = {
  position: "absolute",
  zIndex: 2,
  right: 9,
  top: 8,
  minWidth: 28,
  height: 22,
  padding: "0 5px",
  display: "grid",
  placeItems: "center",
  boxSizing: "border-box",
  border: "1px solid #555",
  borderRadius: 999,
  background: "#f7f7f7",
  color: "#333",
  font: "10px/1 ui-monospace, SFMono-Regular, Menlo, monospace",
};
