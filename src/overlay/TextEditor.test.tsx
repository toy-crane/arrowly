import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installCanvasMock } from "../../test/canvas";
import { fontString } from "../shared/drawing";
import { TextEditor } from "./TextEditor";

function renderEditor(overrides: Partial<Parameters<typeof TextEditor>[0]> = {}) {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <TextEditor x={40} y={60} color="#FF2D95" size={29} onCommit={onCommit} onCancel={onCancel} {...overrides} />,
  );
  const input = screen.getByRole("textbox") as HTMLInputElement;
  return { ...utils, input, onCommit, onCancel };
}

describe("TextEditor", () => {
  let contexts: CanvasRenderingContext2D[];

  beforeEach(() => {
    contexts = installCanvasMock(); // 폭 측정(measureTextWidth)이 캔버스를 쓴다
  });

  it("mounts focused with the ink color and mark font", () => {
    const { input } = renderEditor();
    expect(input).toHaveFocus();
    expect(input.style.color).toBe("rgb(255, 45, 149)");
    expect(input.style.font).toContain("29px");
    expect(input.style.left).toBe("40px");
    expect(input.style.top).toBe("60px");
  });

  it("sizes the input from measured pixel width, not character count", () => {
    const { input } = renderEditor();
    fireEvent.change(input, { target: { value: "서버 캐시" } });

    const latest = contexts[contexts.length - 1];
    expect(latest.measureText).toHaveBeenCalledWith("서버 캐시");
    expect(latest.font).toBe(fontString(29));
    expect(input.style.width).toBe("18px"); // mock 측정 폭 10 + 여유 8
  });

  it("commits trimmed text on Enter and only once", () => {
    const { input, onCommit, onCancel } = renderEditor();
    fireEvent.change(input, { target: { value: "  리트라이 큐  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("리트라이 큐");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("ignores Enter while the IME is composing", () => {
    const { input, onCommit } = renderEditor();
    fireEvent.change(input, { target: { value: "안녕" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("안녕");
  });

  it("cancels on Cmd+Z without committing", () => {
    const { input, onCommit, onCancel } = renderEditor();
    fireEvent.change(input, { target: { value: "버려질 텍스트" } });
    fireEvent.keyDown(input, { code: "KeyZ", metaKey: true });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits on outside pointerdown but not on clicks inside the input", () => {
    const { input, onCommit } = renderEditor();
    fireEvent.change(input, { target: { value: "재시도" } });
    fireEvent.pointerDown(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("재시도");
  });

  it("cancels instead of committing an empty value", () => {
    const { input, onCommit, onCancel } = renderEditor();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("stops keydown propagation so overlay shortcuts never fire while typing", () => {
    const windowSpy = vi.fn();
    window.addEventListener("keydown", windowSpy);
    const { input } = renderEditor();
    fireEvent.keyDown(input, { code: "Backspace", altKey: true });
    fireEvent.keyDown(input, { code: "KeyT" });
    expect(windowSpy).not.toHaveBeenCalled();
    window.removeEventListener("keydown", windowSpy);
  });

  it("does not commit on unmount (Esc exit discards the draft)", () => {
    const { input, onCommit, onCancel, unmount } = renderEditor();
    fireEvent.change(input, { target: { value: "폐기됨" } });
    unmount();
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
