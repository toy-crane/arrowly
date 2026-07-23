import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { t } from "../shared/i18n";
import { DEFAULT_SHORTCUTS, loadShortcuts, saveOnboardingDone } from "../shared/settings";
import { acceleratorSymbols } from "../shared/shortcuts";
import { CorrectionStep, MiniCanvas, OnboardingPhase } from "./mini-canvas";

const TOTAL = 3;

export function OnboardingApp() {
  const [step, setStep] = useState(0);
  const [drew, setDrew] = useState(false);
  const [correctionStep, setCorrectionStep] = useState<CorrectionStep>("move");
  const [cleared, setCleared] = useState(false);
  const [toggleAccel, setToggleAccel] = useState(DEFAULT_SHORTCUTS.toggle);
  const [clearAccel, setClearAccel] = useState(DEFAULT_SHORTCUTS.clear);
  const finishingRef = useRef(false);

  useEffect(() => {
    loadShortcuts().then((shortcuts) => {
      setToggleAccel(shortcuts.toggle);
      setClearAccel(shortcuts.clear);
    });
  }, []);

  useEffect(() => {
    if (step !== 2 || !cleared) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Escape" || event.repeat || finishingRef.current) return;
      event.preventDefault();
      finishingRef.current = true;
      void saveOnboardingDone().then(() => getCurrentWindow().close());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cleared, step]);

  const phase: OnboardingPhase = step === 0 ? "draw" : step === 1 ? "correct" : "finish";
  const canContinue = step === 0 ? drew : correctionStep === "complete";

  return (
    <main style={root}>
      <div style={topline}>
        <span>{step + 1} / {TOTAL}</span>
        {step === 0 && (
          <span style={startShortcut}>
            {t("onboarding.draw.startShortcut")} <KeyCombo accelerator={toggleAccel} />
          </span>
        )}
      </div>

      {step === 0 && (
        <>
          <h1 style={h}>{t("onboarding.draw.title")}</h1>
          <p style={sub}>{t("onboarding.draw.body")}</p>
        </>
      )}

      {step === 1 && (
        <>
          <h1 style={h}>{t("onboarding.correct.title")}</h1>
          <p style={sub}>{t("onboarding.correct.body")}</p>
          <div style={taskStrip}>
            <Task
              index={1}
              state={taskState(correctionStep, "move")}
              keys={<><Kbd>⌘</Kbd> {t("onboarding.correct.drag")}</>}
              label={t("onboarding.correct.move")}
            />
            <Task
              index={2}
              state={taskState(correctionStep, "delete")}
              keys={<><Kbd>⌥</Kbd> {t("onboarding.correct.click")}</>}
              label={t("onboarding.correct.delete")}
            />
            <Task
              index={3}
              state={taskState(correctionStep, "undo")}
              keys={<><Kbd>⌘</Kbd><Kbd>Z</Kbd></>}
              label={t("onboarding.correct.undo")}
            />
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 style={h}>{t("onboarding.finish.title")}</h1>
          <p style={sub}>{t("onboarding.finish.body")}</p>
          <div style={exitActions}>
            <ActionCard
              active={!cleared}
              done={cleared}
              keys={<KeyCombo accelerator={clearAccel} />}
              label={t("onboarding.finish.clear")}
              hint={t("onboarding.finish.clearHint")}
            />
            <ActionCard
              active={cleared}
              keys={<Kbd>Esc</Kbd>}
              label={t("onboarding.finish.exit")}
              hint={t("onboarding.finish.exitHint")}
            />
          </div>
        </>
      )}

      <MiniCanvas
        phase={phase}
        correctionStep={correctionStep}
        clearAccel={clearAccel}
        emptyLabel={cleared ? t("onboarding.finish.cleared") : undefined}
        onFirstStroke={() => setDrew(true)}
        onMoved={() => setCorrectionStep("delete")}
        onDeleted={() => setCorrectionStep("undo")}
        onRestored={() => setCorrectionStep("complete")}
        onCleared={() => setCleared(true)}
      />

      <footer style={foot}>
        <span style={pips}>
          {Array.from({ length: TOTAL }, (_, index) => (
            <i key={index} style={{ ...pip, ...(index === step ? pipOn : undefined) }} />
          ))}
        </span>
        <span style={footerActions}>
          {step > 0 && (
            <button style={btn} onClick={() => setStep(step - 1)}>
              {t("onboarding.back")}
            </button>
          )}
          {step < TOTAL - 1 && (
            <button
              style={{ ...btn, ...btnPrimary, ...(!canContinue ? btnDisabled : undefined) }}
              disabled={!canContinue}
              onClick={() => setStep(step + 1)}
            >
              {t("onboarding.next")}
            </button>
          )}
          {step === TOTAL - 1 && cleared && (
            <span style={exitHint}>
              <Kbd>Esc</Kbd> {t("onboarding.finish.escape")}
            </span>
          )}
        </span>
      </footer>
    </main>
  );
}

