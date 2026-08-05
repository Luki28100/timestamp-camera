import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SettingsProvider } from "./state/settings";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </React.StrictMode>
);

// Service worker only in production — in dev it would shadow Vite's HMR assets.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support is optional */
    });
  });
}
