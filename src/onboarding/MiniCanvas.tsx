import { useEffect, useRef } from "react";
import { DEFAULT_COLOR } from "../shared/constants";
import { drawStroke, Point, StrokeStore } from "../overlay/strokes";

type Props = {
  onFirstStroke?: () => void;
};

/** 온보딩용 미니 캔버스 — M3 엔진(strokes·smoothing) 재사용, 창 안에서만 동작. */
export function MiniCanvas({ onFirstStroke }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const storeRef = useRef<StrokeStore>(null!);
  if (!storeRef.current) storeRef.current = new StrokeStore();
  const firedRef = useRef(false);
  const onFirstRef = useRef(onFirstStroke);
  onFirstRef.current = onFirstStroke;

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const store = storeRef.current;

    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const render = () => {
      ctx.clearRect(0, 0, w, h);
      for (const s of store.strokes) drawStroke(ctx, s);
      if (store.live) drawStroke(ctx, store.live);
    };

    const toPoint = (e: PointerEvent): Point => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      store.beginLive(DEFAULT_COLOR, 5, toPoint(e));
      canvas.setPointerCapture(e.pointerId);
      render();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!store.live) return;
      const coalesced = e.getCoalescedEvents?.() ?? [e];
      store.extendLive(coalesced.map(toPoint));
      render();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!store.live) return;
      store.extendLive([toPoint(e)]);
      store.commitLive();
      render();
      if (!firedRef.current && store.strokes.length > 0) {
        firedRef.current = true;
        onFirstRef.current?.();
      }
    };
    const onPointerCancel = () => {
      store.cancelLive();
      render();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && !e.altKey && !e.ctrlKey && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey ? store.redo() : store.undo()) render();
      } else if (e.altKey && e.code === "Backspace") {
        e.preventDefault();
        store.clear();
        render();
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

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
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, cursor: "crosshair", touchAction: "none" }}
      />
    </div>
  );
}