function taskState(current: CorrectionStep, task: Exclude<CorrectionStep, "complete">): TaskState {
  const order: CorrectionStep[] = ["move", "delete", "undo", "complete"];
  const currentIndex = order.indexOf(current);
  const taskIndex = order.indexOf(task);
  return taskIndex < currentIndex ? "done" : taskIndex === currentIndex ? "active" : "pending";
}

type TaskState = "pending" | "active" | "done";

function Task({
  index,
  state,
  keys,
  label,
}: {
  index: number;
  state: TaskState;
  keys: ReactNode;
  label: string;
}) {
  return (
    <div style={{ ...task, ...(state === "active" ? taskActive : undefined), ...(state === "done" ? taskDone : undefined) }}>
      <span style={{ ...taskIndex, ...(state === "done" ? taskIndexDone : undefined) }}>
        {state === "done" ? "✓" : index}
      </span>
      <span style={taskCopy}>
        <strong style={taskKeys}>{keys}</strong>
        {label}
      </span>
    </div>
  );
}

function ActionCard({
  active,
  done = false,
  keys,
  label,
  hint,
}: {
  active: boolean;
  done?: boolean;
  keys: ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <div style={{ ...actionCard, ...(active ? actionActive : undefined), ...(done ? actionDone : undefined) }}>
      <span style={keyGroup}>{keys}</span>
      <span>
        <strong style={actionLabel}>{label}</strong>
        <small style={actionHint}>{hint}</small>
      </span>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <span style={kbd}>{children}</span>;
}

function KeyCombo({ accelerator }: { accelerator: string }) {
  return acceleratorSymbols(accelerator).map((symbol, index) => <Kbd key={index}>{symbol}</Kbd>);
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
  overflow: "hidden",
};

const topline: CSSProperties = {
  minHeight: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 2,
  color: "var(--muted)",
  fontSize: 12,
};
const startShortcut: CSSProperties = { display: "flex", alignItems: "center", gap: 5 };
const h: CSSProperties = { margin: "0 0 5px", fontSize: 19, fontWeight: 650 };
const sub: CSSProperties = { margin: "0 0 12px", fontSize: 13.5, color: "var(--muted)" };

const taskStrip: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 7,
  marginBottom: 10,
};
const task: CSSProperties = {
  minHeight: 50,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "7px 8px",
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "var(--card)",
  color: "var(--muted)",
  fontSize: 11,
};
const taskActive: CSSProperties = {
  borderColor: "var(--rec-border)",
  color: "var(--fg)",
  boxShadow: "0 0 0 2px var(--rec-ring)",
};
const taskDone: CSSProperties = { background: "var(--field)", color: "var(--fg)" };
const taskIndex: CSSProperties = {
  flex: "0 0 auto",
  width: 18,
  height: 18,
  display: "grid",
  placeItems: "center",
  border: "1px solid var(--line-strong)",
  borderRadius: "50%",
  fontSize: 10,
};
const taskIndexDone: CSSProperties = {
  borderColor: "var(--hi)",
  background: "var(--hi)",
  color: "#1c1e24",
};
const taskCopy: CSSProperties = { display: "block" };
const taskKeys: CSSProperties = { display: "block", color: "inherit", fontSize: 11, fontWeight: 650 };

const exitActions: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginBottom: 10,
};
const actionCard: CSSProperties = {
  minHeight: 54,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "8px 10px",
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "var(--card)",
  color: "var(--muted)",
};
const actionActive: CSSProperties = {
  borderColor: "var(--rec-border)",
  color: "var(--fg)",
  boxShadow: "0 0 0 2px var(--rec-ring)",
};
const actionDone: CSSProperties = { background: "var(--field)", color: "var(--fg)" };
const actionLabel: CSSProperties = { display: "block", fontSize: 12 };
const actionHint: CSSProperties = { display: "block", marginTop: 1, fontSize: 10 };
const keyGroup: CSSProperties = { display: "inline-flex", alignItems: "center" };

const kbd: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 20,
  height: 22,
  boxSizing: "border-box",
  padding: "0 5px",
  margin: "0 1px",
  border: "0.5px solid var(--line-strong)",
  borderRadius: 5,
  background: "var(--kbd)",
  color: "var(--fg)",
  fontSize: 12,
  fontWeight: 500,
};

const foot: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 13,
};
const pips: CSSProperties = { display: "flex", gap: 6 };
const pip: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--line-strong)",
};
const pipOn: CSSProperties = { background: "var(--hi)" };
const footerActions: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const exitHint: CSSProperties = { display: "flex", alignItems: "center", gap: 5, color: "var(--muted)", fontSize: 12 };
const btn: CSSProperties = {
  minWidth: 70,
  padding: "7px 14px",
  border: "1px solid var(--line-strong)",
  borderRadius: 7,
  background: "var(--field)",
  color: "inherit",
  cursor: "pointer",
};
const btnPrimary: CSSProperties = {
  background: "var(--primary-bg)",
  borderColor: "var(--primary-bg)",
  color: "var(--primary-fg)",
};
const btnDisabled: CSSProperties = { opacity: 0.35, cursor: "default" };
