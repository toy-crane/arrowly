import { describe, expect, it } from "vitest";
import {
  DISCOVERY_REVEAL_DELAY_MS,
  initialMarkInteraction,
  transitionMarkInteraction,
} from "./mark-interaction";

describe("mark interaction policy", () => {
  it("reveals a modifier discovery field only after the delay and suppresses shortcut chords", () => {
    expect(DISCOVERY_REVEAL_DELAY_MS).toBe(200);

    const pending = transitionMarkInteraction(initialMarkInteraction, {
      type: "modifier-down",
      action: "move",
    }).state;
    expect(pending).toMatchObject({ phase: "discovery", action: "move", visible: false });

    const visible = transitionMarkInteraction(pending, { type: "reveal" }).state;
    expect(visible).toMatchObject({ phase: "discovery", action: "move", visible: true });

    const suppressed = transitionMarkInteraction(pending, { type: "shortcut-chord" }).state;
    expect(suppressed).toMatchObject({ phase: "suppressed", action: "move" });
    expect(transitionMarkInteraction(suppressed, { type: "reveal" }).state).toBe(suppressed);
    expect(
      transitionMarkInteraction(suppressed, { type: "modifier-up", action: "move" }).state,
    ).toBe(initialMarkInteraction);
  });

  it("commits only a move beyond 4px and lets an active gesture outlive Command", () => {
    const pending = transitionMarkInteraction(initialMarkInteraction, {
      type: "modifier-down",
      action: "move",
    }).state;
    const pressed = transitionMarkInteraction(pending, {
      type: "pointer-down",
      pointerId: 1,
      point: { x: 10, y: 20 },
      targetIndex: 2,
    }).state;
    const belowThreshold = transitionMarkInteraction(pressed, {
      type: "pointer-move",
      pointerId: 1,
      point: { x: 14, y: 20 },
    }).state;
    expect(belowThreshold).toMatchObject({ phase: "gesture", moving: false });
    expect(
      transitionMarkInteraction(belowThreshold, {
        type: "pointer-up",
        pointerId: 1,
        point: { x: 14, y: 20 },
        targetIndex: 2,
      }).outcome,
    ).toBeUndefined();

    const moving = transitionMarkInteraction(pressed, {
      type: "pointer-move",
      pointerId: 1,
      point: { x: 15, y: 20 },
    }).state;
    const releasedCommand = transitionMarkInteraction(moving, {
      type: "modifier-up",
      action: "move",
    }).state;
    const completed = transitionMarkInteraction(releasedCommand, {
      type: "pointer-up",
      pointerId: 1,
      point: { x: 25, y: 35 },
      targetIndex: 2,
    });
    expect(completed.outcome).toEqual({ kind: "move", index: 2, dx: 15, dy: 15 });
    expect(completed.state).toBe(initialMarkInteraction);
  });

  it("deletes only when Option pointer-up is on the pressed target", () => {
    const pending = transitionMarkInteraction(initialMarkInteraction, {
      type: "modifier-down",
      action: "delete",
    }).state;
    const pressed = transitionMarkInteraction(pending, {
      type: "pointer-down",
      pointerId: 3,
      point: { x: 40, y: 50 },
      targetIndex: 4,
    }).state;

    expect(
      transitionMarkInteraction(pressed, {
        type: "pointer-up",
        pointerId: 3,
        point: { x: 80, y: 90 },
        targetIndex: 5,
      }).outcome,
    ).toBeUndefined();

    const releasedOption = transitionMarkInteraction(pressed, {
      type: "modifier-up",
      action: "delete",
    }).state;
    const completed = transitionMarkInteraction(releasedOption, {
      type: "pointer-up",
      pointerId: 3,
      point: { x: 40, y: 50 },
      targetIndex: 4,
    });
    expect(completed.outcome).toEqual({ kind: "delete", index: 4 });
    expect(completed.state).toBe(initialMarkInteraction);

    const cancelled = transitionMarkInteraction(pressed, {
      type: "pointer-cancel",
      pointerId: 3,
    });
    expect(cancelled.outcome).toBeUndefined();
    expect(cancelled.state).toMatchObject({
      phase: "discovery",
      action: "delete",
      visible: false,
    });
  });

  it("keeps latched deletion visible across clicks until explicitly unlatched", () => {
    const latched = transitionMarkInteraction(initialMarkInteraction, {
      type: "latch-delete",
    }).state;
    expect(latched).toMatchObject({
      phase: "discovery",
      action: "delete",
      source: "latched",
      visible: true,
    });

    const pressed = transitionMarkInteraction(latched, {
      type: "pointer-down",
      pointerId: 8,
      point: { x: 12, y: 14 },
      targetIndex: 1,
    }).state;
    const completed = transitionMarkInteraction(pressed, {
      type: "pointer-up",
      pointerId: 8,
      point: { x: 12, y: 14 },
      targetIndex: 1,
    });
    expect(completed.outcome).toEqual({ kind: "delete", index: 1 });
    expect(completed.state).toEqual(latched);
    expect(
      transitionMarkInteraction(completed.state, { type: "unlatch-delete" }).state,
    ).toBe(initialMarkInteraction);
  });
});
