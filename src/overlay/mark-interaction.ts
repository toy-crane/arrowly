import type { Point } from "../shared/drawing";

export const DISCOVERY_REVEAL_DELAY_MS = 200;
export const MOVE_GESTURE_THRESHOLD_PX = 4;

export type MarkAction = "move" | "delete";
type InteractionSource = "modifier" | "latched";

export type MarkInteractionState =
  | { phase: "idle" }
  | {
      phase: "discovery";
      action: MarkAction;
      source: InteractionSource;
      visible: boolean;
      modifierHeld: boolean;
    }
  | { phase: "suppressed"; action: MarkAction }
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
      modifierHeld: boolean;
    };

export const initialMarkInteraction: MarkInteractionState = { phase: "idle" };

export type MarkInteractionEvent =
  | { type: "modifier-down"; action: MarkAction }
  | { type: "modifier-up"; action: MarkAction }
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
      modifierHeld: false,
    };
  }
  if (!state.modifierHeld) return initialMarkInteraction;
  return {
    phase: "discovery",
    action: state.action,
    source: "modifier",
    visible: state.fieldVisible,
    modifierHeld: true,
  };
};

export function transitionMarkInteraction(
  state: MarkInteractionState,
  event: MarkInteractionEvent,
): MarkInteractionTransition {
  if (event.type === "reset") return { state: initialMarkInteraction };

  if (event.type === "modifier-down") {
    if (state.phase !== "idle") return { state };
    return {
      state: {
        phase: "discovery",
        action: event.action,
        source: "modifier",
        visible: false,
        modifierHeld: true,
      },
    };
  }

  if (event.type === "modifier-up") {
    if (
      ((state.phase === "discovery" && state.source === "modifier") ||
        state.phase === "suppressed") &&
      state.action === event.action
    ) {
      return { state: initialMarkInteraction };
    }
    if (
      state.phase === "gesture" &&
      state.source === "modifier" &&
      state.action === event.action
    ) {
      return { state: { ...state, modifierHeld: false } };
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
        modifierHeld: false,
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
      return { state: { phase: "suppressed", action: state.action } };
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
        modifierHeld: state.modifierHeld,
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
          (state.action === "move" &&
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
      state.action === "move" &&
      state.targetIndex !== null &&
      (state.moving ||
        distanceFromOrigin(state, event.point) > MOVE_GESTURE_THRESHOLD_PX)
    ) {
      return {
        state: nextState,
        outcome: {
          kind: "move",
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
