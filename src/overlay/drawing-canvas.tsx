import {
  CSSProperties,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Color,
  colorForDigitCode,
  stepTextSize,
  strokeWidthPx,
  TextSizeKey,
  WidthKey,
} from "../shared/constants";
import {
  drawMark,
  findMarkAt,
  findTextMarkAt,
  LineMark,
  markFrameBounds,
  Mark,
  Point,
  ShapeMark,
  StrokeStore,
  textCaretOffsetAt,
  TextMark,
  translateMark,
} from "../shared/drawing";
import {
  onClearAll,
  onFinishTextEditing,
  onModeChanged,
  setTextEditing,
} from "../shared/ipc";
import { matchesAccelerator } from "../shared/shortcuts";
import {
  DISCOVERY_REVEAL_DELAY_MS,
  initialMarkInteraction,
  type MarkAction,
  type MarkInteractionEvent,
  type MarkInteractionState,
  transitionMarkInteraction,
} from "./mark-interaction";
import {
  classifyStroke,
  HOLD_MS,
  RING_DELAY_MS,
  STILL_RADIUS_PX,
} from "./stroke-correction";
import { TextEditor } from "./text-editor";
import {
  createGeometricMark,
  type DrawingTool,
  isGeometricTool,
  type GeometricTool,
} from "./tools";

const ACTION_FOCUS_SCRIM = "rgba(7, 10, 18, 0.38)";
const ACTION_FOCUS_COLORS: Record<MarkAction, { path: string; strong: string; frame: string }> = {
  move: {
    path: "rgba(255, 255, 255, 0.68)",
    strong: "rgba(255, 255, 255, 0.94)",
    frame: "rgba(255, 255, 255, 0.78)",
  },
  delete: {
    path: "rgba(255, 92, 92, 0.72)",
    strong: "rgba(255, 76, 76, 0.96)",
    frame: "rgba(255, 92, 92, 0.86)",
  },
};

function isModifierKey(key: string): boolean {
  return key === "Meta" || key === "Shift" || key === "Alt" || key === "Control";
}

