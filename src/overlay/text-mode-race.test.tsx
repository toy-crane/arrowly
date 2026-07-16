import { useState } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installCanvasMock } from "../../test/canvas";
import { DrawingCanvas } from "./drawing-canvas";
import { Marker } from "./marker";

const settings = vi.hoisted(() => ({
  loadMarkerPos: vi.fn(),
  saveMarkerPos: vi.fn(),
}));

vi.mock("../shared/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/settings")>();
  return { ...actual, loadMarkerPos: settings.loadMarkerPos, saveMarkerPos: settings.saveMarkerPos };
});

let contexts: CanvasRenderingContext2D[];

/** OverlayApp과 동일한 배선으로 실물 DrawingCanvas + Marker를 함께 렌더링한다 —
 * TextEditor의 캡처 리스너와 마커 클릭 사이의 레이스는 교차 컴포넌트라 단독 테스트로는 못 잡는다. */
function Harness() {
  const [textMode, setTextMode] = useState(false);
  return (
    <>
      <DrawingCanvas
        color="#FF2D95"
        widthKey="medium"
        textSizeKey="medium"
        clearAccel="Alt+Backspace"
        textAccel="KeyT"
        textMode={textMode}
        onTextModeChange={setTextMode}
      />
      <Marker
        color="#FF2D95"
        widthKey="medium"
        textSizeKey="medium"
        board={false}
        textMode={textMode}
        onColorChange={() => {}}
        onWidthChange={() => {}}
        onTextSizeChange={() => {}}
        onBoardToggle={() => {}}
        onTextToggle={() => setTextMode((v) => !v)}
      />
    </>
  );
}

function openEditorWithDraft(container: HTMLElement) {
  fireEvent.keyDown(window, { code: "KeyT" });
  const live = container.querySelectorAll("canvas")[1];
  fireEvent.pointerDown(live, { button: 0, clientX: 120, clientY: 90, pointerId: 1 });
  const input = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "초안" } });
  return input;
}

describe("text mode and marker interplay", () => {
  beforeEach(() => {
    contexts = installCanvasMock();
    mockIPC(() => undefined, { shouldMockEvents: true });
    settings.loadMarkerPos.mockReset().mockResolvedValue(null);
    settings.saveMarkerPos.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(1);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
  });

  it("clicking the marker's T button while editing turns text mode off instead of re-arming it", () => {
    const { container } = render(<Harness />);
    const [baseCtx] = contexts;
    openEditorWithDraft(container);

    const tButton = screen.getByRole("button", { name: "Type text" });
    // 실제 클릭의 이벤트 순서를 재현: pointerdown(캡처 리스너 대상) → click(토글 핸들러)
    fireEvent.pointerDown(tButton, { button: 0, pointerId: 2 });
    fireEvent.click(tButton);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(tButton.parentElement!.style.background).toBe(""); // modeOn(16%)이 아님 — 재점화되지 않았다
    expect(baseCtx.fillText).not.toHaveBeenCalled(); // 초안은 커밋이 아니라 폐기된다
  });

  it("clicking another marker cell while editing keeps the draft open", async () => {
    const { container } = render(<Harness />);
    openEditorWithDraft(container);

    const colorButton = screen.getByRole("button", { name: "Change color" });
    fireEvent.pointerDown(colorButton, { button: 0, pointerId: 2 });
    fireEvent.click(colorButton);

    // 팝오버는 열리고, 초안은 확정되지 않은 채 살아 있다 — 색 변경이 초안에 라이브 적용된다
    expect(await screen.findByRole("button", { name: "Color #FFD400" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("초안");
  });
});
