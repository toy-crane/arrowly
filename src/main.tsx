import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { OverlayApp } from "./overlay/OverlayApp";
import { OnboardingApp } from "./onboarding/OnboardingApp";
import { SettingsApp } from "./settings/SettingsApp";

function pickRoot() {
  switch (window.location.hash) {
    case "#/onboarding":
      return OnboardingApp;
    case "#/settings":
      return SettingsApp;
    default:
      return OverlayApp;
  }
}
const Root = pickRoot();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
