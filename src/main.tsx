import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AiSettingsProvider } from "./components/system/ai-settings-provider";
import { ThemeProvider } from "./components/system/theme-provider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AiSettingsProvider>
        <App />
      </AiSettingsProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
