import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "./i18n";
import { styles as ed } from "./ShortcutEditor";

/** 로그인 시 자동 실행 — 트레이와 같은 OS 로그인 항목을 읽고 쓴다. 설정 창과 온보딩 공용. */
export function AutostartToggle() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    invoke<boolean>("autostart_get").then(setEnabled);
  }, []);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    await invoke("autostart_set", { enabled: next });
  };

  return (
    <div style={{ ...ed.row, borderTop: "0.5px solid var(--line)" }}>
      <label style={{ ...ed.rowMain, cursor: "pointer" }}>
        <span style={ed.lbl}>{t("autostart.label")}</span>
        <input type="checkbox" checked={enabled} onChange={toggle} />
      </label>
    </div>
  );
}
