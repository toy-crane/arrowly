import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import { shortcutErrorMessage, t } from "../i18n";
import { applyShortcuts, resumeShortcuts, suspendShortcuts, tryRegisterShortcut } from "../ipc";
import {
  DEFAULT_CONTROLS,
  DEFAULT_SHORTCUTS,
  loadControls,
  loadShortcuts,
  saveControls,
  saveShortcuts,
  Shortcuts,
} from "../settings";
import { acceleratorSymbols, buildAccelerator } from "./accelerator";
import {
  type ControlError,
  type ControlId,
  type Controls,
  controlSymbols,
  isToolSizeAccelerator,
  type ModifierName,
  updateControls,
} from "./controls";

type ShortcutId = keyof Shortcuts;
type RowId = ShortcutId | ControlId;

const MODIFIER_ROWS: ReadonlySet<RowId> = new Set<RowId>(["move", "duplicate", "delete", "size"]);
const isShortcutRow = (id: RowId): id is ShortcutId => id in DEFAULT_SHORTCUTS;

const MODIFIER_OF_KEY: Record<string, ModifierName> = {
  Meta: "Cmd",
  Alt: "Alt",
  Shift: "Shift",
  Control: "Control",
};

type GroupSpec = { id: string; title: string; icon: ReactNode; rows: [RowId, string][] };

/** 설정 창의 바꿀 수 있는 세 그룹. 순서와 구성은 승인된 프로토타입을 따른다. */
const GROUPS: GroupSpec[] = [
  {
    id: "drawing",
    title: t("settings.group.drawing"),
    icon: <PencilIcon />,
    rows: [
      ["toggle", t("shortcut.toggle")],
      ["board", t("shortcut.board")],
      ["clear", t("shortcut.clear")],
    ],
  },
  {
    id: "marks",
    title: t("settings.group.marks"),
    icon: <PointerIcon />,
    rows: [
      ["move", t("settings.moveMark")],
      ["duplicate", t("settings.duplicateMark")],
      ["delete", t("settings.deleteOne")],
    ],
  },
  {
    id: "tools",
    title: t("settings.group.tools"),
    icon: <PaletteIcon />,
    rows: [
      ["text", t("shortcut.text")],
      ["size", t("settings.toolSize")],
      ["color", t("settings.colorSwitch")],
    ],
  },
];

// 어느 동작도 실행 취소(⌘Z/⇧⌘Z)를 덮으면 안 된다.
const UNDO_ACCELS = new Set(["Cmd+KeyZ", "Shift+Cmd+KeyZ", "Cmd+Shift+KeyZ"]);

function localValidationError(
  id: ShortcutId,
  accel: string,
  shortcuts: Shortcuts,
  controls: Controls,
): string | null {
  const parts = accel.split("+");
  const code = parts[parts.length - 1];
  if (code === "Escape") return t("shortcut.error.reservedEsc");
  if (id === "text" && accel === controls.color) return t("shortcut.error.reservedColorPalette");
  // text는 전역 미등록 로컬 키라 수식키 없는 단독 키를 허용한다.
  if (parts.length < 2 && id !== "text") return t("shortcut.error.modifierRequired");
  if (UNDO_ACCELS.has(accel)) return t("shortcut.error.undo");
  // 오버레이는 크기 조절 키를 먼저 처리하고, 전역 키는 반대로 크기 조절을 가로챈다.
  if (isToolSizeAccelerator(accel, controls)) {
    return t("shortcut.error.toolSize");
  }
  if (Object.entries(shortcuts).some(([other, value]) => other !== id && value === accel)) {
    return t("shortcut.error.duplicate");
  }
  return null;
}

function controlErrorMessage(error: ControlError, controls: Controls): string {
  return t(`control.error.${error}`, { move: controlSymbols(controls, "move")[0] });
}

/** 기본값으로 돌아갈 값. 복제 행은 복제 추가 키만 되돌린다. */
const DEFAULT_RECORDING: Record<ControlId, (c: Controls) => ModifierName[] | string> = {
  move: () => [DEFAULT_CONTROLS.move],
  duplicate: (c) => [c.move, DEFAULT_CONTROLS.duplicate],
  delete: () => [DEFAULT_CONTROLS.delete],
  size: () => DEFAULT_CONTROLS.size,
  color: () => DEFAULT_CONTROLS.color,
};

function isChanged(id: RowId, shortcuts: Shortcuts, controls: Controls): boolean {
  if (isShortcutRow(id)) return shortcuts[id] !== DEFAULT_SHORTCUTS[id];
  if (id === "size") return controls.size.join("+") !== DEFAULT_CONTROLS.size.join("+");
  // 옮기기 키가 기본 복제 추가 키를 쓰는 동안에는 복제 행만 되돌릴 수 없다.
  if (id === "duplicate" && controls.move === DEFAULT_CONTROLS.duplicate) return false;
  return controls[id] !== DEFAULT_CONTROLS[id];
}

