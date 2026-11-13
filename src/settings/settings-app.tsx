import { CSSProperties } from "react";
import { t } from "../shared/i18n";
import { LockIcon, SettingsGroup, SettingsRow, ShortcutEditor, styles } from "../shared/shortcuts";

// 재설정 불가 — 탈출·복구 경로라 참고용으로만 보여준다.
const FIXED_ROWS: { label: string; keys: string }[] = [
  { label: t("settings.undo"), keys: "⌘Z" },
  { label: t("settings.redo"), keys: "⇧⌘Z" },
  { label: t("settings.exit"), keys: "Esc" },
];

export function SettingsApp() {
  return (
    <main style={root}>
      <h1 style={title}>{t("settings.title")}</h1>
      <ShortcutEditor />
      <SettingsGroup title={t("settings.group.fixed")} icon={<LockIcon />}>
        {FIXED_ROWS.map(({ label, keys }, index) => (
          <SettingsRow key={label} label={label} first={index === 0}>
            <span style={styles.fixedKeys}>{keys}</span>
          </SettingsRow>
        ))}
      </SettingsGroup>
    </main>
  );
}

const root: CSSProperties = {
  height: "100%",
  boxSizing: "border-box",
  padding: "18px 20px 4px",
  background: "var(--win)",
  color: "var(--fg)",
  font: "400 14px/1.5 -apple-system, BlinkMacSystemFont, sans-serif",
  overflowY: "auto",
  scrollbarWidth: "thin",
};

const title: CSSProperties = { margin: "0 0 14px", fontSize: 16, lineHeight: 1.25, fontWeight: 650 };
