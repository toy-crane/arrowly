import type { Point } from "../shared/drawing";
import type { RoleKeys } from "../shared/shortcuts";

export const DISCOVERY_REVEAL_DELAY_MS = 200;
export const MOVE_GESTURE_THRESHOLD_PX = 4;

export type MarkAction = "move" | "duplicate" | "delete";
type InteractionSource = "modifier" | "latched";

/**
 * 지금 눌려 있는 상호작용 수식키를 옮기기·복제 추가·지우기 역할로 본 스냅숏.
 * 키 이벤트마다 전체 스냅숏을 받는다. 같은 물리 키가 두 역할을 함께 가질 수 있다.
 */
export type ModifierKeys = RoleKeys;

const NO_KEYS: ModifierKeys = { move: false, extra: false, del: false };
/** 누른 순서와 무관하게 지금 눌린 키 조합이 탐색 동작을 정한다. */
const actionForKeys = (keys: ModifierKeys): MarkAction | null =>
  keys.move && keys.extra ? "duplicate" : keys.move ? "move" : keys.del ? "delete" : null;
const anyKeyHeld = (keys: ModifierKeys) => keys.move || keys.extra || keys.del;

/**
 * 키 조합이 바뀐 뒤의 탐색 상태. 복제를 하다 옮기기 키만 먼저 떼서 지우기 키만 남으면
 * 삭제 탐색으로 넘어가지 않고 모든 키를 뗄 때까지 멈춘다.
 */
const discoveryForKeys = (
  previous: MarkAction,
  keys: ModifierKeys,
  visible: boolean,
): MarkInteractionState => {
  const action = actionForKeys(keys);
  if (!action) return initialMarkInteraction;
  if (previous !== "delete" && action === "delete") {
    return { phase: "suppressed", action: previous, keys };
  }
  return { phase: "discovery", action, source: "modifier", visible, keys };
};

export type MarkInteractionState =
  | { phase: "idle" }
  | {
      phase: "discovery";
      action: MarkAction;
      source: InteractionSource;
      visible: boolean;
      keys: ModifierKeys;
    }
  | { phase: "suppressed"; action: MarkAction; keys: ModifierKeys }
  | {
      phase: "gesture";
      action: MarkAction;
      source: InteractionSource;
      pointerId: number;
      targetIndex: number | null;
      origin: Point;
      current: Point;
      moving: boolean;
      fieldVisible: boolean;
      keys: ModifierKeys;
    };

export const initialMarkInteraction: MarkInteractionState = { phase: "idle" };

export type MarkInteractionEvent =
  | { type: "modifiers"; keys: ModifierKeys }
  | { type: "shortcut-chord" }
  | { type: "reveal" }
  | { type: "latch-delete" }
  | { type: "unlatch-delete" }
  | {
      type: "pointer-down";
      pointerId: number;
      point: Point;
      targetIndex: number | null;
    }
  | {
      type: "pointer-move";
      pointerId: number;
      point: Point;
    }
  | {
      type: "pointer-up";
      pointerId: number;
      point: Point;
      targetIndex: number | null;
    }
  | { type: "pointer-cancel"; pointerId: number }
  | { type: "reset" };

export type MarkInteractionOutcome =
  | { kind: "move"; index: number; dx: number; dy: number }
  | { kind: "duplicate"; index: number; dx: number; dy: number }
  | { kind: "delete"; index: number };

export type MarkInteractionTransition = {
  state: MarkInteractionState;
  outcome?: MarkInteractionOutcome;
};

const distanceFromOrigin = (
  state: Extract<MarkInteractionState, { phase: "gesture" }>,
  point: Point,
) => Math.hypot(point.x - state.origin.x, point.y - state.origin.y);

const discoveryAfterGesture = (
  state: Extract<MarkInteractionState, { phase: "gesture" }>,
): MarkInteractionState => {
  if (state.source === "latched") {
    return {
      phase: "discovery",
      action: "delete",
      source: "latched",
      visible: true,
      keys: NO_KEYS,
    };
  }
  return discoveryForKeys(state.action, state.keys, state.fieldVisible);
};

