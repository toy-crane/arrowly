import { CSSProperties, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { acceleratorSymbols, buildAccelerator } from "./accelerator";
import { shortcutErrorMessage, t } from "../i18n";
import { DEFAULT_SHORTCUTS, loadShortcuts, saveShortcuts, Shortcuts } from "../settings";

type FieldId = keyof Shortcuts;

const ROWS: { id: FieldId; label: string }[] = [
  { id: "toggle", label: t("shortcut.toggle") },
  { id: "board", label: t("shortcut.board") },
  { id: "clear", label: t("shortcut.clear") },
];

// 어느 동작도 실행 취소(⌘Z/⇧⌘Z)를 덮으면 안 된다.
const UNDO_ACCELS = new Set(["Cmd+KeyZ", "Shift+Cmd+KeyZ", "Cmd+Shift+KeyZ"]);

function localValidationError(id: FieldId, accel: string, shortcuts: Shortcuts): string | null {
  const parts = accel.split("+");
  const code = parts[parts.length - 1];
  if (code === "Escape") return t("shortcut.error.reservedEsc");
  if (parts.length < 2) return t("shortcut.error.modifierRequired");
  if (UNDO_ACCELS.has(accel)) return t("shortcut.error.undo");
  if (Object.entries(shortcuts).some(([other, value]) => other !== id && value === accel)) {
    return t("shortcut.error.duplicate");
  }
  return null;
}

/** 단축키 레코더 3행(그리기·블랙보드·전체 지우기). 설정 창과 온보딩에서 공용. */
export function ShortcutEditor({ showReset = true }: { showReset?: boolean }) {
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
    if (!opts?.keepSuspended) await invoke("resume_shortcuts");
  };

  const startRecording = async (id: FieldId) => {
    if (recording === id) {
      await stopRecording();
      return;
    }
    setError(null);
    setRecording(id);
    // 두 전역 키가 현재 조합을 웹뷰보다 먼저 가로채므로 레코딩 동안 함께 해제한다.
    await invoke("suspend_shortcuts");
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

      const validationError = localValidationError(id, accel, shortcutsRef.current);
      if (validationError) {
        setError({ id, msg: validationError });
        await stopRecording();
        return;
      }

      const next: Shortcuts = { ...shortcutsRef.current, [id]: accel };

      try {
        if (id === "toggle" || id === "board") {
          await invoke("try_register_shortcut", { id, accelerator: accel });
        }
        await invoke("apply_shortcuts", next);
      } catch (err) {
        setError({ id, msg: shortcutErrorMessage(err) });
        await stopRecording();
        return;
      }

      await saveShortcuts(next);
      setShortcuts(next);
      setError(null);
      await stopRecording({ keepSuspended: true }); // apply_shortcuts가 두 전역 키를 이미 재등록함
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      if (recordingRef.current) void invoke("resume_shortcuts");
    };
  }, []);

  const resetOne = async (id: FieldId) => {
    const next: Shortcuts = { ...shortcuts, [id]: DEFAULT_SHORTCUTS[id] };
    try {
      await invoke("apply_shortcuts", next);
    } catch (err) {
      setError({ id, msg: shortcutErrorMessage(err) });
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
                <span style={styles.hint}>{t("shortcut.recording")}</span>
              ) : (
                acceleratorSymbols(shortcuts[id]).map((s, j) => (
                  <span key={j} style={styles.kbd}>
                    {s}
                  </span>
                ))
              )}
            </button>
            {showReset && (
              <button style={styles.reset} onClick={() => resetOne(id)}>
                {t("shortcut.reset")}
              </button>
            )}
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
  lbl: { width: 110, flexShrink: 0 },
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
    borderColor: "var(--rec-border)",
    boxShadow: "0 0 0 2px var(--rec-ring)",
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
  errText: { margin: "6px 0 0 120px", fontSize: 12, color: "#e2504a" },
};
