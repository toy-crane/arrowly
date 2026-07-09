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

    const dims = { w: 0, h: 0 };

    const render = () => {
      ctx.clearRect(0, 0, dims.w, dims.h);
      for (const s of store.strokes) drawStroke(ctx, s);
      if (store.live) drawStroke(ctx, store.live);
    };

    // 창이 자리 잡기 전(마운트 직후)의 크기로 한 번만 재면 백킹과 CSS 크기가
    // 어긋나 획이 커서에서 밀려 보인다 — 크기가 바뀔 때마다 백킹을 다시 만든다.
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
    const ro = new ResizeObserver(setupBacking);
    ro.observe(wrap);

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
      ro.disconnect();
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
        style={{
          // canvas는 대체 요소라 inset만으론 안 늘어남 — CSS 크기를 명시해야
          // 백킹(width/height 속성)이 표시 크기를 밀어내지 않는다
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          cursor: "crosshair",
          touchAction: "none",
        }}
      />
    </div>
  );
}
