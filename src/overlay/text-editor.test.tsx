import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installCanvasMock } from "../../test/canvas";
import { stepTextSize, type TextSizeKey } from "../shared/constants";
import { fontString } from "../shared/drawing";
import { TextEditor } from "./text-editor";

type EditorProps = Parameters<typeof TextEditor>[0];

function renderEditor(overrides: Partial<EditorProps> = {}) {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const onOutsidePointerDown = vi.fn();
  const onStepSize = vi.fn();
  const onValueChange = vi.fn();

  function Harness() {
    const [value, setValue] = useState(overrides.value ?? "");
    const [sizeKey, setSizeKey] = useState<TextSizeKey>(overrides.sizeKey ?? "medium");
    return (
      <TextEditor
        sessionKey={1}
        x={40}
        y={60}
        color="#FF2D95"
        sizeKey={sizeKey}
        value={value}
        initialCaret={0}
        onValueChange={(next) => {
          onValueChange(next);
          setValue(next);
        }}
        onStepSize={(delta) => {
          onStepSize(delta);
          setSizeKey((current) => stepTextSize(current, delta));
        }}
        onCommit={onCommit}
        onCancel={onCancel}
        onOutsidePointerDown={onOutsidePointerDown}
        {...overrides}
      />
    );
  }

  const utils = render(<Harness />);
  const input = screen.getByRole("textbox") as HTMLTextAreaElement;
  return {
    ...utils,
    input,
    onCommit,
    onCancel,
    onOutsidePointerDown,
    onStepSize,
    onValueChange,
  };
}

describe("TextEditor", () => {
  let contexts: CanvasRenderingContext2D[];

  beforeEach(() => {
    contexts = installCanvasMock();
  });

  it("mounts focused at the requested caret with the ink font and local edit outline", () => {
    const { input } = renderEditor({ value: "재시도", initialCaret: 2 });
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(2);
    expect(input.style.color).toBe("rgb(255, 45, 149)");
    expect(input.style.font).toContain("30px");
    expect(input.style.left).toBe("40px");
    expect(input.style.top).toBe("60px");
    expect(input.style.outlineStyle).toBe("dashed");
    expect(input.style.outlineOffset).toBe("6px");
  });

  it("sizes the controlled textarea from the longest row and line count", () => {
    const { input } = renderEditor();
    fireEvent.change(input, { target: { value: "서버 캐시\n\n끝\n" } });

    const latest = contexts[contexts.length - 1];
    expect(latest.measureText).toHaveBeenCalledWith(" ");
    expect(latest.font).toBe(fontString("medium"));
    expect(input.style.width).toBe("18px");
    expect(input.style.height).toBe("144px");
    expect(input.style.lineHeight).toBe("36px");
    expect(input).toHaveAttribute("data-text-line-count", "4");
    expect(input).toHaveAttribute("wrap", "off");
  });

  it("commits on Enter, inserts with Shift+Enter and ignores Enter during IME composition", () => {
    const { input, onCommit } = renderEditor();
    fireEvent.change(input, { target: { value: "안녕" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "안녕\n두 번째 줄" } });
    expect(input.value).toBe("안녕\n두 번째 줄");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("cancels the whole session on Cmd+Z and absorbs Shift+Cmd+Z", () => {
    const { input, onCommit, onCancel } = renderEditor();
    fireEvent.change(input, { target: { value: "버려질 텍스트" } });
    fireEvent.keyDown(input, { code: "KeyZ", metaKey: true, shiftKey: true });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("steps fixed text sizes with Cmd plus/equal and Cmd minus", () => {
    const { input, onStepSize } = renderEditor();
    fireEvent.keyDown(input, { code: "Equal", metaKey: true, shiftKey: true });
    expect(onStepSize).toHaveBeenLastCalledWith(1);
    expect(input.style.font).toContain("40px");

    fireEvent.keyDown(input, { code: "Minus", metaKey: true });
    expect(onStepSize).toHaveBeenLastCalledWith(-1);
    expect(input.style.font).toContain("30px");
  });

  it("reports outside pointerdown but ignores the input and marker", () => {
    const { input, onOutsidePointerDown } = renderEditor();
    fireEvent.pointerDown(input, { clientX: 1, clientY: 2 });
    expect(onOutsidePointerDown).not.toHaveBeenCalled();

    const marker = document.createElement("button");
    marker.setAttribute("data-arrowly-marker", "");
    document.body.appendChild(marker);
    fireEvent.pointerDown(marker, { clientX: 3, clientY: 4 });
    expect(onOutsidePointerDown).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body, { clientX: 12, clientY: 34 });
    expect(onOutsidePointerDown).toHaveBeenCalledWith({ x: 12, y: 34 });
    marker.remove();
  });

  it("stops keydown propagation and does not finish merely by unmounting", () => {
    const windowSpy = vi.fn();
    window.addEventListener("keydown", windowSpy);
    const { input, onCommit, onCancel, unmount } = renderEditor();
    fireEvent.keyDown(input, { code: "Backspace", altKey: true });
    expect(windowSpy).not.toHaveBeenCalled();
    unmount();
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    window.removeEventListener("keydown", windowSpy);
  });
});
