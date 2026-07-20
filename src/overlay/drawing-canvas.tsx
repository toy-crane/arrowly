import {
  CSSProperties,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  stepTextSize,
  strokeWidthPx,
  TextSizeKey,
  WidthKey,
} from "../shared/constants";
import {
  drawMark,
  findTextMarkAt,
  Point,
  ShapeMark,
  StrokeStore,
  textCaretOffsetAt,
  TextMark,
} from "../shared/drawing";
import {
  onClearAll,
  onFinishTextEditing,
  onModeChanged,
  setTextEditing,
} from "../shared/ipc";
import { matchesAccelerator } from "../shared/shortcuts";
import { classifyStroke, HOLD_MS, RING_DELAY_MS, STILL_RADIUS_PX } from "./shapes";
import { TextEditor } from "./text-editor";

type Props = {
  color: string;
  widthKey: WidthKey;
  textSizeKey: TextSizeKey;
  clearAccel: string;
  textAccel: string;
  textMode: boolean;
  onTextModeChange: (on: boolean) => void;
  onEditingTextSizeChange?: (size: TextSizeKey | null) => void;
  onNewTextSizeCommit?: (size: TextSizeKey) => void;
};

export type DrawingCanvasHandle = {
  setTextSize: (size: TextSizeKey) => void;
  finishTextEditing: () => void;
  isEditing: () => boolean;
};

type SessionBase = {
  id: number;
  x: number;
  y: number;
  value: string;
  sizeKey: TextSizeKey;
  initialCaret: number;
};

type TextEditorSession =
  | (SessionBase & { kind: "new" })
  | (SessionBase & { kind: "existing"; index: number; original: TextMark });

/** 편집 요소가 포커스면 오버레이 단축키는 전부 타이핑으로 흡수된다 (우선순위 확정). */
function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

/**
 * 캔버스 2장: base(확정 획) + live(진행 중 획).
 * live는 rAF당 1회만 clear&redraw, base는 획 확정 시 증분 렌더만 한다.
 */
