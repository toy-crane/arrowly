import { CSSProperties, useEffect, useRef, useState } from "react";
import { TEXT_FONT_FAMILY } from "./strokes";

type Props = {
  x: number;
  y: number;
  color: string;
  size: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
};

/**
 * 텍스트 마크 입력기 — 캔버스 위에 뜨는 네이티브 <input>.
 * 캔버스에는 캐럿·IME 조합이 없으므로 입력 중에만 DOM을 쓰고, 확정 시
 * drawMark(fillText)와 같은 서체·크기·색으로 캔버스에 커밋된다.
 * blur·언마운트로는 커밋하지 않는다 — Esc(그리기 종료)는 폐기가 맞다.
 */
export function TextEditor({ x, y, color, size, onCommit, onCancel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);
  const [value, setValue] = useState("");
  const valueRef = useRef(value);
  valueRef.current = value;

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    const text = valueRef.current.trim();
    if (text) onCommit(text);
    else onCancel();
  };

  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };

  useEffect(() => {
    inputRef.current?.focus();
    // 바깥 클릭 = 확정. 캡처 단계라 캔버스 pointerdown보다 먼저 처리된다.
    // 단, 마커 캡슐 내부는 제외 — 캡처가 먼저 finish()로 모드를 끈 뒤 이어지는 마커 버튼
    // 클릭이 setTextMode(v => !v)로 되켜는 이중 반응을 막고, 편집 중 색·굵기 변경이
    // 초안을 살린 채 라이브로 적용되게 한다.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target === inputRef.current) return;
      if (target?.closest?.("[data-arrowly-marker]")) return;
      finish();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 입력 중 키는 오버레이 단축키로 새지 않는다 (2차 방어 — 1차는 캔버스 keydown의 editable 가드)
    e.stopPropagation();
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      finish();
    } else if (e.metaKey && !e.altKey && !e.ctrlKey && e.code === "KeyZ") {
      // 입력 중 ⌘Z = 입력만 취소하고 그리기 모드에 남는다 (확정)
      e.preventDefault();
      cancel();
    }
  };

  const style: CSSProperties = {
    position: "fixed",
    left: x,
    top: y,
    width: `${Math.max(2, value.length + 2)}ch`,
    margin: 0,
    padding: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    color,
    caretColor: color,
    font: `${size}px ${TEXT_FONT_FAMILY}`,
    lineHeight: 1,
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      style={style}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
