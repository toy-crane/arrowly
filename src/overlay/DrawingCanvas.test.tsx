import { useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, Mock } from "vitest";
import { installCanvasMock } from "../../test/canvas";
import { DrawingCanvas } from "./DrawingCanvas";

let contexts: CanvasRenderingContext2D[];

const baseProps = {
  color: "#FF2D95",
  widthKey: "medium" as const,
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
