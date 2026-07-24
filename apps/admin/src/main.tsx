import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@abbiss/preview-engine/src/tokens.css";
import "./styles.css";
import { App } from "./App";

// Build/deploy pipeline smoke test #2 — verifying the admin Workers Build deploys.
document.documentElement.classList.add("theme-dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
