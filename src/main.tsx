import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { OverlayApp } from "./overlay/overlay-app";
import { OnboardingApp } from "./onboarding/onboarding-app";
import { SettingsApp } from "./settings/settings-app";
import { lang } from "./shared/i18n";

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

document.documentElement.lang = lang;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
