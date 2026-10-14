import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  captureMagnifierFrame,
  stopMagnifierCapture,
  type MagnifierSourceRect,
} from "../shared/ipc";
import { t } from "../shared/i18n";
import {
  DEFAULT_MAGNIFIER_ZOOM,
  MAX_MAGNIFIER_ZOOM,
  MIN_MAGNIFIER_ZOOM,
  placeMagnifier,
  type MagnifierRect,
} from "./magnifier-layout";

const CAPTURE_INTERVAL_MS = 50;
// 스크롤 1px당 배율의 로그 변화량. 휠은 한 칸(약 40px)에 약 10%, 트랙패드 핀치는
// WebKit이 ctrl 휠로 보내는 작은 값에 맞춰 더 민감하게 반응한다.
const WHEEL_ZOOM_PER_PIXEL = 0.0025;
const PINCH_ZOOM_PER_PIXEL = 0.01;
const LINE_HEIGHT_PX = 16;

function currentViewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function zoomAfterWheel(zoom: number, event: WheelEvent): number {
  const unit =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? LINE_HEIGHT_PX
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? window.innerHeight
        : 1;
  const sensitivity = event.ctrlKey ? PINCH_ZOOM_PER_PIXEL : WHEEL_ZOOM_PER_PIXEL;
  // 위로 밀거나 핀치를 벌리면 deltaY가 음수다. 곱셈 비율이라 어느 배율에서도 체감 변화가 같다.
  const next = zoom * Math.exp(-event.deltaY * unit * sensitivity);
  return Math.min(MAX_MAGNIFIER_ZOOM, Math.max(MIN_MAGNIFIER_ZOOM, next));
}

type Props = {
  board: boolean;
  drawMarks: (
    target: CanvasRenderingContext2D,
    source: MagnifierRect,
    zoom: number,
  ) => void;
  onCaptureError: (reason: string) => void;
};

export function MagnifierLayer({ board, drawMarks, onCaptureError }: Props) {
  const initialPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const [pointer, setPointer] = useState(initialPointer);
  const [zoom, setZoom] = useState(DEFAULT_MAGNIFIER_ZOOM);
  const [viewport, setViewport] = useState(currentViewport);
  const zoomRef = useRef(DEFAULT_MAGNIFIER_ZOOM);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef(initialPointer);
  const boardRef = useRef(board);
  const drawMarksRef = useRef(drawMarks);
  const onCaptureErrorRef = useRef(onCaptureError);
  const captureInFlightRef = useRef(false);
  const failedRef = useRef(false);
  const tickRef = useRef<() => void>(() => undefined);
  const layout = placeMagnifier(viewport, pointer, zoom);
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const outputWidth = Math.round(layout.lens.width * pixelRatio);
  const outputHeight = Math.round(layout.lens.height * pixelRatio);

  boardRef.current = board;
  drawMarksRef.current = drawMarks;
  onCaptureErrorRef.current = onCaptureError;

  useEffect(() => {
    const previousCursor = document.body.style.cursor;
    let mounted = true;

    const contextForLens = () => canvasRef.current?.getContext("2d") ?? null;
    const drawBoard = (lens: MagnifierRect, source: MagnifierSourceRect, zoom: number) => {
      const context = contextForLens();
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, lens.width, lens.height);
      context.fillStyle = "#000";
      context.fillRect(0, 0, lens.width, lens.height);
      drawMarksRef.current(context, source, zoom);
    };
    const tick = () => {
      if (!mounted || failedRef.current) return;
      const { lens, source, zoom } = placeMagnifier(
        currentViewport(),
        pointerRef.current,
        zoomRef.current,
      );
      if (boardRef.current) {
        drawBoard(lens, source, zoom);
        return;
      }
      if (captureInFlightRef.current) return;
      captureInFlightRef.current = true;
      // 렌즈 크기는 화면 크기를 따르므로 출력 크기도 매 프레임의 배치에서 정한다.
      const outputWidth = Math.round(lens.width * pixelRatio);
      const outputHeight = Math.round(lens.height * pixelRatio);
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
          drawMarksRef.current(context, source, zoom);
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
    // 확대 중 휠과 핀치는 배율만 바꾸고 웹뷰 스크롤·페이지 확대로 이어지지 않게 막는다.
    const changeZoom = (event: WheelEvent) => {
      event.preventDefault();
      const next = zoomAfterWheel(zoomRef.current, event);
      if (next === zoomRef.current) return;
      zoomRef.current = next;
      setZoom(next);
    };
    // 해상도가 바뀌면 커서를 움직이지 않아도 렌즈와 캔버스 크기를 새 화면에 맞춘다.
    const resize = () => setViewport(currentViewport());
    window.addEventListener("pointermove", follow);
    window.addEventListener("wheel", changeZoom, { passive: false });
    window.addEventListener("resize", resize);
    tick();
    const interval = window.setInterval(tick, CAPTURE_INTERVAL_MS);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("wheel", changeZoom);
      window.removeEventListener("resize", resize);
      document.body.style.cursor = previousCursor;
      tickRef.current = () => undefined;
      captureInFlightRef.current = false;
      void stopMagnifierCapture();
    };
  }, []);

  useEffect(() => {
    tickRef.current();
  }, [board, zoom]);

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
        <span style={zoomBadge}>{`${zoom.toFixed(1)}×`}</span>
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
