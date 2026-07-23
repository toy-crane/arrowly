import { CSSProperties } from "react";
import { t } from "../shared/i18n";
import { ShortcutEditor } from "../shared/shortcuts";

// 재설정 불가 — OS 표준·예약 키와 제스처라 참고용으로만 보여준다.
const FIXED_ROWS: { label: string; keys: string[]; gesture?: string }[] = [
  { label: t("settings.moveMark"), keys: ["⌘"], gesture: t("settings.drag") },
  { label: t("settings.deleteOne"), keys: ["⌥"], gesture: t("settings.click") },
  { label: t("settings.undo"), keys: ["⌘", "Z"] },
  { label: t("settings.redo"), keys: ["⇧", "⌘", "Z"] },
  { label: t("settings.deleteTool"), keys: ["E"] },
  { label: t("settings.toolSize"), keys: ["⌘", "±"] },
  { label: t("settings.colorSwitch"), keys: ["⌘", "1–5"] },
  { label: t("settings.exit"), keys: ["Esc"] },
];

export function SettingsApp() {
  return (
    <main style={root}>
      <h1 style={title}>{t("settings.title")}</h1>

      <section style={section}>
        <SectionHeading
          title={t("settings.editable.title")}
          hint={t("settings.editable.hint")}
        />
        <div style={card}>
          <ShortcutEditor />
        </div>
      </section>

      <section style={{ ...section, marginTop: 14 }}>
        <SectionHeading title={t("settings.fixed.title")} hint={t("settings.fixed.hint")} />
        <div style={card}>
          {FIXED_ROWS.map(({ label, keys, gesture }, rowIndex) => (
            <div
              key={label}
              style={{ ...fixedRow, ...(rowIndex === 0 ? fixedRowFirst : undefined) }}
            >
              <span style={fixedLabel}>{label}</span>
              <span style={fixedGesture}>
                {keys.map((key, keyIndex) => (
                  <span key={keyIndex} style={kbd}>
                    {key}
                  </span>
                ))}
                {gesture}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function SectionHeading({ title: heading, hint }: { title: string; hint: string }) {
  return (
    <div style={sectionHeading}>
      <h2 style={sectionTitle}>{heading}</h2>
      <p style={sectionHint}>{hint}</p>
    </div>
  );
}

const root: CSSProperties = {
  height: "100%",
  boxSizing: "border-box",
  padding: "18px 20px 20px",
  background: "var(--win)",
  color: "var(--fg)",
  font: "400 14px/1.5 -apple-system, BlinkMacSystemFont, sans-serif",
  overflowY: "auto",
  scrollbarWidth: "thin",
};

const title: CSSProperties = { margin: "0 0 14px", fontSize: 16, lineHeight: 1.25, fontWeight: 650 };
const section: CSSProperties = {};
const sectionHeading: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
  margin: "0 2px 6px",
};
const sectionTitle: CSSProperties = { margin: 0, fontSize: 12.5, fontWeight: 650 };
const sectionHint: CSSProperties = { margin: 0, color: "var(--muted)", fontSize: 10.5 };
const card: CSSProperties = {
  border: "0.5px solid var(--line)",
  borderRadius: 10,
  background: "var(--card)",
  overflow: "hidden",
};
const fixedRow: CSSProperties = {
  minHeight: 36,
  boxSizing: "border-box",
  display: "grid",
  gridTemplateColumns: "minmax(130px, 1fr) auto",
  alignItems: "center",
  gap: 8,
  padding: "5px 9px",
  borderTop: "0.5px solid var(--line)",
};
const fixedRowFirst: CSSProperties = { borderTop: "none" };
const fixedLabel: CSSProperties = { minWidth: 0, fontSize: 12, fontWeight: 520 };
const fixedGesture: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 4,
  color: "var(--muted)",
  fontSize: 10.5,
  whiteSpace: "nowrap",
};
const kbd: CSSProperties = {
  minWidth: 21,
  height: 21,
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 4px",
  border: "0.5px solid var(--line-strong)",
  borderRadius: 5,
  background: "var(--kbd)",
  color: "var(--fg)",
  fontSize: 11,
  fontWeight: 500,
};