/** 바꿀 수 있는 단축키와 조작 키를 그룹별로 보여주고 녹화한다. */
export function ShortcutEditor() {
  const [shortcuts, setShortcuts] = useState<Shortcuts>(DEFAULT_SHORTCUTS);
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS);
  const [recording, setRecording] = useState<RowId | null>(null);
  const [error, setError] = useState<{ id: RowId; msg: string } | null>(null);
  const recordingRef = useRef<RowId | null>(null);
  recordingRef.current = recording;
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const heldRef = useRef<Set<ModifierName>>(new Set());

  useEffect(() => {
    loadShortcuts().then(setShortcuts);
    loadControls().then(setControls);
  }, []);

  const stopRecording = async (opts?: { keepSuspended?: boolean }) => {
    setRecording(null);
    heldRef.current = new Set();
    if (!opts?.keepSuspended) await resumeShortcuts();
  };

  const startRecording = async (id: RowId) => {
    if (recording === id) {
      await stopRecording();
      return;
    }
    setError(null);
    heldRef.current = new Set();
    setRecording(id);
    // 두 전역 키가 현재 조합을 웹뷰보다 먼저 가로채므로 레코딩 동안 함께 해제한다.
    await suspendShortcuts();
  };

  const commitControl = async (id: ControlId, value: ModifierName[] | string) => {
    const current = controlsRef.current;
    const result = updateControls(current, id, value, shortcutsRef.current);
    if (!result.ok) {
      setError({ id, msg: controlErrorMessage(result.error, current) });
      return false;
    }
    await saveControls(result.controls);
    setControls(result.controls);
    setError(null);
    return true;
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
      if (MODIFIER_ROWS.has(id)) {
        // 수식키 행은 누른 수식키를 모으고 첫 수식키를 뗄 때 확정한다.
        if (MODIFIER_OF_KEY[e.key]) {
          // 방금 누른 수식키는 플래그가 아직 비어 있는 환경이 있어 키 이름으로도 담는다.
          heldRef.current.add(MODIFIER_OF_KEY[e.key]);
          for (const [flag, name] of [
            [e.metaKey, "Cmd"],
            [e.altKey, "Alt"],
            [e.shiftKey, "Shift"],
            [e.ctrlKey, "Control"],
          ] as const) {
            if (flag) heldRef.current.add(name);
          }
        }
        return;
      }
      const accel = buildAccelerator(e);
      if (!accel) return; // 수식어만 눌린 상태 — 계속 대기

      if (id === "color") {
        await commitControl("color", accel);
        await stopRecording();
        return;
      }

      const validationError = localValidationError(
        id as ShortcutId,
        accel,
        shortcutsRef.current,
        controlsRef.current,
      );
      if (validationError) {
        setError({ id, msg: validationError });
        await stopRecording();
        return;
      }

      const next: Shortcuts = { ...shortcutsRef.current, [id]: accel };

      try {
        // clear·text는 전역 미등록 로컬 키 — OS 등록 검증은 toggle·board만 (GlobalShortcutId와 lockstep)
        if (id !== "clear" && id !== "text") {
          await tryRegisterShortcut(id as "toggle" | "board", accel);
        }
        await applyShortcuts(next);
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

    const onKeyUp = async (e: KeyboardEvent) => {
      const id = recordingRef.current;
      if (!id || !MODIFIER_ROWS.has(id) || !MODIFIER_OF_KEY[e.key]) return;
      if (heldRef.current.size === 0) return;
      e.preventDefault();
      const held = [...heldRef.current];
      heldRef.current = new Set();
      await commitControl(id as ControlId, held);
      await stopRecording();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      if (recordingRef.current) void resumeShortcuts();
    };
  }, []);

  const resetOne = async (id: RowId) => {
    if (!isShortcutRow(id)) {
      await commitControl(id, DEFAULT_RECORDING[id](controls));
      return;
    }
    const next: Shortcuts = { ...shortcuts, [id]: DEFAULT_SHORTCUTS[id] };
    try {
      await applyShortcuts(next);
    } catch (err) {
      setError({ id, msg: shortcutErrorMessage(err) });
      return;
    }
    await saveShortcuts(next);
    setShortcuts(next);
    setError(null);
  };

  const symbolsOf = (id: RowId) =>
    isShortcutRow(id) ? acceleratorSymbols(shortcuts[id]) : controlSymbols(controls, id);
  const recordingHint = (id: RowId) =>
    MODIFIER_ROWS.has(id)
      ? t("settings.recordModifier")
      : id === "color"
        ? t("settings.recordKey")
        : t("shortcut.recording");

  return (
    <>
      {GROUPS.map((group) => (
        <SettingsGroup key={group.id} title={group.title} icon={group.icon}>
          {group.rows.map(([id, label], index) => (
            <SettingsRow
              key={id}
              label={label}
              first={index === 0}
              error={error?.id === id ? error.msg : undefined}
            >
              <KeyField
                label={label}
                recording={recording === id}
                invalid={error?.id === id}
                onRecord={() => startRecording(id)}
                onReset={isChanged(id, shortcuts, controls) ? () => resetOne(id) : undefined}
              >
                {recording === id ? (
                  <span style={styles.hint}>{recordingHint(id)}</span>
                ) : (
                  symbolsOf(id).join("")
                )}
              </KeyField>
            </SettingsRow>
          ))}
        </SettingsGroup>
      ))}
    </>
  );
}

