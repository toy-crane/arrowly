import { useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, Mock } from "vitest";
import { installCanvasMock } from "../../test/canvas";
import { DrawingCanvas } from "./drawing-canvas";

let contexts: CanvasRenderingContext2D[];

const baseProps = {
  color: "#FF2D95",
  widthKey: "medium" as const,
  textSizeKey: "medium" as const,
  clearAccel: "Alt+Backspace",
  textAccel: "KeyT",
};

/** 부모(OverlayApp)의 textMode 소유를 흉내 내는 하네스. */
function Harness({ initialTextMode = false, onChange = vi.fn() as Mock }) {
  const [textMode, setTextMode] = useState(initialTextMode);
  return (
    <>
      <button data-testid="force-off" onClick={() => setTextMode(false)} />
      <DrawingCanvas
        {...baseProps}
        textMode={textMode}
        onTextModeChange={(on) => {
          onChange(on);
          setTextMode(on);
        }}
      />
    </>
  );
}

describe("DrawingCanvas", () => {
  beforeEach(() => {
    contexts = installCanvasMock();
    mockIPC(() => undefined, { shouldMockEvents: true });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(1);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
  });

  it("draws pointer input, batches coalesced points and handles correction shortcuts", () => {
    const { container, unmount } = render(
      <DrawingCanvas {...baseProps} textMode={false} onTextModeChange={vi.fn()} />,
    );
    const [base, live] = Array.from(container.querySelectorAll("canvas"));
    expect(base.width).toBe(1600);
    expect(live.height).toBe(1200);

    fireEvent.pointerMove(live, { clientX: 1, clientY: 1 });
    fireEvent.pointerUp(live, { clientX: 1, clientY: 1 });
    fireEvent.pointerDown(live, { button: 1, clientX: 1, clientY: 1, pointerId: 1 });

    fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 20, pointerId: 2 });
    const move = new Event("pointermove") as PointerEvent;
    Object.defineProperties(move, {
      clientX: { value: 20 },
      clientY: { value: 30 },
      pointerId: { value: 2 }, // 포인터 격리 가드를 통과해야 coalesced 경로가 실행된다
      getCoalescedEvents: {
        value: () => [
          { clientX: 15, clientY: 25 },
          { clientX: 20, clientY: 30 },
        ],
      },
    });
    live.dispatchEvent(move);
    fireEvent.pointerUp(live, { clientX: 25, clientY: 35, pointerId: 2 });

    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { code: "Backspace", altKey: true });
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true, altKey: true });

    fireEvent.pointerDown(live, { button: 0, clientX: 5, clientY: 5, pointerId: 3 });
    fireEvent.pointerCancel(live, { pointerId: 3 });
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("responds to resize and mocked Tauri mode/clear events without deleting hidden strokes", async () => {
    const { container } = render(
      <DrawingCanvas
        {...baseProps}
        color="#00AEEF"
        widthKey="thin"
        clearAccel="Control+KeyK"
        textMode={false}
        onTextModeChange={vi.fn()}
      />,
    );
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 3, clientY: 4, pointerId: 1 });
    fireEvent.pointerMove(live, { clientX: 5, clientY: 6, pointerId: 1 });

    await act(async () => {
      await emit("mode-changed", { drawing: false });
      await emit("mode-changed", { drawing: true });
      await emit("clear-all");
    });

    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 0 });
    fireEvent(window, new Event("resize"));
    expect(live.width).toBe(800);
    fireEvent.keyDown(window, { code: "KeyK", ctrlKey: true });
  });

  it("arms and disarms text mode with the text key", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(window, { code: "KeyT" });
    expect(onChange).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(window, { code: "KeyT" });
    expect(onChange).toHaveBeenLastCalledWith(false);
    // 수식키가 붙으면 텍스트 키가 아니다
    fireEvent.keyDown(window, { code: "KeyT", metaKey: true });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("places the editor on click in text mode instead of drawing, then commits one text mark", () => {
    const onChange = vi.fn();
    const { container } = render(<Harness initialTextMode onChange={onChange} />);
    const [baseCtx, liveCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];

    fireEvent.pointerDown(live, { button: 0, clientX: 120, clientY: 90, pointerId: 1 });
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(liveCtx.stroke).not.toHaveBeenCalled(); // 텍스트 모드 클릭은 획을 시작하지 않는다

    fireEvent.change(input, { target: { value: "서버 캐시" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(baseCtx.fillText).toHaveBeenCalledOnce();
    expect(baseCtx.fillText).toHaveBeenCalledWith("서버 캐시", 120, 90);
    expect(onChange).toHaveBeenLastCalledWith(false); // one-shot 펜 복귀
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    // 확정된 텍스트 마크는 ⌘Z 한 번에 통째로 사라진다 (renderBase에 fillText 재호출 없음)
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
    expect(baseCtx.fillText).toHaveBeenCalledOnce();
  });

  it("discards an open TextEditor draft when Clear All arrives via the Tauri event", async () => {
    const { container } = render(<Harness initialTextMode />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "폐기될 초안" } });

    // 트레이 메뉴 경로 — DOM keydown을 거치지 않으므로 editable 가드가 못 막는다
    await act(async () => {
      await emit("clear-all");
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(baseCtx.fillText).not.toHaveBeenCalled();
  });

  it("cancels an in-progress stroke when the text key is pressed mid-drag", () => {
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(live, { clientX: 60, clientY: 60, pointerId: 1 });

    fireEvent.keyDown(window, { code: "KeyT" }); // 그리던 획을 끊고 텍스트 모드로
    expect(onChange).toHaveBeenLastCalledWith(true);

    fireEvent.pointerUp(live, { clientX: 80, clientY: 80, pointerId: 1 });
    expect(baseCtx.stroke).not.toHaveBeenCalled(); // 끊긴 획은 커밋되지 않는다
  });

  it("isolates concurrent pointers so a second pointer cannot hijack the gesture", () => {
    const { container } = render(<Harness />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerDown(live, { button: 0, clientX: 500, clientY: 500, pointerId: 2 }); // 무시
    fireEvent.pointerMove(live, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(live, { clientX: 999, clientY: 999, pointerId: 2 }); // 무시
    fireEvent.pointerUp(live, { clientX: 999, clientY: 999, pointerId: 2 }); // 무시 — 조기 커밋 없음
    expect(baseCtx.stroke).not.toHaveBeenCalled();

    fireEvent.pointerUp(live, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(baseCtx.stroke).toHaveBeenCalledTimes(1);
    expect(baseCtx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(baseCtx.lineTo).not.toHaveBeenCalledWith(500, 500);
    expect(baseCtx.lineTo).not.toHaveBeenCalledWith(999, 999);
  });

  it("absorbs window shortcuts while an editable element is focused", () => {
    const { container } = render(<Harness initialTextMode />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    const editor = screen.getByRole("textbox");

    // TextEditor 밖의 편집 요소에서도 가드가 동작해야 한다 (1차 방어 자체 검증)
    const stray = document.createElement("input");
    document.body.appendChild(stray);
    try {
      const clears = (baseCtx.clearRect as Mock).mock.calls.length;
      fireEvent.keyDown(stray, { code: "Backspace", altKey: true });
      fireEvent.keyDown(stray, { code: "KeyZ", metaKey: true });
      fireEvent.keyDown(stray, { code: "KeyT" });
      expect((baseCtx.clearRect as Mock).mock.calls.length).toBe(clears);
      expect(editor).toBeInTheDocument();
    } finally {
      stray.remove();
    }
  });

  describe("double-click text entry", () => {
    beforeEach(() => {
      // 동기 rAF 스텁과 충돌하지 않게 필요한 프리미티브만 fake로 제한한다 (TESTING.md 컨벤션)
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("retracts the first click's dot and opens the editor", () => {
      const onChange = vi.fn();
      const { container } = render(<Harness onChange={onChange} />);
      const [baseCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];

      // 첫 클릭 = 점 커밋 (base에 증분 stroke 1회)
      fireEvent.pointerDown(live, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 50, clientY: 50, pointerId: 1 });
      expect(baseCtx.stroke).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      fireEvent.pointerDown(live, { button: 0, clientX: 52, clientY: 51, pointerId: 2 });
      fireEvent.pointerUp(live, { clientX: 52, clientY: 51, pointerId: 2 });

      expect(screen.getByRole("textbox")).toBeInTheDocument();
      expect(onChange).toHaveBeenLastCalledWith(true);
      // 점이 회수됐으므로 renderBase 재실행에서 stroke가 다시 그려지지 않는다
      expect(baseCtx.stroke).toHaveBeenCalledTimes(1);
    });

    it("does not mistake a click after undo for the second half of a double-click", () => {
      const { container } = render(<Harness />);
      const [baseCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];

      fireEvent.pointerDown(live, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 50, clientY: 50, pointerId: 1 });
      expect(baseCtx.stroke).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      fireEvent.keyDown(window, { code: "KeyZ", metaKey: true }); // undo가 더블클릭 추적을 무효화한다
      vi.advanceTimersByTime(100);
      fireEvent.pointerDown(live, { button: 0, clientX: 51, clientY: 51, pointerId: 2 });
      fireEvent.pointerUp(live, { clientX: 51, clientY: 51, pointerId: 2 });

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(baseCtx.stroke).toHaveBeenCalledTimes(2); // 독립된 새 점으로 커밋된다
    });

    it("keeps two separate dots when the second click is too late or too far", () => {
      const { container } = render(<Harness />);
      const [baseCtx] = contexts;
      const live = container.querySelectorAll("canvas")[1];

      fireEvent.pointerDown(live, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
      fireEvent.pointerUp(live, { clientX: 50, clientY: 50, pointerId: 1 });
      vi.advanceTimersByTime(400); // DBLCLICK_MS 초과
      fireEvent.pointerDown(live, { button: 0, clientX: 50, clientY: 50, pointerId: 2 });
      fireEvent.pointerUp(live, { clientX: 50, clientY: 50, pointerId: 2 });
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(baseCtx.stroke).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(100);
      fireEvent.pointerDown(live, { button: 0, clientX: 200, clientY: 200, pointerId: 3 }); // 거리 초과
      fireEvent.pointerUp(live, { clientX: 200, clientY: 200, pointerId: 3 });
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(baseCtx.stroke).toHaveBeenCalledTimes(3);
    });
  });

  describe("hold-to-snap", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
      // 반복 스케줄 검증에는 id=0 반환이 필요하다 — 동기 스텁이 1을 반환하면
      // rafId가 콜백 후에 1로 덮여 다음 scheduleLive가 조기 반환된다.
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        callback(1);
        return 0;
      });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function renderCanvas() {
      const { container } = render(
        <DrawingCanvas {...baseProps} textMode={false} onTextModeChange={vi.fn()} />,
      );
      return { live: container.querySelectorAll("canvas")[1], baseCtx: contexts[0], liveCtx: contexts[1] };
    }

    function traceSquare(live: Element, x: number, y: number, size: number, pointerId = 1) {
      fireEvent.pointerDown(live, { button: 0, clientX: x, clientY: y, pointerId });
      const perSide = 12;
      const sides: [number, number][] = [];
      for (let i = 1; i <= perSide; i++) sides.push([x + (size * i) / perSide, y]);
      for (let i = 1; i <= perSide; i++) sides.push([x + size, y + (size * i) / perSide]);
      for (let i = 1; i <= perSide; i++) sides.push([x + size - (size * i) / perSide, y + size]);
      for (let i = 1; i <= perSide; i++) sides.push([x, y + size - (size * i) / perSide]);
      for (const [px, py] of sides) fireEvent.pointerMove(live, { clientX: px, clientY: py, pointerId });
    }

    it("snaps a held closed stroke to a rectangle committed as one undoable mark", () => {
      const { live, baseCtx, liveCtx } = renderCanvas();
      traceSquare(live, 100, 100, 120);
      expect(liveCtx.rect).not.toHaveBeenCalled();

      vi.advanceTimersByTime(700); // HOLD_MS 도달 → 스냅 미리보기
      expect(liveCtx.rect).toHaveBeenCalled();
      expect(baseCtx.rect).not.toHaveBeenCalled();

      fireEvent.pointerUp(live, { clientX: 100, clientY: 100, pointerId: 1 });
      expect(baseCtx.rect).toHaveBeenCalledTimes(1); // 증분 커밋 1회

      // 스냅된 도형도 ⌘Z 한 번에 통째로 사라진다
      fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
      expect(baseCtx.rect).toHaveBeenCalledTimes(1); // renderBase 재실행에서 재호출 없음
    });

    it("shows the progress ring only after the delay", () => {
      const { live, liveCtx } = renderCanvas();
      fireEvent.pointerDown(live, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });

      vi.advanceTimersByTime(100); // RING_DELAY_MS 이전
      expect(liveCtx.arc).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200); // 링 표시 구간
      expect(liveCtx.arc).toHaveBeenCalled();
      fireEvent.pointerUp(live, { clientX: 50, clientY: 50, pointerId: 1 });
    });

    it("resets the hold when the pointer moves, committing freehand on release", () => {
      const { live, baseCtx } = renderCanvas();
      fireEvent.pointerDown(live, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
      vi.advanceTimersByTime(500);
      fireEvent.pointerMove(live, { clientX: 100, clientY: 100, pointerId: 1 }); // 홀드 리셋
      vi.advanceTimersByTime(300); // 리셋 이후 300ms — 스냅 안 됨
      fireEvent.pointerUp(live, { clientX: 120, clientY: 120, pointerId: 1 });

      expect(baseCtx.rect).not.toHaveBeenCalled();
      expect(baseCtx.ellipse).not.toHaveBeenCalled();
      expect(baseCtx.stroke).toHaveBeenCalledTimes(1); // 프리핸드 유지
    });

    it("never snaps strokes below the minimum size", () => {
      const { live, baseCtx } = renderCanvas();
      fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(live, { clientX: 18, clientY: 14, pointerId: 1 }); // 대각 < 24px
      vi.advanceTimersByTime(900);
      fireEvent.pointerUp(live, { clientX: 18, clientY: 14, pointerId: 1 });

      expect(baseCtx.rect).not.toHaveBeenCalled();
      expect(baseCtx.ellipse).not.toHaveBeenCalled();
      expect(baseCtx.stroke).toHaveBeenCalledTimes(1);
    });

    it("discards a pending snapped shape on Clear All instead of committing it on release", () => {
      const { live, baseCtx, liveCtx } = renderCanvas();
      traceSquare(live, 100, 100, 120);
      vi.advanceTimersByTime(700);
      expect(liveCtx.rect).toHaveBeenCalled(); // 스냅 미리보기 상태

      fireEvent.keyDown(window, { code: "Backspace", altKey: true }); // 전체 지우기
      fireEvent.pointerUp(live, { clientX: 100, clientY: 100, pointerId: 1 });
      expect(baseCtx.rect).not.toHaveBeenCalled(); // 지운 판에 도형이 커밋되지 않는다
    });

    it("clears pending snap state on mode-changed without committing", async () => {
      const { live, baseCtx, liveCtx } = renderCanvas();
      traceSquare(live, 100, 100, 120);
      vi.advanceTimersByTime(700);
      expect(liveCtx.rect).toHaveBeenCalled(); // 스냅 미리보기 상태

      await act(async () => {
        await emit("mode-changed", { drawing: false });
      });
      fireEvent.pointerUp(live, { clientX: 100, clientY: 100, pointerId: 1 });
      expect(baseCtx.rect).not.toHaveBeenCalled(); // 아무것도 커밋되지 않았다
    });
  });

  it("commits text at the size shown while typing even if the window resized mid-edit", () => {
    const { container } = render(<Harness initialTextMode />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "크기 고정" } });

    // 편집 중 해상도 변경 — 리렌더 없이 백킹만 재설정되므로 표시 크기는 그대로다
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1200 });
    fireEvent(window, new Event("resize"));

    fireEvent.keyDown(input, { key: "Enter" });
    expect(baseCtx.fillText).toHaveBeenCalledOnce();
    // 해상도와 무관한 medium 30px — 리사이즈 후에도 표시된 고정 크기로 커밋된다
    expect(String(baseCtx.font)).toContain("30px");
  });

  it("absorbs shortcuts via editingRef even when the event target is not an editable element", () => {
    const { container } = render(<Harness initialTextMode />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    screen.getByRole("textbox");

    const clears = (baseCtx.clearRect as Mock).mock.calls.length;
    // window를 타깃으로 발화 — isEditableTarget만으로는 못 거른다 (패널 포커스 유실 시나리오)
    fireEvent.keyDown(window, { code: "Backspace", altKey: true });
    fireEvent.keyDown(window, { code: "KeyZ", metaKey: true });
    expect((baseCtx.clearRect as Mock).mock.calls.length).toBe(clears);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("discards the editing session when text mode turns off without committing", () => {
    const { container } = render(<Harness initialTextMode />);
    const [baseCtx] = contexts;
    const live = container.querySelectorAll("canvas")[1];
    fireEvent.pointerDown(live, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "폐기될 초안" } });

    fireEvent.click(screen.getByTestId("force-off")); // Esc → mode-changed와 같은 경로 (부모가 끔)
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(baseCtx.fillText).not.toHaveBeenCalled();
  });
});