export function transitionMarkInteraction(
  state: MarkInteractionState,
  event: MarkInteractionEvent,
): MarkInteractionTransition {
  if (event.type === "reset") return { state: initialMarkInteraction };

  if (event.type === "modifiers") {
    const { keys } = event;
    if (state.phase === "idle") {
      const action = actionForKeys(keys);
      if (!action) return { state };
      return {
        state: { phase: "discovery", action, source: "modifier", visible: false, keys },
      };
    }
    if (state.phase === "discovery" && state.source === "modifier") {
      return { state: discoveryForKeys(state.action, keys, state.visible) };
    }
    if (state.phase === "suppressed") {
      if (!anyKeyHeld(keys)) return { state: initialMarkInteraction };
      return { state: { ...state, keys } };
    }
    if (state.phase === "gesture" && state.source === "modifier") {
      // 끄는 도중 복제 추가 키를 바꾸면 이동과 복제가 오간다. 삭제 클릭은 그대로 둔다.
      const action = state.action === "delete" ? "delete" : keys.extra ? "duplicate" : "move";
      return { state: { ...state, action, keys } };
    }
    return { state };
  }

  if (event.type === "latch-delete") {
    return {
      state: {
        phase: "discovery",
        action: "delete",
        source: "latched",
        visible: true,
        keys: NO_KEYS,
      },
    };
  }

  if (event.type === "unlatch-delete") {
    if (
      (state.phase === "discovery" && state.source === "latched") ||
      (state.phase === "gesture" && state.source === "latched")
    ) {
      return { state: initialMarkInteraction };
    }
    return { state };
  }

  if (event.type === "shortcut-chord") {
    if (state.phase === "discovery" && state.source === "modifier") {
      return { state: { phase: "suppressed", action: state.action, keys: state.keys } };
    }
    return { state };
  }

  if (event.type === "reveal") {
    if (state.phase !== "discovery" || state.source !== "modifier" || state.visible) {
      return { state };
    }
    return { state: { ...state, visible: true } };
  }

  if (event.type === "pointer-down") {
    if (state.phase !== "discovery") return { state };
    return {
      state: {
        phase: "gesture",
        action: state.action,
        source: state.source,
        pointerId: event.pointerId,
        targetIndex: event.targetIndex,
        origin: event.point,
        current: event.point,
        moving: false,
        fieldVisible: state.visible,
        keys: state.keys,
      },
    };
  }

  if (event.type === "pointer-move") {
    if (state.phase !== "gesture" || state.pointerId !== event.pointerId) return { state };
    return {
      state: {
        ...state,
        current: event.point,
        moving:
          state.moving ||
          (state.action !== "delete" &&
            distanceFromOrigin(state, event.point) > MOVE_GESTURE_THRESHOLD_PX),
      },
    };
  }

  if (event.type === "pointer-cancel") {
    if (state.phase !== "gesture" || state.pointerId !== event.pointerId) return { state };
    return { state: discoveryAfterGesture(state) };
  }

  if (event.type === "pointer-up") {
    if (state.phase !== "gesture" || state.pointerId !== event.pointerId) return { state };
    const nextState = discoveryAfterGesture(state);
    if (
      state.action !== "delete" &&
      state.targetIndex !== null &&
      (state.moving ||
        distanceFromOrigin(state, event.point) > MOVE_GESTURE_THRESHOLD_PX)
    ) {
      return {
        state: nextState,
        outcome: {
          kind: state.action,
          index: state.targetIndex,
          dx: event.point.x - state.origin.x,
          dy: event.point.y - state.origin.y,
        },
      };
    }
    if (
      state.action === "delete" &&
      state.targetIndex !== null &&
      state.targetIndex === event.targetIndex
    ) {
      return {
        state: nextState,
        outcome: { kind: "delete", index: state.targetIndex },
      };
    }
    return { state: nextState };
  }

  return { state };
}