/** 아이콘과 제목이 붙은 회색 카드 그룹. */
export function SettingsGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section role="group" aria-label={title} style={styles.group}>
      <h2 style={styles.groupTitle}>
        {icon}
        {title}
      </h2>
      <div style={styles.card}>{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  first = false,
  error,
  children,
}: {
  label: string;
  first?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div data-row style={first ? undefined : styles.row}>
      <div style={styles.rowMain}>
        <span style={styles.label}>{label}</span>
        {children}
      </div>
      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

function KeyField({
  label,
  recording,
  invalid,
  onRecord,
  onReset,
  children,
}: {
  label: string;
  recording: boolean;
  invalid: boolean;
  onRecord: () => void;
  onReset?: () => void;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <span
      style={styles.fieldWrap}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-invalid={invalid}
        style={{
          ...styles.field,
          ...(recording ? styles.fieldRecording : undefined),
          ...(invalid ? styles.fieldError : undefined),
        }}
        onClick={onRecord}
      >
        {children}
      </button>
      {onReset && !recording && (
        <button
          type="button"
          aria-label={t("shortcut.reset")}
          title={t("shortcut.reset")}
          style={{ ...styles.reset, opacity: hovered ? 1 : 0 }}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          onClick={onReset}
        >
          ✕
        </button>
      )}
    </span>
  );
}

const iconProps = { width: 15, height: 15, viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": true };

function PencilIcon() {
  return (
    <svg {...iconProps}>
      <path d="M11.3 1.6a1.6 1.6 0 0 1 2.3 0l.8.8a1.6 1.6 0 0 1 0 2.3l-8 8-3.4.9a.5.5 0 0 1-.6-.6l.9-3.4z" />
    </svg>
  );
}

function PointerIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 1.8a.5.5 0 0 1 .8-.4l9.6 7.1a.5.5 0 0 1-.2.9l-4 .5 2.3 4.2a.6.6 0 0 1-.3.8l-1.2.6a.6.6 0 0 1-.8-.2L6.9 11l-3 2.8a.5.5 0 0 1-.9-.4z" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 1a7 7 0 1 0 0 14c1 0 1.5-.6 1.5-1.3 0-.9-.8-1.2-.8-2 0-.7.6-1.2 1.4-1.2H12a3 3 0 0 0 3-3C15 3.9 11.9 1 8 1zM4.5 8.3a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2zm2-3.3a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2zm3.4 0a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2zm2.3 2.8a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2z" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 1.5A3.5 3.5 0 0 0 4.5 5v2H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 15h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 7h-.5V5A3.5 3.5 0 0 0 8 1.5zM6 7V5a2 2 0 1 1 4 0v2z" />
    </svg>
  );
}

const keyText: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  letterSpacing: 1.5,
};

export const styles: Record<string, CSSProperties> = {
  group: { margin: "0 0 16px" },
  groupTitle: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    margin: "0 4px 7px",
    fontSize: 13,
    fontWeight: 650,
  },
  card: {
    borderRadius: 10,
    background: "color-mix(in srgb, var(--fg) 4%, var(--win))",
    padding: "0 10px",
  },
  row: { borderTop: "0.5px solid var(--line)" },
  rowMain: {
    minHeight: 42,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 132px",
    alignItems: "center",
    gap: 10,
  },
  label: { minWidth: 0, fontSize: 12.5 },
  fieldWrap: { position: "relative", display: "flex" },
  field: {
    ...keyText,
    width: "100%",
    height: 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: 0,
    borderRadius: 6,
    background: "var(--field)",
    boxShadow: "0 0 0 0.5px var(--line-strong), 0 1px 1.5px rgba(0, 0, 0, 0.08)",
    color: "var(--fg)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  fieldRecording: {
    boxShadow: "0 0 0 1px var(--rec-border), 0 0 0 3px var(--rec-ring)",
  },
  fieldError: { boxShadow: "0 0 0 1px #e2504a" },
  hint: { color: "var(--muted)", fontSize: 11.5, fontWeight: 450, letterSpacing: 0 },
  reset: {
    position: "absolute",
    right: 5,
    top: "50%",
    transform: "translateY(-50%)",
    width: 15,
    height: 15,
    padding: 0,
    border: 0,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "color-mix(in srgb, var(--fg) 14%, transparent)",
    color: "var(--fg)",
    fontSize: 9,
    lineHeight: 1,
    cursor: "pointer",
  },
  fixedKeys: { ...keyText, justifySelf: "stretch", textAlign: "center", color: "var(--muted)" },
  error: { margin: "-4px 0 8px", fontSize: 10.5, color: "#e2504a" },
};
