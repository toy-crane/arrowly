import { CSSProperties, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { matchesAccelerator } from "../shared/accelerator";
import { strokeWidthPx, textSizePx, WidthKey } from "../shared/constants";
import { classifyStroke, HOLD_MS, RING_DELAY_MS, STILL_RADIUS_PX } from "./shapes";
import { drawMark, Point, ShapeMark, StrokeStore, TextMark } from "./strokes";
import { TextEditor } from "./TextEditor";

type Props = {
  color: string;
  widthKey: WidthKey;
  clearAccel: string;
  textAccel: string;
  textMode: boolean;
  onTextModeChange: (on: boolean) => void;
};

/** 편집 요소가 포커스면 오버레이 단축키는 전부 타이핑으로 흡수된다 (우선순위 확정). */
function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

/**
 * 캔버스 2장: base(확정 획) + live(진행 중 획).
 * live는 rAF당 1회만 clear&redraw, base는 획 확정 시 증분 렌더만 한다.
 */
export function DrawingCanvas({ color, widthKey, clearAccel, textAccel, textMode, onTextModeChange }: Props) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const storeRef = useRef<StrokeStore>(null!);
  if (!storeRef.current) storeRef.current = new StrokeStore();
  const toolRef = useRef({ color, widthKey });
  toolRef.current = { color, widthKey };
  const clearAccelRef = useRef(clearAccel);
  clearAccelRef.current = clearAccel;
  const textAccelRef = useRef(textAccel);
  textAccelRef.current = textAccel;
  const textModeRef = useRef(textMode);
  textModeRef.current = textMode;
  const onTextModeChangeRef = useRef(onTextModeChange);
  onTextModeChangeRef.current = onTextModeChange;

  // 편집 세션: 캐럿 위치. 텍스트 모드가 꺼지면(Esc·토글) 입력은 폐기된다.
  const [editorPos, setEditorPos] = useState<Point | null>(null);
  const editingRef = useRef(false);
  editingRef.current = textMode && editorPos !== null;
  useEffect(() => {
    if (!textMode) setEditorPos(null);
  }, [textMode]);

  // effect 클로저의 렌더 경로를 React 이벤트 핸들러에서 쓰기 위한 다리
  const apiRef = useRef<{ commitText: (p: Point, text: string) => void } | null>(null);

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

    // ---- 홀드 스냅: 버튼을 누른 채 STILL_RADIUS_PX 안에서 HOLD_MS 멈추면 도형으로 치환 ----
    const HOLD_TICK_MS = 50;
    let holdAnchor: Point | null = null;
    let holdStart = 0;
    let holdTimer = 0;
    let snapped: ShapeMark | null = null;
    let ringProgress = 0;

    const stopHold = () => {
      if (holdTimer) window.clearInterval(holdTimer);
      holdTimer = 0;
      holdAnchor = null;
      ringProgress = 0;
    };

    const drawHoldRing = (ctx: CanvasRenderingContext2D, p: Point, progress: number) => {
      const cx = p.x + 18;
      const cy = p.y - 18;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(232,234,240,0.25)";
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(232,234,240,0.9)";
      ctx.beginPath();
      ctx.arc(cx, cy, 13, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.stroke();
    };

    const renderLive = () => {
      liveCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (snapped) {
        drawMark(liveCtx, snapped); // 스냅 미리보기 — 떼면 확정
        return;
      }
      if (store.live) {
        drawMark(liveCtx, store.live);
        if (ringProgress > 0) {
          drawHoldRing(liveCtx, store.live.points[store.live.points.length - 1], ringProgress);
        }
      }
    };

    const holdTick = () => {
      if (!store.live || snapped) return;
      const still = Date.now() - holdStart;
      if (still >= HOLD_MS) {
        const result = classifyStroke(store.live.points);
        if (result) {
          const { color, widthKey } = toolRef.current;
          snapped = {
            kind: "shape",
            ...result,
            color,
            width: strokeWidthPx(widthKey, Math.min(window.innerWidth, window.innerHeight)),
          } as ShapeMark;
          stopHold();
        } else {
          holdStart = Date.now(); // 과소 획 — 재무장
          ringProgress = 0;
        }
        scheduleLive();
      } else if (still >= RING_DELAY_MS) {
        ringProgress = (still - RING_DELAY_MS) / (HOLD_MS - RING_DELAY_MS);
        scheduleLive();
      }
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

    // 더블클릭 = 텍스트 진입. 첫 클릭의 점은 두 번째 클릭에서 사후 회수한다(≤350ms 노출 트레이드오프).
    const DBLCLICK_MS = 350;
    const DBLCLICK_SLOP_PX = 6;
    const CLICK_SLOP_PX = 4;
    let lastClick: { p: Point; t: number } | null = null;
    let dblPending: Point | null = null;

    const isClick = (points: Point[], origin: Point) =>
      points.every((q) => Math.hypot(q.x - origin.x, q.y - origin.y) <= CLICK_SLOP_PX);

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (textModeRef.current) {
        // 텍스트 모드: 클릭 = 캐럿 배치, 드래그는 그리지 않는다. 편집 중의 바깥 클릭은
        // TextEditor의 캡처 리스너가 먼저 확정 처리하므로 여기서는 삼킨다.
        if (!editingRef.current) setEditorPos(toPoint(e));
        return;
      }
      const p = toPoint(e);
      if (
        lastClick &&
        Date.now() - lastClick.t <= DBLCLICK_MS &&
        Math.hypot(p.x - lastClick.p.x, p.y - lastClick.p.y) <= DBLCLICK_SLOP_PX
      ) {
        dblPending = lastClick.p;
        lastClick = null;
        return; // 두 번째 클릭은 획을 시작하지 않는다
      }
      const { color, widthKey } = toolRef.current;
      const width = strokeWidthPx(widthKey, Math.min(window.innerWidth, window.innerHeight));
      store.beginLive(color, width, p);
      live.setPointerCapture(e.pointerId);
      snapped = null;
      holdAnchor = p;
      holdStart = Date.now();
      holdTimer = window.setInterval(holdTick, HOLD_TICK_MS);
      scheduleLive();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (snapped) return; // 스냅 후에는 떼기 전까지 도형이 고정된다
      if (!store.live) return;
      const coalesced = e.getCoalescedEvents?.() ?? [];
      // 일부 구현은 빈 배열을 반환한다 — 이벤트 자신으로 폴백
      const points = (coalesced.length ? coalesced : [e]).map(toPoint);
      store.extendLive(points);
      const last = points[points.length - 1];
      if (holdAnchor && Math.hypot(last.x - holdAnchor.x, last.y - holdAnchor.y) > STILL_RADIUS_PX) {
        holdAnchor = last; // 유의미한 이동 — 홀드 리셋
        holdStart = Date.now();
        ringProgress = 0;
      }
      scheduleLive();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (dblPending) {
        const at = dblPending;
        dblPending = null;
        // 첫 클릭이 남긴 점 마크를 회수한다 — 그 자리의 클릭 크기 펜 마크일 때만
        const last = store.marks[store.marks.length - 1];
        if (last?.kind === "pen" && isClick(last.points, at)) {
          store.retractLast();
          renderBase();
        }
        setEditorPos(at);
        onTextModeChangeRef.current(true);
        return;
      }
      stopHold();
      if (snapped) {
        // 스냅 확정: 손그림 live를 버리고 도형 마크를 커밋한다 (undo 1단위)
        const mark = snapped;
        snapped = null;
        store.cancelLive();
        store.push(mark);
        drawMark(baseCtx, mark);
        renderLive();
        return;
      }
      if (!store.live) return;
      store.extendLive([toPoint(e)]);
      const stroke = store.commitLive();
      if (stroke) {
        drawMark(baseCtx, stroke); // 확정 획만 base에 증분 렌더
        lastClick = isClick(stroke.points, stroke.points[0])
          ? { p: stroke.points[0], t: Date.now() }
          : null;
      }
      renderLive();
    };

    const onPointerCancel = () => {
      dblPending = null;
      stopHold();
      snapped = null;
      store.cancelLive();
      renderLive();
    };

    const clearAll = () => {
      store.clear();
      renderBase();
      renderLive();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return; // 입력 중에는 모든 오버레이 단축키를 흡수
      // e.code 기준: 한글 입력 소스에서도 물리 키로 판정
      if (e.metaKey && !e.altKey && !e.ctrlKey && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey ? store.redo() : store.undo()) renderBase();
      } else if (matchesAccelerator(e, clearAccelRef.current)) {
        e.preventDefault();
        clearAll();
      } else if (matchesAccelerator(e, textAccelRef.current)) {
        e.preventDefault();
        onTextModeChangeRef.current(!textModeRef.current);
      }
    };

    // 텍스트 확정: TextMark를 push하고 base에 증분 렌더 (확정 획 커밋과 같은 경로)
    apiRef.current = {
      commitText: (p, text) => {
        const { color, widthKey } = toolRef.current;
        const mark: TextMark = {
          kind: "text",
          x: p.x,
          y: p.y,
          text,
          color,
          size: textSizePx(widthKey, Math.min(window.innerWidth, window.innerHeight)),
        };
        store.push(mark);
        drawMark(baseCtx, mark);
      },
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
        lastClick = null;
        dblPending = null;
        stopHold();
        snapped = null;
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
      stopHold();
      apiRef.current = null;
    };
  }, []);

  return (
    <>
      <canvas ref={baseRef} style={canvasStyle} />
      <canvas ref={liveRef} style={canvasStyle} />
      {textMode && editorPos && (
        <TextEditor
          x={editorPos.x}
          y={editorPos.y}
          color={color}
          size={textSizePx(widthKey, Math.min(window.innerWidth, window.innerHeight))}
          onCommit={(text) => {
            apiRef.current?.commitText(editorPos, text);
            setEditorPos(null);
            onTextModeChange(false); // one-shot: 확정 후 펜 복귀
          }}
          onCancel={() => {
            setEditorPos(null);
            onTextModeChange(false);
          }}
        />
      )}
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
