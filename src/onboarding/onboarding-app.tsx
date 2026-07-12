import { CSSProperties, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { acceleratorSymbols } from "../shared/accelerator";
import { t, tx } from "../shared/i18n";
import { DEFAULT_SHORTCUTS, loadShortcuts, saveOnboardingDone } from "../shared/settings";
import { ShortcutEditor } from "../shared/shortcut-editor";
import { MiniCanvas } from "./mini-canvas";

const TOTAL = 3;

export function OnboardingApp() {
  const [step, setStep] = useState(0);
  const [drew, setDrew] = useState(false);
  const [boardAccel, setBoardAccel] = useState(DEFAULT_SHORTCUTS.board);

  useEffect(() => {
    loadShortcuts().then((shortcuts) => setBoardAccel(shortcuts.board));
  }, []);

  const finish = async () => {
    await saveOnboardingDone();
    await getCurrentWindow().close();
  };

  return (
    <main style={root}>
      <p style={stepLabel}>{step + 1} / 3</p>

      {step === 0 && (
        <>
          <h1 style={h}>{t("onboarding.draw.title")}</h1>
          <p style={sub}>{tx("onboarding.draw.body", { hi: <Hi>{t("onboarding.draw.hi")}</Hi> })}</p>
          <MiniCanvas onFirstStroke={() => setDrew(true)} />
        </>
      )}

      {step === 1 && (
        <>
          <h1 style={h}>{t("onboarding.erase.title")}</h1>
          <p style={sub}>
            {tx("onboarding.erase.body", {
              cmd: <Kbd>⌘</Kbd>,
              z: <Kbd>Z</Kbd>,
              board: <KeyCombo accelerator={boardAccel} />,
              esc: <Kbd>Esc</Kbd>,
              hi: <Hi>{t("onboarding.erase.hi")}</Hi>,
            })}
          </p>
          <MiniCanvas boardable boardAccel={boardAccel} />
        </>
      )}

      {step === 2 && (
        <>
          <h1 style={h}>{t("onboarding.shortcut.title")}</h1>
          <p style={sub}>{t("onboarding.shortcut.body")}</p>
          <div style={editorCard}>
            <ShortcutEditor showReset={false} />
          </div>
          <p style={menubarLine}>{tx("onboarding.menubar", { arrow: <ArrowGlyph /> })}</p>
        </>
      )}

      <div style={foot}>
        <span style={pips}>
          {Array.from({ length: TOTAL }, (_, i) => (
            <i key={i} style={{ ...pip, ...(i === step ? pipOn : undefined) }} />
          ))}
        </span>
        <span style={{ display: "flex", gap: 8 }}>
          {step > 0 && (
            <button style={btn} onClick={() => setStep(step - 1)}>
              {t("onboarding.back")}
            </button>
          )}
          {step < TOTAL - 1 ? (
            <button
              style={{ ...btn, ...btnPrimary, ...(step === 0 && !drew ? btnDisabled : undefined) }}
              disabled={step === 0 && !drew}
              onClick={() => setStep(step + 1)}
            >
              {t("onboarding.next")}
            </button>
          ) : (
            <button style={{ ...btn, ...btnPrimary }} onClick={finish}>
              {t("onboarding.start")}
            </button>
          )}
        </span>
      </div>
    </main>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span style={kbd}>{children}</span>;
}

function KeyCombo({ accelerator }: { accelerator: string }) {
  return acceleratorSymbols(accelerator).map((symbol, index) => <Kbd key={index}>{symbol}</Kbd>);
}

/** 형광펜 하이라이트 — 테마 포인트, 단계당 하나만 */
function Hi({ children }: { children: React.ReactNode }) {
  return <span style={hi}>{children}</span>;
}

/** 트레이 아이콘과 같은 화살표 글리프 — 메뉴바에서 찾을 아이콘을 그대로 보여준다 */
function ArrowGlyph() {
  return (
    <svg viewBox="0 0 100 100" style={{ width: 15, height: 15, verticalAlign: -2 }} aria-label={t("onboarding.arrowIcon")}>
      <g fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round">
        <path d="M21 85 C27 72 29 64 36 54 C41 46.5 47 41 54 36.5 C62 31.5 69 29 76 27.8" />
        <path d="M60 14.5 C67 18 74 22.5 81 28.5" />
        <path d="M82.5 25.5 C76.5 32.5 72 40.5 69.5 48" />
      </g>
    </svg>
  );
}

const root: CSSProperties = {
  height: "100vh",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  padding: "18px 24px 16px",
  background: "var(--win)",
  color: "var(--fg)",
  font: "400 14px/1.55 -apple-system, BlinkMacSystemFont, sans-serif",
  overflowY: "auto",
};

const stepLabel: CSSProperties = { margin: "0 0 4px", fontSize: 12, color: "var(--muted)" };
const h: CSSProperties = { margin: "0 0 6px", fontSize: 19, fontWeight: 600 };
const sub: CSSProperties = { margin: "0 0 14px", fontSize: 13.5, color: "var(--muted)" };

const hi: CSSProperties = {
  background: "linear-gradient(transparent 55%, var(--hi) 55%, var(--hi) 92%, transparent 92%)",
  color: "var(--fg)",
  fontWeight: 500,
};

const editorCard: CSSProperties = {
  border: "0.5px solid var(--line)",
  borderRadius: 10,
  background: "var(--card)",
  overflow: "hidden",
};

const menubarLine: CSSProperties = { margin: "12px 0 0", fontSize: 12.5, color: "var(--muted)" };

const kbd: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 20,
  height: 22,
  padding: "0 5px",
  margin: "0 1px",
  border: "0.5px solid var(--line-strong)",
  borderRadius: 5,
  background: "var(--kbd)",
  fontSize: 12,
  fontWeight: 500,
};

const foot: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginTop: 16,
};

const pips: CSSProperties = { display: "flex", gap: 6 };
const pip: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--line-strong)",
};
const pipOn: CSSProperties = { background: "var(--muted)" };

const btn: CSSProperties = {
  fontSize: 13,
  padding: "7px 16px",
  border: "0.5px solid var(--line-strong)",
  borderRadius: 7,
  background: "var(--field)",
  color: "inherit",
  cursor: "pointer",
};

// 라이트=잉크 블록+형광 글자, 다크=형광 블록+잉크 글자 (앱 아이콘의 반전 관계)
const btnPrimary: CSSProperties = {
  background: "var(--primary-bg)",
  borderColor: "var(--primary-bg)",
  color: "var(--primary-fg)",
};

const btnDisabled: CSSProperties = { opacity: 0.4, cursor: "default" };
