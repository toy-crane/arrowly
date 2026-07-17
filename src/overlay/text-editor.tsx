import { CSSProperties, useEffect, useLayoutEffect, useRef } from "react";
import { textSizePx, type TextSizeKey } from "../shared/constants";
import { fontString, layoutText, type Point } from "../shared/drawing";

/** 빈 입력에서도 캐럿이 보이는 최소 폭. */
const MIN_WIDTH_PX = 10;
/** 마지막 글자와 캐럿이 붙지 않게 하는 여유. */
const WIDTH_PADDING_PX = 8;

type Props = {
  sessionKey: number;
  x: number;
  y: number;
  color: string;
  sizeKey: TextSizeKey;
  value: string;
  initialCaret: number;
  onValueChange: (value: string) => void;
  onStepSize: (delta: -1 | 1) => void;
  onCommit: () => void;
  onCancel: () => void;
  onOutsidePointerDown: (point: Point) => void;
};

/**
 * 텍스트 마크 입력기 — 캔버스 위에 뜨는 controlled 네이티브 <textarea>.
 * 편집 세션과 확정 정책은 DrawingCanvas가 소유하고, 이 컴포넌트는 DOM 입력·IME·캐럿만 담당한다.
 */
export function TextEditor({
  sessionKey,
  x,
  y,
  color,
  sizeKey,
  value,
  initialCaret,
  onValueChange,
  onStepSize,
  onCommit,
  onCancel,
  onOutsidePointerDown,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef(false);
  const commitRef = useRef(onCommit);
  const outsideRef = useRef(onOutsidePointerDown);
  commitRef.current = onCommit;
  outsideRef.current = onOutsidePointerDown;

  useLayoutEffect(() => {
    doneRef.current = false;
    const input = inputRef.current;
    input?.focus();
    input?.setSelectionRange(initialCaret, initialCaret);
  }, [initialCaret, sessionKey]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target === inputRef.current || target?.closest?.("[data-arrowly-marker]")) return;
      if (doneRef.current) return;
      doneRef.current = true;
      outsideRef.current({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  const finish = (action: () => void) => {
    if (doneRef.current) return;
    doneRef.current = true;
    action();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      if (e.nativeEvent.isComposing || e.shiftKey) return;
      e.preventDefault();
      finish(() => commitRef.current());
      return;
    }
    if (e.metaKey && !e.altKey && !e.ctrlKey && e.code === "KeyZ") {
      e.preventDefault();
      finish(onCancel);
      return;
    }
    if (e.metaKey && !e.altKey && !e.ctrlKey && (e.code === "Equal" || e.code === "NumpadAdd")) {
      e.preventDefault();
      onStepSize(1);
      return;
    }
    if (e.metaKey && !e.altKey && !e.ctrlKey && (e.code === "Minus" || e.code === "NumpadSubtract")) {
      e.preventDefault();
      onStepSize(-1);
    }
  };

  const layout = layoutText(value, sizeKey);
  const style: CSSProperties = {
    position: "fixed",
    left: x,
    top: y,
    width: `${Math.max(MIN_WIDTH_PX, layout.width + WIDTH_PADDING_PX)}px`,
    height: `${layout.height}px`,
    margin: 0,
    padding: 0,
    border: "none",
    outlineWidth: 1.5,
    outlineStyle: "dashed",
    outlineColor: "rgba(232,234,240,0.98)",
    outlineOffset: 6,
    borderRadius: 1,
    background: "transparent",
    boxSizing: "border-box",
    color,
    caretColor: color,
    font: fontString(sizeKey),
    lineHeight: `${layout.lineHeight}px`,
    overflow: "hidden",
    resize: "none",
    whiteSpace: "pre",
  };

  return (
    <textarea
      ref={inputRef}
      value={value}
      style={style}
      wrap="off"
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      aria-label="Text editor"
      data-text-line-count={layout.lines.length}
      data-text-size-px={textSizePx(sizeKey)}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
