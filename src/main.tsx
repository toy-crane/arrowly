import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { OverlayApp } from "./overlay/OverlayApp";
import { OnboardingApp } from "./onboarding/OnboardingApp";

const Root = window.location.hash === "#/onboarding" ? OnboardingApp : OverlayApp;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
