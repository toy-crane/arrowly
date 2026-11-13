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
      type: "modifiers",
      keys: { move: true, extra: false, del: false },
    }).state;
    expect(pending).toMatchObject({ phase: "discovery", action: "move", visible: false });

    const visible = transitionMarkInteraction(pending, { type: "reveal" }).state;
    expect(visible).toMatchObject({ phase: "discovery", action: "move", visible: true });

    const suppressed = transitionMarkInteraction(pending, { type: "shortcut-chord" }).state;
    expect(suppressed).toMatchObject({ phase: "suppressed", action: "move" });
    expect(transitionMarkInteraction(suppressed, { type: "reveal" }).state).toBe(suppressed);
    expect(
      transitionMarkInteraction(suppressed, { type: "modifiers", keys: { move: false, extra: false, del: false } }).state,
    ).toBe(initialMarkInteraction);
  });

  it("commits only a move beyond 4px and lets an active gesture outlive Command", () => {
    const pending = transitionMarkInteraction(initialMarkInteraction, {
      type: "modifiers",
      keys: { move: true, extra: false, del: false },
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
      type: "modifiers",
      keys: { move: false, extra: false, del: false },
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
      type: "modifiers",
      keys: { move: false, extra: true, del: true },
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
      type: "modifiers",
      keys: { move: false, extra: false, del: false },
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
      transitionMarkInteraction(latched, { type: "modifiers", keys: { move: true, extra: true, del: true } })
        .state,
    ).toBe(latched);
    expect(
      transitionMarkInteraction(completed.state, { type: "unlatch-delete" }).state,
    ).toBe(initialMarkInteraction);
  });

  it("enters duplicate discovery when Command and Option are held together in either order", () => {
    const keys = (meta: boolean, alt: boolean) => ({ type: "modifiers" as const, keys: { move: meta, extra: alt, del: alt } });
    const commandFirst = transitionMarkInteraction(
      transitionMarkInteraction(initialMarkInteraction, keys(true, false)).state,
      keys(true, true),
    ).state;
    expect(commandFirst).toMatchObject({ phase: "discovery", action: "duplicate" });

    const optionFirst = transitionMarkInteraction(
      transitionMarkInteraction(initialMarkInteraction, keys(false, true)).state,
      keys(true, true),
    ).state;
    expect(optionFirst).toMatchObject({ phase: "discovery", action: "duplicate" });

    expect(transitionMarkInteraction(commandFirst, keys(true, false)).state).toMatchObject({
      phase: "discovery",
      action: "move",
    });
  });

  it("pauses instead of revealing deletion when Command is released first from duplicate discovery", () => {
    const keys = (meta: boolean, alt: boolean) => ({ type: "modifiers" as const, keys: { move: meta, extra: alt, del: alt } });
    const duplicate = transitionMarkInteraction(initialMarkInteraction, keys(true, true)).state;
    const paused = transitionMarkInteraction(duplicate, keys(false, true)).state;
    expect(paused).toMatchObject({ phase: "suppressed" });
    expect(transitionMarkInteraction(paused, { type: "reveal" }).state).toBe(paused);
    expect(
      transitionMarkInteraction(paused, {
        type: "pointer-down",
        pointerId: 1,
        point: { x: 1, y: 1 },
        targetIndex: 0,
      }).state,
    ).toBe(paused);

    const released = transitionMarkInteraction(paused, keys(false, false)).state;
    expect(released).toBe(initialMarkInteraction);
    expect(transitionMarkInteraction(released, keys(false, true)).state).toMatchObject({
      phase: "discovery",
      action: "delete",
    });
  });

  it("commits a duplicate only after a drag and decides move or duplicate by Option at release", () => {
    const keys = (meta: boolean, alt: boolean) => ({ type: "modifiers" as const, keys: { move: meta, extra: alt, del: alt } });
    const duplicate = transitionMarkInteraction(initialMarkInteraction, keys(true, true)).state;
    const pressed = transitionMarkInteraction(duplicate, {
      type: "pointer-down",
      pointerId: 1,
      point: { x: 10, y: 10 },
      targetIndex: 0,
    }).state;
    const release = (state: typeof pressed, x: number, y: number) =>
      transitionMarkInteraction(state, {
        type: "pointer-up",
        pointerId: 1,
        point: { x, y },
        targetIndex: null,
      });

    expect(release(pressed, 12, 10).outcome).toBeUndefined();

    const dragging = transitionMarkInteraction(pressed, {
      type: "pointer-move",
      pointerId: 1,
      point: { x: 40, y: 30 },
    }).state;
    expect(dragging).toMatchObject({ phase: "gesture", action: "duplicate", moving: true });
    const duplicated = release(dragging, 50, 40);
    expect(duplicated.outcome).toEqual({ kind: "duplicate", index: 0, dx: 40, dy: 30 });
    expect(duplicated.state).toMatchObject({ phase: "discovery", action: "duplicate" });

    const optionReleased = transitionMarkInteraction(dragging, keys(true, false)).state;
    expect(optionReleased).toMatchObject({ phase: "gesture", action: "move" });
    expect(release(optionReleased, 50, 40).outcome).toEqual({ kind: "move", index: 0, dx: 40, dy: 30 });

    const optionAgain = transitionMarkInteraction(optionReleased, keys(true, true)).state;
    expect(release(optionAgain, 50, 40).outcome).toMatchObject({ kind: "duplicate" });

    const commandReleased = transitionMarkInteraction(dragging, keys(false, true)).state;
    const afterCommandRelease = release(commandReleased, 50, 40);
    expect(afterCommandRelease.outcome).toMatchObject({ kind: "duplicate" });
    expect(afterCommandRelease.state).toMatchObject({ phase: "suppressed" });
  });
  it("leaves discovery when the move key is released and only a duplicate add-on key that is not the delete key remains", () => {
    // 복제 ⌘⇧, 지우기 ⌥ 설정
    const keys = (move: boolean, extra: boolean, del = false) => ({
      type: "modifiers" as const,
      keys: { move, extra, del },
    });
    const duplicate = transitionMarkInteraction(initialMarkInteraction, keys(true, true)).state;
    expect(duplicate).toMatchObject({ phase: "discovery", action: "duplicate" });

    const released = transitionMarkInteraction(duplicate, keys(false, true)).state;
    expect(released).toBe(initialMarkInteraction);
    expect(transitionMarkInteraction(released, keys(false, true)).state).toBe(initialMarkInteraction);
    expect(transitionMarkInteraction(released, keys(false, false, true)).state).toMatchObject({
      phase: "discovery",
      action: "delete",
    });

    const pressed = transitionMarkInteraction(duplicate, {
      type: "pointer-down",
      pointerId: 1,
      point: { x: 0, y: 0 },
      targetIndex: 0,
    }).state;
    expect(transitionMarkInteraction(pressed, keys(true, false)).state).toMatchObject({
      phase: "gesture",
      action: "move",
    });
  });
});