type Props = {
  color: string;
  widthKey: WidthKey;
  textSizeKey: TextSizeKey;
  clearAccel: string;
  textAccel: string;
  tool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  onWidthStep?: (delta: -1 | 1) => void;
  onTextSizeStep?: (delta: -1 | 1) => void;
  onColorPick?: (color: Color) => void;
  onPointerPing?: (point: Point) => void;
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
    tool,
    onToolChange,
    onWidthStep,
    onTextSizeStep,
    onColorPick,
    onPointerPing,
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
  const activeToolRef = useRef(tool);
  activeToolRef.current = tool;
  const onToolChangeRef = useRef(onToolChange);
  onToolChangeRef.current = onToolChange;
  const onWidthStepRef = useRef(onWidthStep);
  onWidthStepRef.current = onWidthStep;
  const onTextSizeStepRef = useRef(onTextSizeStep);
  onTextSizeStepRef.current = onTextSizeStep;
  const onColorPickRef = useRef(onColorPick);
  onColorPickRef.current = onColorPick;
  const onPointerPingRef = useRef(onPointerPing);
  onPointerPingRef.current = onPointerPing;
  const onEditingTextSizeChangeRef = useRef(onEditingTextSizeChange);
  onEditingTextSizeChangeRef.current = onEditingTextSizeChange;
  const onNewTextSizeCommitRef = useRef(onNewTextSizeCommit);
  onNewTextSizeCommitRef.current = onNewTextSizeCommit;
  const defaultTextSizeRef = useRef(textSizeKey);
  defaultTextSizeRef.current = textSizeKey;
  const previousToolRef = useRef(tool);

  const [session, setSession] = useState<TextEditorSession | null>(null);
  const sessionRef = useRef<TextEditorSession | null>(session);
  sessionRef.current = session;
  const nextSessionIdRef = useRef(1);
  const sessionRequestRef = useRef(0);
  const wantsEditingRef = useRef(false);
  const editingRef = useRef(false);
  editingRef.current = session !== null;

  const renderBaseRef = useRef<() => void>(() => undefined);
  const resetGestureRef = useRef<() => void>(() => undefined);
  const syncDeleteToolRef = useRef<(latched: boolean) => void>(() => undefined);
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
    const previousTool = previousToolRef.current;
    previousToolRef.current = tool;
    // 텍스트 편집기 바깥 클릭은 text → freehand 전환과 함께 첫 클릭을 기억한다.
    // 그 전환에서 추적 상태까지 지우면 두 번째 클릭이 점 마크로 남는다.
    if (!(previousTool === "text" && tool === "freehand")) resetGestureRef.current();
    syncDeleteToolRef.current(tool === "delete");
    if (tool === "text") return;
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
  }, [tool]);

  useEffect(() => {
    const store = storeRef.current;
    const base = baseRef.current!;
    const live = liveRef.current!;
    const baseCtx = base.getContext("2d")!;
    const liveCtx = live.getContext("2d")!;
    let rafId = 0;
    let interaction: MarkInteractionState = initialMarkInteraction;
    let revealTimer = 0;
    let hoveredMarkIndex = -1;
    let hoverPointer: Point | null = null;
    let movingMarkIndex = -1;
    let movingMark: Mark | null = null;
    let movingOriginal: Mark | null = null;

    const renderBase = () => {
      baseCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const editingIndex =
        sessionRef.current?.kind === "existing" ? sessionRef.current.index : -1;
      store.marks.forEach((mark, index) => {
        if (index !== editingIndex && index !== movingMarkIndex) drawMark(baseCtx, mark);
      });
    };
    renderBaseRef.current = renderBase;

    const closeSession = () => {
      wantsEditingRef.current = false;
      sessionRequestRef.current += 1;
      sessionRef.current = null;
      setSession(null);
      onEditingTextSizeChangeRef.current?.(null);
      onToolChangeRef.current("freehand");
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
          onToolChangeRef.current("freehand");
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
      onToolChangeRef.current("text");
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

    let geometricGesture: {
      tool: GeometricTool;
      origin: Point;
      current: Point;
    } | null = null;
    let geometricPreview: ShapeMark | LineMark | null = null;
    const HOLD_TICK_MS = 50;
    let holdAnchor: Point | null = null;
    let holdStart = 0;
    let holdTimer = 0;
    let correctionPreview: ShapeMark | LineMark | null = null;
    let correctionAnchor: Point | null = null;
    let correctionRingVisible = false;
    let correctionProgress = 0;

    const stopHold = () => {
      if (holdTimer) window.clearInterval(holdTimer);
      holdTimer = 0;
      holdAnchor = null;
      correctionRingVisible = false;
      correctionProgress = 0;
    };

    const drawCorrectionRing = (
      context: CanvasRenderingContext2D,
      point: Point,
      progress: number,
    ) => {
      const centerX = point.x + 18;
      const centerY = point.y - 18;
      context.lineWidth = 2;
      context.lineCap = "round";
      context.strokeStyle = "rgba(232,234,240,0.25)";
      context.beginPath();
      context.arc(centerX, centerY, 13, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = "rgba(232,234,240,0.9)";
      context.beginPath();
      context.arc(
        centerX,
        centerY,
        13,
        -Math.PI / 2,
        -Math.PI / 2 + progress * Math.PI * 2,
      );
      context.stroke();
    };

    const interactionAction = (): MarkAction | null =>
      interaction.phase === "discovery" || interaction.phase === "gesture"
        ? interaction.action
        : null;

    const interactionFieldVisible = () =>
      (interaction.phase === "discovery" && interaction.visible) ||
      (interaction.phase === "gesture" && interaction.fieldVisible);

    const interactionTargetIndex = () =>
      interaction.phase === "gesture" ? interaction.targetIndex : null;

    const drawActionCandidate = (
      ctx: CanvasRenderingContext2D,
      mark: Mark,
      action: MarkAction,
      emphasized = false,
    ) => {
      const colors = ACTION_FOCUS_COLORS[action];
      if (mark.kind === "pen" || (mark.kind === "shape" && mark.shape === "line")) {
        ctx.save();
        drawMark(ctx, {
          ...mark,
          color: emphasized ? colors.strong : colors.path,
          width: mark.width + (emphasized ? 16 : 12),
        });
        ctx.restore();
        drawMark(ctx, mark);
        return;
      }

      drawMark(ctx, mark);
      const frame = markFrameBounds(mark);
      if (!frame) return;
      ctx.save();
      ctx.strokeStyle = colors.frame;
      ctx.lineWidth = emphasized ? 3 : 1.5;
      ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);
      ctx.restore();
    };

    const renderLive = () => {
      liveCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const action = interactionAction();
      const fieldVisible = interactionFieldVisible();
      const targetIndex = interactionTargetIndex();
      if (movingMark) {
        if (action && fieldVisible) {
          liveCtx.save();
          liveCtx.fillStyle = ACTION_FOCUS_SCRIM;
          liveCtx.fillRect(0, 0, window.innerWidth, window.innerHeight);
          liveCtx.restore();
          store.marks.forEach((mark, index) => {
            if (index !== targetIndex) {
              drawActionCandidate(liveCtx, mark, action, index === hoveredMarkIndex);
            }
          });
        }
        drawActionCandidate(liveCtx, movingMark, "move", true);
        return;
      }
      if (geometricPreview) {
        drawMark(liveCtx, geometricPreview);
        return;
      }
      if (correctionPreview) {
        drawMark(liveCtx, correctionPreview);
        return;
      }
      if (store.live) {
        drawMark(liveCtx, store.live);
        if (correctionRingVisible) {
          drawCorrectionRing(
            liveCtx,
            store.live.points[store.live.points.length - 1],
            correctionProgress,
          );
        }
        return;
      }
      if (action && fieldVisible) {
        liveCtx.save();
        liveCtx.fillStyle = ACTION_FOCUS_SCRIM;
        liveCtx.fillRect(0, 0, window.innerWidth, window.innerHeight);
        liveCtx.restore();
        store.marks.forEach((mark, index) =>
          drawActionCandidate(
            liveCtx,
            mark,
            action,
            index === (targetIndex ?? hoveredMarkIndex),
          ),
        );
        return;
      }
      if (action && targetIndex !== null) {
        const mark = store.marks[targetIndex];
        if (mark) drawActionCandidate(liveCtx, mark, action, true);
      }
    };

    const clearRevealTimer = () => {
      if (revealTimer) window.clearTimeout(revealTimer);
      revealTimer = 0;
    };

    const applyInteractionEvent = (event: MarkInteractionEvent) => {
      const result = transitionMarkInteraction(interaction, event);
      interaction = result.state;
      return result;
    };

    const scheduleReveal = () => {
      clearRevealTimer();
      if (
        interaction.phase !== "discovery" ||
        interaction.source !== "modifier" ||
        interaction.visible
      ) {
        return;
      }
      revealTimer = window.setTimeout(() => {
        revealTimer = 0;
        applyInteractionEvent({ type: "reveal" });
        renderLive();
      }, DISCOVERY_REVEAL_DELAY_MS);
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
      let ranSynchronously = false;
      const requestedId = requestAnimationFrame(() => {
        ranSynchronously = true;
        rafId = 0;
        renderLive();
      });
      // 테스트·일부 호스트 스텁은 callback을 동기 실행한다. 그 경우 완료 후 반환된 id로
      // rafId를 다시 덮어쓰면 이후 모든 live 렌더가 영구 차단된다.
      if (!ranSynchronously) rafId = requestedId;
    };

    const toPoint = (e: PointerEvent): Point => ({ x: e.clientX, y: e.clientY });

    const refreshInteractionHover = () => {
      const previous = hoveredMarkIndex;
      hoveredMarkIndex =
        interaction.phase === "discovery" && interaction.visible && hoverPointer
          ? (findMarkAt(store.marks, hoverPointer)?.index ?? -1)
          : -1;
      const action = interactionAction();
      live.style.cursor =
        hoveredMarkIndex < 0 ? "default" : action === "move" ? "grab" : "pointer";
      return hoveredMarkIndex !== previous;
    };

    const updateGeometricPreview = (point: Point) => {
      if (!geometricGesture) return;
      geometricGesture.current = point;
      const { color, widthKey } = toolRef.current;
      geometricPreview = createGeometricMark(
        geometricGesture.tool,
        geometricGesture.origin,
        point,
        color,
        strokeWidthPx(widthKey, Math.min(window.innerWidth, window.innerHeight)),
      );
      scheduleLive();
    };

    const holdTick = () => {
      if (!store.live || correctionPreview) return;
      const stillFor = Date.now() - holdStart;
      if (stillFor >= HOLD_MS) {
        const result = classifyStroke(store.live.points);
        if (result) {
          const { color, widthKey } = toolRef.current;
          const ink = {
            color,
            width: strokeWidthPx(widthKey, Math.min(window.innerWidth, window.innerHeight)),
          };
          correctionPreview =
            result.shape === "line"
              ? { kind: "shape", ...result, arrowhead: "none", ...ink }
              : { kind: "shape", ...result, ...ink };
          correctionAnchor = store.live.points[store.live.points.length - 1];
          stopHold();
        } else {
          armHold(store.live.points[store.live.points.length - 1]);
        }
        scheduleLive();
      } else if (stillFor >= RING_DELAY_MS) {
        correctionRingVisible = true;
        correctionProgress = (stillFor - RING_DELAY_MS) / (HOLD_MS - RING_DELAY_MS);
        scheduleLive();
      }
    };

    function armHold(anchor: Point) {
      if (holdTimer) window.clearInterval(holdTimer);
      holdAnchor = anchor;
      holdStart = Date.now();
      correctionRingVisible = false;
      correctionProgress = 0;
      holdTimer = window.setInterval(holdTick, HOLD_TICK_MS);
    }

    // 더블클릭 = 텍스트 진입. 첫 클릭의 점은 두 번째 클릭에서 사후 회수한다(≤350ms 노출 트레이드오프).
    const DBLCLICK_MS = 350;
    const DBLCLICK_SLOP_PX = 6;
    const CLICK_SLOP_PX = 4;
    let lastClick: { p: Point; t: number; markCreated: boolean } | null = null;
    let dblPending: { p: Point; markCreated: boolean; pinged: boolean } | null = null;
    let suppressNextPointerDown = false;

    rememberOutsideClickRef.current = (point) => {
      lastClick = { p: point, t: Date.now(), markCreated: false };
      suppressNextPointerDown = true;
    };

    const isClick = (points: Point[], origin: Point) =>
      points.every((q) => Math.hypot(q.x - origin.x, q.y - origin.y) <= CLICK_SLOP_PX);

    /** 첫 클릭이 남긴 점 마크를 회수한다 — 그 자리의 클릭 크기 펜 마크일 때만. */
    const retractClickDot = (at: Point) => {
      const last = store.marks[store.marks.length - 1];
      if (last?.kind === "pen" && isClick(last.points, at)) {
        store.retractLast();
        renderBase();
      }
    };

    // 포인터 격리: 제스처를 소유한 포인터 하나만 이어지는 move/up/cancel에 반응한다.
    let activePointerId: number | null = null;

    /** 제스처 상태 전체를 취소한다 — 이동 중인 마크는 즉시 원위치로 다시 그린다. */
    const resetGestureState = () => {
      const wasMovingMark = movingMarkIndex >= 0;
      lastClick = null;
      dblPending = null;
      stopHold();
      correctionPreview = null;
      correctionAnchor = null;
      geometricGesture = null;
      geometricPreview = null;
      clearRevealTimer();
      applyInteractionEvent({ type: "reset" });
      movingMark = null;
      movingOriginal = null;
      movingMarkIndex = -1;
      hoveredMarkIndex = -1;
      hoverPointer = null;
      live.style.cursor = "default";
      store.cancelLive();
      activePointerId = null;
      if (wasMovingMark) renderBase();
    };
    resetGestureRef.current = resetGestureState;

    syncDeleteToolRef.current = (latched) => {
      clearRevealTimer();
      applyInteractionEvent({ type: latched ? "latch-delete" : "unlatch-delete" });
      hoverPointer = null;
      hoveredMarkIndex = -1;
      live.style.cursor = "default";
      renderLive();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      if (suppressNextPointerDown) {
        suppressNextPointerDown = false;
        e.preventDefault();
        return;
      }
      const p = toPoint(e);
      if ((e.metaKey || e.altKey) && interaction.phase === "idle") {
        applyInteractionEvent({
          type: "modifier-down",
          action: e.metaKey ? "move" : "delete",
        });
      }
      if (interaction.phase === "discovery") {
        e.preventDefault();
        if (editingRef.current) return;
        clearRevealTimer();
        const hit = findMarkAt(store.marks, p);
        applyInteractionEvent({
          type: "pointer-down",
          pointerId: e.pointerId,
          point: p,
          targetIndex: hit?.index ?? null,
        });
        activePointerId = e.pointerId;
        live.setPointerCapture(e.pointerId);
        hoveredMarkIndex = hit?.index ?? -1;
        if (hit) {
          if (interactionAction() === "move") {
            movingOriginal = hit.mark;
            movingMark = hit.mark;
          }
          live.style.cursor = interactionAction() === "move" ? "grabbing" : "pointer";
        }
        renderLive();
        return;
      }
      if (e.metaKey || e.altKey || interaction.phase === "suppressed") {
        e.preventDefault();
        return;
      }
      if (activeToolRef.current === "text") {
        e.preventDefault();
        if (editingRef.current) return;
        beginTextAt(p);
        return;
      }
      if (isGeometricTool(activeToolRef.current)) {
        e.preventDefault();
        geometricGesture = {
          tool: activeToolRef.current,
          origin: p,
          current: p,
        };
        geometricPreview = null;
        activePointerId = e.pointerId;
        live.setPointerCapture(e.pointerId);
        return;
      }
      if (
        lastClick &&
        Date.now() - lastClick.t <= DBLCLICK_MS &&
        Math.hypot(p.x - lastClick.p.x, p.y - lastClick.p.y) <= DBLCLICK_SLOP_PX
      ) {
        const at = lastClick.p;
        const markCreated = lastClick.markCreated;
        lastClick = null;
        // 두 번째 클릭도 자신의 pointerup까지 제스처를 소유한다 — 그 사이 다른 포인터를 차단
        activePointerId = e.pointerId;
        // 텍스트가 아닌 더블클릭은 누르는 순간 핑을 재생한다 — 떼기를 기다리지 않아
        // 사람이 버튼을 쥐고 있는 시간만큼의 체감 지연이 사라진다. 두 번째 클릭은
        // 어차피 획을 시작하지 않으므로 pointerup까지 미룰 이유가 없다.
        const pingNow = !findTextMarkAt(store.marks, at);
        if (pingNow) {
          if (markCreated) retractClickDot(at);
          onPointerPingRef.current?.(at);
        }
        dblPending = { p: at, markCreated: markCreated && !pingNow, pinged: pingNow };
        return; // 두 번째 클릭은 획을 시작하지 않는다
      }
      const { color, widthKey } = toolRef.current;
      const width = strokeWidthPx(widthKey, Math.min(window.innerWidth, window.innerHeight));
      store.beginLive(color, width, p);
      live.setPointerCapture(e.pointerId);
      activePointerId = e.pointerId;
      correctionPreview = null;
      correctionAnchor = null;
      armHold(p);
      scheduleLive();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      if (activePointerId === null && interaction.phase === "discovery" && interaction.visible) {
        hoverPointer = toPoint(e);
        if (refreshInteractionHover()) renderLive();
        return;
      }
      if (interaction.phase === "gesture") {
        const point = toPoint(e);
        applyInteractionEvent({ type: "pointer-move", pointerId: e.pointerId, point });
        if (
          interaction.phase === "gesture" &&
          interaction.action === "move" &&
          interaction.targetIndex !== null &&
          movingOriginal
        ) {
          if (interaction.moving && movingMarkIndex < 0) {
            movingMarkIndex = interaction.targetIndex;
            renderBase();
          }
          if (interaction.moving) {
            movingMark = translateMark(
              movingOriginal,
              point.x - interaction.origin.x,
              point.y - interaction.origin.y,
            );
          }
          scheduleLive();
        }
        return;
      }
      if (geometricGesture) {
        updateGeometricPreview(toPoint(e));
        return;
      }
      if (correctionPreview) {
        const point = toPoint(e);
        if (
          correctionAnchor &&
          Math.hypot(point.x - correctionAnchor.x, point.y - correctionAnchor.y) >
            STILL_RADIUS_PX
        ) {
          correctionPreview = null;
          correctionAnchor = null;
          store.extendLive([point]);
          armHold(point);
          scheduleLive();
        }
        return;
      }
      if (!store.live) return;
      const coalesced = e.getCoalescedEvents?.() ?? [];
      // 일부 구현은 빈 배열을 반환한다 — 이벤트 자신으로 폴백
      const points = (coalesced.length ? coalesced : [e]).map(toPoint);
      store.extendLive(points);
      for (const point of points) {
        if (
          holdAnchor &&
          Math.hypot(point.x - holdAnchor.x, point.y - holdAnchor.y) > STILL_RADIUS_PX
        ) {
          armHold(point);
        }
      }
      scheduleLive();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      if (interaction.phase === "gesture") {
        const point = toPoint(e);
        const releaseTarget = findMarkAt(store.marks, point)?.index ?? null;
        const result = applyInteractionEvent({
          type: "pointer-up",
          pointerId: e.pointerId,
          point,
          targetIndex: releaseTarget,
        });
        const original = movingOriginal;
        const wasMoving = movingMarkIndex >= 0;
        movingMark = null;
        movingOriginal = null;
        movingMarkIndex = -1;
        activePointerId = null;
        if (result.outcome?.kind === "move" && original) {
          store.replace(
            result.outcome.index,
            translateMark(original, result.outcome.dx, result.outcome.dy),
          );
          renderBase();
        } else if (result.outcome?.kind === "delete") {
          store.remove(result.outcome.index);
          renderBase();
        } else if (wasMoving) {
          renderBase();
        }
        hoverPointer = point;
        refreshInteractionHover();
        scheduleReveal();
        renderLive();
        return;
      }
      if (geometricGesture) {
        const point = toPoint(e);
        const { origin, tool: geometricTool } = geometricGesture;
        geometricGesture = null;
        activePointerId = null;
        if (Math.hypot(point.x - origin.x, point.y - origin.y) > CLICK_SLOP_PX) {
          const { color, widthKey } = toolRef.current;
          const mark = createGeometricMark(
            geometricTool,
            origin,
            point,
            color,
            strokeWidthPx(widthKey, Math.min(window.innerWidth, window.innerHeight)),
          );
          geometricPreview = null;
          store.push(mark);
          drawMark(baseCtx, mark);
        } else {
          geometricPreview = null;
        }
        renderLive();
        return;
      }
      if (dblPending) {
        const { p: at, markCreated, pinged } = dblPending;
        dblPending = null;
        activePointerId = null;
        if (markCreated) retractClickDot(at);
        lastClick = null;
        // 핑은 이미 pointerdown에서 재생했다. 여기 남는 건 텍스트 교정 진입뿐이다.
        if (!pinged) {
          const textHit = findTextMarkAt(store.marks, at);
          if (textHit) {
            beginExistingText(textHit.index, textHit.mark, at);
          } else {
            onPointerPingRef.current?.(at);
          }
        }
        return;
      }
      stopHold();
      if (correctionPreview) {
        const mark = correctionPreview;
        correctionPreview = null;
        correctionAnchor = null;
        activePointerId = null;
        lastClick = null;
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
      if (interaction.phase === "gesture") {
        const wasMoving = movingMarkIndex >= 0;
        applyInteractionEvent({ type: "pointer-cancel", pointerId: e.pointerId });
        movingMark = null;
        movingOriginal = null;
        movingMarkIndex = -1;
        activePointerId = null;
        if (wasMoving) renderBase();
        scheduleReveal();
        refreshInteractionHover();
        renderLive();
        return;
      }
      resetGestureState();
      renderLive();
    };

    const clearAll = () => {
      resetGestureState();
      if (activeToolRef.current === "delete") {
        applyInteractionEvent({ type: "latch-delete" });
      }
      if (sessionRef.current || wantsEditingRef.current) {
        finishSession(false);
      }
      store.clear();
      renderBase();
      renderLive();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Alt") {
        if (
          isEditableTarget(e) ||
          editingRef.current ||
          activePointerId !== null
        ) {
          return;
        }
        applyInteractionEvent({
          type: "modifier-down",
          action: e.key === "Meta" ? "move" : "delete",
        });
        scheduleReveal();
        return;
      }
      if (!isModifierKey(e.key)) {
        const previous = interaction;
        clearRevealTimer();
        applyInteractionEvent({ type: "shortcut-chord" });
        if (interaction !== previous) renderLive();
      }
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
        } else if (activeToolRef.current === "text") {
          onTextSizeStepRef.current?.(sizeDelta as -1 | 1);
        } else if (
          activeToolRef.current === "freehand" ||
          isGeometricTool(activeToolRef.current)
        ) {
          onWidthStepRef.current?.(sizeDelta as -1 | 1);
        }
        return;
      }
      // ⌘1–⌘5 색 선택 — 굵기 ⌘± 와 같은 우선순위라 흡수 가드보다 앞서 편집 세션 중에도 동작한다.
      // 수정자 없는 숫자는 글자 입력으로 흘려보내고, 진행 중 포인터 제스처 동안에는 무시해
      // "색은 제스처 시작 시 결정" 잉크 속성 계약을 지킨다.
      if (e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && activePointerId === null) {
        const nextColor = colorForDigitCode(e.code);
        if (nextColor) {
          e.preventDefault();
          onColorPickRef.current?.(nextColor);
          return;
        }
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
        if (e.shiftKey ? store.redo() : store.undo()) {
          renderBase();
          if (interaction.phase === "discovery" && interaction.visible) {
            refreshInteractionHover();
            renderLive();
          }
        }
      } else if (matchesAccelerator(e, clearAccelRef.current)) {
        e.preventDefault();
        clearAll();
      } else if (
        !e.metaKey &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        activePointerId === null &&
        e.code === "KeyE"
      ) {
        e.preventDefault();
        resetGestureState();
        renderLive();
        onToolChangeRef.current("delete");
      } else if (matchesAccelerator(e, textAccelRef.current)) {
        e.preventDefault();
        resetGestureState();
        renderLive();
        onToolChangeRef.current(activeToolRef.current === "text" ? "freehand" : "text");
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Alt") {
        clearRevealTimer();
        applyInteractionEvent({
          type: "modifier-up",
          action: e.key === "Meta" ? "move" : "delete",
        });
        if (interaction.phase === "gesture") {
          live.style.cursor = interaction.action === "move" ? "grabbing" : "pointer";
        } else {
          refreshInteractionHover();
        }
        renderLive();
        return;
      }
    };

    const resetLostInteractionState = () => {
      resetGestureState();
      live.style.cursor = "default";
      renderLive();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") resetLostInteractionState();
    };

    if (activeToolRef.current === "delete") {
      applyInteractionEvent({ type: "latch-delete" });
    }
    setupBacking();
    window.addEventListener("resize", setupBacking);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", resetLostInteractionState);
    document.addEventListener("visibilitychange", onVisibilityChange);
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
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", resetLostInteractionState);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      live.removeEventListener("pointerdown", onPointerDown);
      live.removeEventListener("pointermove", onPointerMove);
      live.removeEventListener("pointerup", onPointerUp);
      live.removeEventListener("pointercancel", onPointerCancel);
      unlistenMode.then((f) => f());
      unlistenClear.then((f) => f());
      unlistenFinishText.then((f) => f());
      if (rafId) cancelAnimationFrame(rafId);
      clearRevealTimer();
      stopHold();
      const hadEditingRequest = wantsEditingRef.current;
      wantsEditingRef.current = false;
      sessionRequestRef.current += 1;
      if (hadEditingRequest) void setTextEditing(false);
      renderBaseRef.current = () => undefined;
      resetGestureRef.current = () => undefined;
      syncDeleteToolRef.current = () => undefined;
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
