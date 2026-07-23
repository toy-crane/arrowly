import { useEffect, useRef, useState } from "react";
import { DEFAULT_COLOR } from "../shared/constants";
import {
  drawMark,
  findMarkAt,
  Mark,
  Point,
  StrokeStore,
  translateMark,
} from "../shared/drawing";
import { matchesAccelerator } from "../shared/shortcuts";

export type OnboardingPhase = "draw" | "correct" | "finish";
export type CorrectionStep = "move" | "delete" | "undo" | "complete";

type Props = {
  phase: OnboardingPhase;
  correctionStep: CorrectionStep;
  clearAccel: string;
  emptyLabel?: string;
  onFirstStroke: () => void;
  onMoved: () => void;
  onDeleted: () => void;
  onRestored: () => void;
  onCleared: () => void;
};

type MoveGesture = {
  kind: "move";
  index: number;
  mark: Mark;
  from: Point;
  to: Point;
};

type DeleteGesture = {
  kind: "delete";
  index: number;
  from: Point;
};

type Gesture = MoveGesture | DeleteGesture;

const MOVE_THRESHOLD_PX = 4;

/** 온보딩용 미니 캔버스 — 실제 마크 저장소와 hit testing을 쓰되 현재 실습 동작만 허용한다. */
export function MiniCanvas({
  phase,
  correctionStep,
  clearAccel,
  emptyLabel,
  onFirstStroke,
  onMoved,
  onDeleted,
  onRestored,
  onCleared,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const storeRef = useRef<StrokeStore>(null!);
  if (!storeRef.current) storeRef.current = new StrokeStore();
  const firedRef = useRef(false);
  const phaseRef = useRef(phase);
  const correctionStepRef = useRef(correctionStep);
  const clearAccelRef = useRef(clearAccel);
  const callbacksRef = useRef({ onFirstStroke, onMoved, onDeleted, onRestored, onCleared });
  const [empty, setEmpty] = useState(false);

  phaseRef.current = phase;
  correctionStepRef.current = correctionStep;
  clearAccelRef.current = clearAccel;
  callbacksRef.current = { onFirstStroke, onMoved, onDeleted, onRestored, onCleared };

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const store = storeRef.current;
    const dims = { w: 0, h: 0 };
    let gesture: Gesture | null = null;
    let preview: { index: number; mark: Mark } | null = null;

    const render = () => {
      ctx.clearRect(0, 0, dims.w, dims.h);
      store.marks.forEach((mark, index) => {
        drawMark(ctx, preview?.index === index ? preview.mark : mark);
      });
      if (store.live) drawMark(ctx, store.live);
    };

    const setupBacking = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h || (w === dims.w && h === dims.h)) return;
      dims.w = w;
      dims.h = h;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
    };

    setupBacking();
    const resizeObserver = new ResizeObserver(setupBacking);
    resizeObserver.observe(wrap);

    const toPoint = (event: PointerEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const capture = (event: PointerEvent) => canvas.setPointerCapture(event.pointerId);

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const point = toPoint(event);

      if (phaseRef.current === "draw") {
        setEmpty(false);
        store.beginLive(DEFAULT_COLOR, 5, point);
        capture(event);
        render();
        return;
      }

      if (phaseRef.current !== "correct") return;
      const hit = findMarkAt(store.marks, point);
      if (!hit) return;

      if (correctionStepRef.current === "move" && event.metaKey && !event.altKey) {
        gesture = { kind: "move", index: hit.index, mark: hit.mark, from: point, to: point };
        capture(event);
      } else if (correctionStepRef.current === "delete" && event.altKey && !event.metaKey) {
        gesture = { kind: "delete", index: hit.index, from: point };
        capture(event);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (store.live) {
        const coalesced = event.getCoalescedEvents?.() ?? [event];
        store.extendLive(coalesced.map(toPoint));
        render();
        return;
      }
      if (gesture?.kind !== "move") return;
      gesture.to = toPoint(event);
      preview = {
        index: gesture.index,
        mark: translateMark(
          gesture.mark,
          gesture.to.x - gesture.from.x,
          gesture.to.y - gesture.from.y,
        ),
      };
      render();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (store.live) {
        store.extendLive([toPoint(event)]);
        store.commitLive();
        render();
        if (!firedRef.current && store.marks.length > 0) {
          firedRef.current = true;
          callbacksRef.current.onFirstStroke();
        }
        return;
      }
      if (!gesture) return;

      const point = toPoint(event);
      if (gesture.kind === "move") {
        const dx = point.x - gesture.from.x;
        const dy = point.y - gesture.from.y;
        const moved = Math.hypot(dx, dy) >= MOVE_THRESHOLD_PX;
        preview = null;
        if (moved && store.replace(gesture.index, translateMark(gesture.mark, dx, dy))) {
          callbacksRef.current.onMoved();
        }
      } else if (
        Math.hypot(point.x - gesture.from.x, point.y - gesture.from.y) < MOVE_THRESHOLD_PX &&
        store.remove(gesture.index)
      ) {
        callbacksRef.current.onDeleted();
      }
      gesture = null;
      render();
    };

    const onPointerCancel = () => {
      store.cancelLive();
      gesture = null;
      preview = null;
      render();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        phaseRef.current === "correct" &&
        correctionStepRef.current === "undo" &&
        event.metaKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        event.code === "KeyZ"
      ) {
        event.preventDefault();
        if (store.undo()) {
          setEmpty(false);
          render();
          callbacksRef.current.onRestored();
        }
        return;
      }
      if (
        phaseRef.current === "finish" &&
        !event.repeat &&
        matchesAccelerator(event, clearAccelRef.current) &&
        store.marks.length > 0
      ) {
        event.preventDefault();
        store.clear();
        setEmpty(true);
        render();
        callbacksRef.current.onCleared();
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const cursor = phase === "draw" ? "crosshair" : correctionStep === "move" ? "move" : "default";

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        flex: 1,
        minHeight: 110,
        border: "1px dashed var(--line-strong)",
        borderRadius: 10,
        overflow: "hidden",
        background: "transparent",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          cursor,
          touchAction: "none",
        }}
      />
      {empty && emptyLabel && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "var(--muted)",
            fontSize: 13,
            pointerEvents: "none",
          }}
        >
          {emptyLabel}
        </span>
      )}
    </div>
  );
}
