import { CSSProperties, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { matchesAccelerator } from "../shared/accelerator";
import { strokeWidthPx, WidthKey } from "../shared/constants";
import { drawMark, Point, StrokeStore } from "./strokes";

type Props = {
  color: string;
  widthKey: WidthKey;
  clearAccel: string;
};

/**
 * 캔버스 2장: base(확정 획) + live(진행 중 획).
 * live는 rAF당 1회만 clear&redraw, base는 획 확정 시 증분 렌더만 한다.
 */
export function DrawingCanvas({ color, widthKey, clearAccel }: Props) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const storeRef = useRef<StrokeStore>(null!);
  if (!storeRef.current) storeRef.current = new StrokeStore();
  const toolRef = useRef({ color, widthKey });
  toolRef.current = { color, widthKey };
  const clearAccelRef = useRef(clearAccel);
  clearAccelRef.current = clearAccel;

  useEffect(() => {
    const store = storeRef.current;
    const base = baseRef.current!;
    const live = liveRef.current!;
    const baseCtx = base.getContext("2d")!;
    const liveCtx = live.getContext("2d")!;
    let rafId = 0;

    const renderBase = () => {
      baseCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const s of store.marks) drawMark(baseCtx, s);
    };

    const renderLive = () => {
      liveCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (store.live) drawMark(liveCtx, store.live);
    };

    // Retina 백킹: 물리 픽셀 크기 + dpr 스케일 (setTransform이라 재호출 누적 없음)
    const setupBacking = () => {
      const dpr = window.devicePixelRatio || 1;
      for (const [c, ctx] of [
        [base, baseCtx],
        [live, liveCtx],
      ] as const) {
        c.width = Math.round(window.innerWidth * dpr);
        c.height = Math.round(window.innerHeight * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      renderBase();
      renderLive();
    };

    const scheduleLive = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        renderLive();
      });
    };

    const toPoint = (e: PointerEvent): Point => ({ x: e.clientX, y: e.clientY });

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const { color, widthKey } = toolRef.current;
      const width = strokeWidthPx(widthKey, Math.min(window.innerWidth, window.innerHeight));
      store.beginLive(color, width, toPoint(e));
      live.setPointerCapture(e.pointerId);
      scheduleLive();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!store.live) return;
      const coalesced = e.getCoalescedEvents?.() ?? [e];
      store.extendLive(coalesced.map(toPoint));
      scheduleLive();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!store.live) return;
      store.extendLive([toPoint(e)]);
      const stroke = store.commitLive();
      if (stroke) drawMark(baseCtx, stroke); // 확정 획만 base에 증분 렌더
      renderLive();
    };

    const onPointerCancel = () => {
      store.cancelLive();
      renderLive();
    };

    const clearAll = () => {
      store.clear();
      renderBase();
      renderLive();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // e.code 기준: 한글 입력 소스에서도 물리 키로 판정
      if (e.metaKey && !e.altKey && !e.ctrlKey && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey ? store.redo() : store.undo()) renderBase();
      } else if (matchesAccelerator(e, clearAccelRef.current)) {
        e.preventDefault();
        clearAll();
      }
    };

    setupBacking();
    window.addEventListener("resize", setupBacking);
    window.addEventListener("keydown", onKeyDown);
    live.addEventListener("pointerdown", onPointerDown);
    live.addEventListener("pointermove", onPointerMove);
    live.addEventListener("pointerup", onPointerUp);
    live.addEventListener("pointercancel", onPointerCancel);

    const unlistenMode = listen<{ drawing: boolean }>("mode-changed", (ev) => {
      if (ev.payload.drawing) {
        setupBacking(); // 모니터·해상도가 바뀌었을 수 있음 (기존 획은 재렌더로 복원)
      } else {
        // 숨김≠삭제: 진행 중이던 live 획만 취소하고 그림 버퍼는 유지한다 (커서는 OverlayApp 담당)
        store.cancelLive();
        renderLive();
      }
    });
    const unlistenClear = listen("clear-all", clearAll);

    return () => {
      window.removeEventListener("resize", setupBacking);
      window.removeEventListener("keydown", onKeyDown);
      live.removeEventListener("pointerdown", onPointerDown);
      live.removeEventListener("pointermove", onPointerMove);
      live.removeEventListener("pointerup", onPointerUp);
      live.removeEventListener("pointercancel", onPointerCancel);
      unlistenMode.then((f) => f());
      unlistenClear.then((f) => f());
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <>
      <canvas ref={baseRef} style={canvasStyle} />
      <canvas ref={liveRef} style={canvasStyle} />
    </>
  );
}

const canvasStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "100vw",
  height: "100vh",
  touchAction: "none",
};
