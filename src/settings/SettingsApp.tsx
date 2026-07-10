import { CSSProperties } from "react";
import { acceleratorSymbols } from "../shared/accelerator";
import { t } from "../shared/i18n";
import { ShortcutEditor, styles as ed } from "../shared/ShortcutEditor";

// 재설정 불가 — OS 표준·예약 키라 참고용으로 보여준다
const FIXED_ROWS: { label: string; accel: string }[] = [
  { label: t("settings.undo"), accel: "Cmd+KeyZ" },
  { label: t("settings.exit"), accel: "Escape" },
];

export function SettingsApp() {
  return (
    <main style={root}>
      <h1 style={title}>{t("settings.title")}</h1>
      <div style={card}>
        <ShortcutEditor />
        {FIXED_ROWS.map(({ label, accel }) => (
          <div key={label} style={{ ...ed.row, borderTop: "0.5px solid var(--line)" }}>
            <div style={ed.rowMain}>
              <span style={ed.lbl}>{label}</span>
              <div style={{ ...ed.field, ...fieldFixed }}>
                {acceleratorSymbols(accel).map((s, j) => (
                  <span key={j} style={{ ...ed.kbd, ...kbdFixed }}>
                    {s}
                  </span>
                ))}
              </div>
              <span style={fixedTag}>{t("settings.fixed")}</span>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

const root: CSSProperties = {
  height: "100%",
  boxSizing: "border-box",
  padding: "18px 20px",
  background: "var(--win)",
  color: "var(--fg)",
  font: "400 14px/1.5 -apple-system, BlinkMacSystemFont, sans-serif",
  overflowY: "auto",
};

const title: CSSProperties = { margin: "0 0 14px", fontSize: 15, fontWeight: 600 };

const card: CSSProperties = {
  border: "0.5px solid var(--line)",
  borderRadius: 10,
  background: "var(--card)",
  overflow: "hidden",
};

const fieldFixed: CSSProperties = { cursor: "default", opacity: 0.6, background: "transparent" };
const kbdFixed: CSSProperties = { background: "transparent", color: "var(--muted)" };
const fixedTag: CSSProperties = {
  flexShrink: 0,
  fontSize: 12,
  padding: "5px 10px",
  color: "var(--muted)",
};