export const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(function DrawingCanvas(
  {
    color,
    widthKey,
    textSizeKey,
    clearAccel,
    textAccel,
    textMode,
    onTextModeChange,
    onEditingTextSizeChange,
    onNewTextSizeCommit,
  },
  ref,
) {
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
  const onEditingTextSizeChangeRef = useRef(onEditingTextSizeChange);
  onEditingTextSizeChangeRef.current = onEditingTextSizeChange;
  const onNewTextSizeCommitRef = useRef(onNewTextSizeCommit);
  onNewTextSizeCommitRef.current = onNewTextSizeCommit;
  const defaultTextSizeRef = useRef(textSizeKey);
  defaultTextSizeRef.current = textSizeKey;

  const [session, setSession] = useState<TextEditorSession | null>(null);
  const sessionRef = useRef<TextEditorSession | null>(session);
  sessionRef.current = session;
  const nextSessionIdRef = useRef(1);
  const sessionRequestRef = useRef(0);
  const wantsEditingRef = useRef(false);
  const editingRef = useRef(false);
  editingRef.current = session !== null;

  const renderBaseRef = useRef<() => void>(() => undefined);
  const rememberOutsideClickRef = useRef<(point: Point) => void>(() => undefined);
  const finishSessionRef = useRef<(commit: boolean) => void>(() => undefined);

  const updateSession = (update: (current: TextEditorSession) => TextEditorSession) => {
    const current = sessionRef.current;
    if (!current) return;
    const next = update(current);
    sessionRef.current = next;
    setSession(next);
  };

  const setEditingSize = (sizeKey: TextSizeKey) => {
    updateSession((current) => ({ ...current, sizeKey }));
    onEditingTextSizeChangeRef.current?.(sizeKey);
  };

  useImperativeHandle(
    ref,
    () => ({
      setTextSize: setEditingSize,
      finishTextEditing: () => finishSessionRef.current(true),
      isEditing: () => sessionRef.current !== null,
    }),
    [],
  );

  useEffect(() => {
    if (textMode) return;
    if (sessionRef.current) {
      finishSessionRef.current(true);
      return;
    }
    // Rust가 편집 시작 IPC에 아직 응답하지 않았더라도 T 재입력/마커 토글은 즉시 취소한다.
    // 요청 번호를 넘겨 늦게 도착한 성공 응답이 편집기를 다시 여는 것도 막는다.
    if (wantsEditingRef.current) {
      wantsEditingRef.current = false;
      sessionRequestRef.current += 1;
      void setTextEditing(false);
    }
  }, [textMode]);

  useEffect(() => {
    const store = storeRef.current;
    const base = baseRef.current!;
    const live = liveRef.current!;
    const baseCtx = base.getContext("2d")!;
    const liveCtx = live.getContext("2d")!;
    let rafId = 0;
    let movingTextIndex = -1;
    let movingText: TextMark | null = null;
    let textGesture: {
      origin: Point;
      index: number;
      original: TextMark;
      moving: boolean;
    } | null = null;

    const renderBase = () => {
      baseCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const editingIndex =
        sessionRef.current?.kind === "existing" ? sessionRef.current.index : -1;
      store.marks.forEach((mark, index) => {
        if (index !== editingIndex && index !== movingTextIndex) drawMark(baseCtx, mark);
      });
    };
    renderBaseRef.current = renderBase;

    const closeSession = () => {
      wantsEditingRef.current = false;
      sessionRequestRef.current += 1;
      sessionRef.current = null;
      setSession(null);
      onEditingTextSizeChangeRef.current?.(null);
      onTextModeChangeRef.current(false);
      void setTextEditing(false);
    };

    const finishSession = (commit: boolean) => {
      const current = sessionRef.current;
      if (!current) {
        closeSession();
        return;
      }
      if (commit) {
        const empty = current.value.trim().length === 0;
        if (current.kind === "new") {
          if (!empty) {
            store.push({
              kind: "text",
              x: current.x,
              y: current.y,
              text: current.value,
              color: toolRef.current.color,
              sizeKey: current.sizeKey,
            });
            onNewTextSizeCommitRef.current?.(current.sizeKey);
          }
        } else if (empty) {
          store.remove(current.index);
        } else {
          store.replace(current.index, {
            ...current.original,
            text: current.value,
            sizeKey: current.sizeKey,
          });
        }
      }
      closeSession();
      renderBase();
    };
    finishSessionRef.current = finishSession;

    const beginSession = async (next: TextEditorSession) => {
      wantsEditingRef.current = true;
      const request = ++sessionRequestRef.current;
      try {
        await setTextEditing(true);
      } catch {
        if (request === sessionRequestRef.current) {
          wantsEditingRef.current = false;
          onEditingTextSizeChangeRef.current?.(null);
          onTextModeChangeRef.current(false);
        }
        return;
      }
      if (request !== sessionRequestRef.current || !wantsEditingRef.current) {
        if (!wantsEditingRef.current) void setTextEditing(false);
        return;
      }
      sessionRef.current = next;
      setSession(next);
      onEditingTextSizeChangeRef.current?.(next.sizeKey);
      onTextModeChangeRef.current(true);
      renderBase();
    };

    const beginExistingText = (index: number, mark: TextMark, point: Point) => {
      void beginSession({
        kind: "existing",
        id: nextSessionIdRef.current++,
        index,
        original: mark,
        x: mark.x,
        y: mark.y,
        value: mark.text,
        sizeKey: mark.sizeKey,
        initialCaret: textCaretOffsetAt(mark, point),
      });
    };

    const beginTextAt = (point: Point) => {
      const hit = findTextMarkAt(store.marks, point);
      if (hit) {
        beginExistingText(hit.index, hit.mark, point);
      } else {
        void beginSession({
          kind: "new",
          id: nextSessionIdRef.current++,
          x: point.x,
          y: point.y,
          value: "",
          sizeKey: defaultTextSizeRef.current,
          initialCaret: 0,
        });
      }
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
      if (movingText) {
        drawMark(liveCtx, movingText);
        return;
      }
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
    let lastClick: { p: Point; t: number; markCreated: boolean } | null = null;
    let dblPending: { p: Point; markCreated: boolean } | null = null;
    let suppressNextPointerDown = false;

    rememberOutsideClickRef.current = (point) => {
      lastClick = { p: point, t: Date.now(), markCreated: false };
      suppressNextPointerDown = true;
    };

    const isClick = (points: Point[], origin: Point) =>
      points.every((q) => Math.hypot(q.x - origin.x, q.y - origin.y) <= CLICK_SLOP_PX);

    // 포인터 격리: 제스처를 소유한 포인터 하나만 이어지는 move/up/cancel에 반응한다
    // (두 번째 입력 장치·멀티터치가 첫 포인터의 홀드·스냅 상태를 덮어쓰지 못하게 한다)
    let activePointerId: number | null = null;

    /** 제스처 상태 전체를 취소한다 — 이동 중인 텍스트만 즉시 원위치로 다시 그린다. */
    const resetGestureState = () => {
      const wasMovingText = movingTextIndex >= 0;
      lastClick = null;
      dblPending = null;
      stopHold();
      snapped = null;
      textGesture = null;
      movingText = null;
      movingTextIndex = -1;
      store.cancelLive();
      activePointerId = null;
      if (wasMovingText) renderBase();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      if (suppressNextPointerDown) {
        suppressNextPointerDown = false;
        e.preventDefault();
        return;
      }
      if (textModeRef.current) {
        e.preventDefault();
        if (editingRef.current) return;
        const point = toPoint(e);
        const hit = findTextMarkAt(store.marks, point);
        if (!hit) {
          beginTextAt(point);
          return;
        }
        textGesture = {
          origin: point,
          index: hit.index,
          original: hit.mark,
          moving: false,
        };
        activePointerId = e.pointerId;
        live.setPointerCapture(e.pointerId);
        return;
      }
      const p = toPoint(e);
      if (
        lastClick &&
        Date.now() - lastClick.t <= DBLCLICK_MS &&
        Math.hypot(p.x - lastClick.p.x, p.y - lastClick.p.y) <= DBLCLICK_SLOP_PX
      ) {
        dblPending = { p: lastClick.p, markCreated: lastClick.markCreated };
        lastClick = null;
        // 두 번째 클릭도 자신의 pointerup까지 제스처를 소유한다 — 그 사이 다른 포인터를 차단
        activePointerId = e.pointerId;
        return; // 두 번째 클릭은 획을 시작하지 않는다
      }
      const { color, widthKey } = toolRef.current;
      const width = strokeWidthPx(widthKey, Math.min(window.innerWidth, window.innerHeight));
      store.beginLive(color, width, p);
      live.setPointerCapture(e.pointerId);
      activePointerId = e.pointerId;
      snapped = null;
      holdAnchor = p;
      holdStart = Date.now();
      holdTimer = window.setInterval(holdTick, HOLD_TICK_MS);
      scheduleLive();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      if (textGesture) {
        const point = toPoint(e);
        const dx = point.x - textGesture.origin.x;
        const dy = point.y - textGesture.origin.y;
        if (!textGesture.moving && Math.hypot(dx, dy) > CLICK_SLOP_PX) {
          textGesture.moving = true;
          movingTextIndex = textGesture.index;
          renderBase();
        }
        if (textGesture.moving) {
          movingText = {
            ...textGesture.original,
            x: textGesture.original.x + dx,
            y: textGesture.original.y + dy,
          };
          scheduleLive();
        }
        return;
      }
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
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      if (textGesture) {
        const gesture = textGesture;
        const point = toPoint(e);
        const wasMoving =
          gesture.moving ||
          Math.hypot(point.x - gesture.origin.x, point.y - gesture.origin.y) > CLICK_SLOP_PX;
        const moved = wasMoving
          ? {
              ...gesture.original,
              x: gesture.original.x + point.x - gesture.origin.x,
              y: gesture.original.y + point.y - gesture.origin.y,
            }
          : null;
        textGesture = null;
        movingText = null;
        movingTextIndex = -1;
        activePointerId = null;
        if (moved) {
          store.replace(gesture.index, moved);
          onTextModeChangeRef.current(false);
          renderBase();
          renderLive();
        } else {
          beginExistingText(gesture.index, gesture.original, point);
        }
        return;
      }
      if (dblPending) {
        const { p: at, markCreated } = dblPending;
        dblPending = null;
        activePointerId = null;
        if (markCreated) {
          // 첫 클릭이 남긴 점 마크를 회수한다 — 그 자리의 클릭 크기 펜 마크일 때만
          const last = store.marks[store.marks.length - 1];
          if (last?.kind === "pen" && isClick(last.points, at)) {
            store.retractLast();
            renderBase();
          }
        }
        lastClick = null;
        beginTextAt(at);
        return;
      }
      stopHold();
      if (snapped) {
        // 스냅 확정: 손그림 live를 버리고 도형 마크를 커밋한다 (undo 1단위)
        const mark = snapped;
        snapped = null;
        activePointerId = null;
        store.cancelLive();
        store.push(mark);
        drawMark(baseCtx, mark);
        renderLive();
        return;
      }
      if (!store.live) {
        activePointerId = null;
        return;
      }
      store.extendLive([toPoint(e)]);
      const stroke = store.commitLive();
      if (stroke) {
        drawMark(baseCtx, stroke); // 확정 획만 base에 증분 렌더
        lastClick = isClick(stroke.points, stroke.points[0])
          ? { p: stroke.points[0], t: Date.now(), markCreated: true }
          : null;
      }
      activePointerId = null;
      renderLive();
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      resetGestureState();
      renderLive();
    };

    const clearAll = () => {
      resetGestureState();
      finishSession(false);
      store.clear();
      renderBase();
      renderLive();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const sizeDelta =
        e.metaKey &&
        !e.altKey &&
        !e.ctrlKey &&
        (e.code === "Equal" || e.code === "NumpadAdd")
          ? 1
          : e.metaKey &&
              !e.altKey &&
              !e.ctrlKey &&
              (e.code === "Minus" || e.code === "NumpadSubtract")
            ? -1
            : 0;
      if (sizeDelta) {
        e.preventDefault();
        if (sessionRef.current) {
          const next = stepTextSize(sessionRef.current.sizeKey, sizeDelta as -1 | 1);
          setEditingSize(next);
        }
        return;
      }
      // 입력 중에는 모든 오버레이 단축키를 흡수. editingRef는 DOM 포커스와 무관한
      // 2차 방어 — non-activating panel에서 포커스가 유실돼도 획 버퍼를 오발화로 지키지 않는다
      if (isEditableTarget(e) || editingRef.current) return;
      // e.code 기준: 한글 입력 소스에서도 물리 키로 판정
      if (e.metaKey && !e.altKey && !e.ctrlKey && e.code === "KeyZ") {
        e.preventDefault();
        // 버퍼가 바뀌면 더블클릭 추적은 무효 — 무관한 마크를 회수하는 오동작 방지
        lastClick = null;
        dblPending = null;
        if (e.shiftKey ? store.redo() : store.undo()) renderBase();
      } else if (matchesAccelerator(e, clearAccelRef.current)) {
        e.preventDefault();
        clearAll();
      } else if (matchesAccelerator(e, textAccelRef.current)) {
        e.preventDefault();
        resetGestureState(); // 그리던 획·홀드·더블클릭 대기를 끊고 모드를 바꾼다
        renderLive();
        onTextModeChangeRef.current(!textModeRef.current);
      }
    };

    setupBacking();
    window.addEventListener("resize", setupBacking);
    window.addEventListener("keydown", onKeyDown);
    live.addEventListener("pointerdown", onPointerDown);
    live.addEventListener("pointermove", onPointerMove);
    live.addEventListener("pointerup", onPointerUp);
    live.addEventListener("pointercancel", onPointerCancel);

    const unlistenMode = onModeChanged((p) => {
      if (p.drawing) {
        setupBacking(); // 모니터·해상도가 바뀌었을 수 있음 (기존 획은 재렌더로 복원)
      } else {
        // 숨김≠삭제: 텍스트는 현재 내용 확정, 진행 중 live 획만 취소한다.
        finishSession(true);
        resetGestureState();
        renderLive();
      }
    });
    const unlistenClear = onClearAll(clearAll);
    const unlistenFinishText = onFinishTextEditing(() => finishSession(true));

    return () => {
      window.removeEventListener("resize", setupBacking);
      window.removeEventListener("keydown", onKeyDown);
      live.removeEventListener("pointerdown", onPointerDown);
      live.removeEventListener("pointermove", onPointerMove);
      live.removeEventListener("pointerup", onPointerUp);
      live.removeEventListener("pointercancel", onPointerCancel);
      unlistenMode.then((f) => f());
      unlistenClear.then((f) => f());
      unlistenFinishText.then((f) => f());
      if (rafId) cancelAnimationFrame(rafId);
      stopHold();
      const hadEditingRequest = wantsEditingRef.current;
      wantsEditingRef.current = false;
      sessionRequestRef.current += 1;
      if (hadEditingRequest) void setTextEditing(false);
      renderBaseRef.current = () => undefined;
      rememberOutsideClickRef.current = () => undefined;
      finishSessionRef.current = () => undefined;
    };
  }, []);

  return (
    <>
      <canvas ref={baseRef} style={canvasStyle} />
      <canvas ref={liveRef} style={canvasStyle} />
      {session && (
        <TextEditor
          sessionKey={session.id}
          x={session.x}
          y={session.y}
          color={session.kind === "existing" ? session.original.color : color}
          sizeKey={session.sizeKey}
          value={session.value}
          initialCaret={session.initialCaret}
          onValueChange={(value) => updateSession((current) => ({ ...current, value }))}
          onStepSize={(delta) => setEditingSize(stepTextSize(session.sizeKey, delta))}
          onCommit={() => finishSessionRef.current(true)}
          onCancel={() => finishSessionRef.current(false)}
          onOutsidePointerDown={(point) => {
            finishSessionRef.current(true);
            rememberOutsideClickRef.current(point);
          }}
        />
      )}
    </>
  );
});

const canvasStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "100vw",
  height: "100vh",
  touchAction: "none",
};
