import { CSSProperties, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { saveOnboardingDone } from "../shared/settings";
import { ShortcutEditor } from "../shared/ShortcutEditor";
import { MiniCanvas } from "./MiniCanvas";

const TOTAL = 3;

export function OnboardingApp() {
  const [step, setStep] = useState(0);
  const [drew, setDrew] = useState(false);

  const finish = async () => {
    await saveOnboardingDone();
    await getCurrentWindow().close();
  };

  return (
    <main style={root}>
      <p style={stepLabel}>{step + 1} / 3</p>

      {step === 0 && (
        <>
          <h1 style={h}>그려 보기</h1>
          <p style={sub}>아래 칸에 마우스로 아무거나 그려 보세요. 한 획을 그으면 다음으로 넘어갈 수 있어요.</p>
          <MiniCanvas onFirstStroke={() => setDrew(true)} />
        </>
      )}

      {step === 1 && (
        <>
          <h1 style={h}>단축키 정하기</h1>
          <p style={sub}>그리기를 켜고 끄는 키예요. 필드를 눌러 원하는 조합으로 바꿀 수 있어요.</p>
          <div style={editorCard}>
            <ShortcutEditor />
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 style={h}>지우기와 빠져나가기</h1>
          <p style={sub}>
            그리다 실수하면 <Kbd>⌘</Kbd>
            <Kbd>Z</Kbd>로 한 획씩 취소돼요. 그리기 모드에서는 <Kbd>Esc</Kbd>로 언제든 빠져나옵니다.
            아래에서 그리고 <Kbd>⌘</Kbd>
            <Kbd>Z</Kbd>를 눌러 보세요.
          </p>
          <MiniCanvas />
          <p style={menubarLine}>
            Arrowly는 화면 오른쪽 위 메뉴바의 <ArrowGlyph /> 아이콘에 있어요.
          </p>
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
              이전
            </button>
          )}
          {step < TOTAL - 1 ? (
            <button
              style={{ ...btn, ...btnPrimary, ...(step === 0 && !drew ? btnDisabled : undefined) }}
              disabled={step === 0 && !drew}
              onClick={() => setStep(step + 1)}
            >
              다음
            </button>
          ) : (
            <button style={{ ...btn, ...btnPrimary }} onClick={finish}>
              시작하기
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

/** 트레이 아이콘과 같은 화살표 글리프 — 메뉴바에서 찾을 아이콘을 그대로 보여준다 */
function ArrowGlyph() {
  return (
    <svg viewBox="0 0 100 100" style={{ width: 15, height: 15, verticalAlign: -2 }} aria-label="화살표 아이콘">
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
};

const stepLabel: CSSProperties = { margin: "0 0 4px", fontSize: 12, color: "var(--muted)" };
const h: CSSProperties = { margin: "0 0 6px", fontSize: 19, fontWeight: 600 };
const sub: CSSProperties = { margin: "0 0 14px", fontSize: 13.5, color: "var(--muted)" };

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

const btnPrimary: CSSProperties = {
  background: "#FF2D95",
  borderColor: "#FF2D95",
  color: "#fff",
};

const btnDisabled: CSSProperties = { opacity: 0.4, cursor: "default" };
