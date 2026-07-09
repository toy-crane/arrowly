import { CSSProperties, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { acceleratorSymbols, buildAccelerator } from "./accelerator";
import { DEFAULT_SHORTCUTS, loadShortcuts, saveShortcuts, Shortcuts } from "./settings";

type FieldId = keyof Shortcuts;

const ROWS: { id: FieldId; label: string }[] = [
  { id: "toggle", label: "그리기 토글" },
  { id: "clear", label: "전체 지우기" },
];

// 전체 지우기가 실행 취소(⌘Z/⇧⌘Z)를 덮으면 안 된다
const UNDO_ACCELS = new Set(["Cmd+KeyZ", "Shift+Cmd+KeyZ", "Cmd+Shift+KeyZ"]);

/** 단축키 레코더 2행(그리기 토글·전체 지우기). 설정 창과 온보딩에서 공용. */
export function ShortcutEditor() {
  const [shortcuts, setShortcuts] = useState<Shortcuts>(DEFAULT_SHORTCUTS);
  const [recording, setRecording] = useState<FieldId | null>(null);
  const [error, setError] = useState<{ id: FieldId; msg: string } | null>(null);
  const recordingRef = useRef<FieldId | null>(null);
  recordingRef.current = recording;
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    loadShortcuts().then(setShortcuts);
  }, []);

  const stopRecording = async (opts?: { keepSuspended?: boolean }) => {
    setRecording(null);
    if (!opts?.keepSuspended) await invoke("resume_toggle");
  };

  const startRecording = async (id: FieldId) => {
    if (recording === id) {
      await stopRecording();
      return;
    }
    setError(null);
    setRecording(id);
    await invoke("suspend_toggle"); // 등록된 토글이 있으면 OS가 키를 가로채므로 잠시 해제
  };

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      const id = recordingRef.current;
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.code === "Escape") {
        await stopRecording(); // Esc = 취소 (예약 키라 할당 불가)
        return;
      }
      const accel = buildAccelerator(e);
      if (!accel) return; // 수식어만 눌린 상태 — 계속 대기

      if (id === "clear" && UNDO_ACCELS.has(accel)) {
        setError({ id, msg: "실행 취소에 쓰이는 키예요" });
        await stopRecording();
        return;
      }

      const next: Shortcuts = { ...shortcutsRef.current, [id]: accel };

      try {
        if (id === "toggle") {
          await invoke("try_register_shortcut", { accelerator: accel });
        }
        await invoke("apply_shortcuts", { toggle: next.toggle, clear: next.clear });
      } catch (err) {
        setError({ id, msg: String(err) });
        await stopRecording();
        return;
      }

      await saveShortcuts(next);
      setShortcuts(next);
      setError(null);
      await stopRecording({ keepSuspended: true }); // apply_shortcuts가 이미 재등록함
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const resetOne = async (id: FieldId) => {
    const next: Shortcuts = { ...shortcuts, [id]: DEFAULT_SHORTCUTS[id] };
    try {
      await invoke("apply_shortcuts", { toggle: next.toggle, clear: next.clear });
    } catch (err) {
      setError({ id, msg: String(err) });
      return;
    }
    await saveShortcuts(next);
    setShortcuts(next);
    setError(null);
  };

  return (
    <>
      {ROWS.map(({ id, label }, i) => (
        <div key={id} style={{ ...styles.row, borderTop: i === 0 ? "none" : "0.5px solid var(--line)" }}>
          <div style={styles.rowMain}>
            <span style={styles.lbl}>{label}</span>
            <button
              style={{ ...styles.field, ...(recording === id ? styles.fieldRecording : undefined) }}
              onClick={() => startRecording(id)}
            >
              {recording === id ? (
                <span style={styles.hint}>새 단축키를 누르세요…</span>
              ) : (
                acceleratorSymbols(shortcuts[id]).map((s, j) => (
                  <span key={j} style={styles.kbd}>
                    {s}
                  </span>
                ))
              )}
            </button>
            <button style={styles.reset} onClick={() => resetOne(id)}>
              기본값
            </button>
          </div>
          {error?.id === id && <p style={styles.errText}>{error.msg}</p>}
        </div>
      ))}
    </>
  );
}

export const styles: Record<string, CSSProperties> = {
  row: { padding: "12px 14px" },
  rowMain: { display: "flex", alignItems: "center", gap: 10 },
  lbl: { width: 84, flexShrink: 0 },
  field: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 4,
    minHeight: 32,
    padding: "0 8px",
    border: "0.5px solid var(--line-strong)",
    borderRadius: 7,
    background: "var(--field)",
    cursor: "pointer",
    color: "inherit",
  },
  fieldRecording: {
    borderColor: "#3b82f6",
    boxShadow: "0 0 0 2px rgba(59,130,246,0.25)",
  },
  kbd: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 22,
    height: 24,
    padding: "0 5px",
    border: "0.5px solid var(--line-strong)",
    borderRadius: 5,
    background: "var(--kbd)",
    fontSize: 13,
    fontWeight: 500,
  },
  hint: { color: "var(--muted)", fontSize: 13 },
  reset: {
    flexShrink: 0,
    fontSize: 12,
    padding: "5px 10px",
    border: "0.5px solid var(--line-strong)",
    borderRadius: 6,
    background: "var(--field)",
    color: "inherit",
    cursor: "pointer",
  },
  errText: { margin: "6px 0 0 94px", fontSize: 12, color: "#e2504a" },
};
