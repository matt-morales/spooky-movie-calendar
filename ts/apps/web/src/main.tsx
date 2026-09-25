import { createCommentClient } from "@spooky/comment";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { browserAnalytics } from "./lib/analytics";
import { createApi } from "./lib/api";
import { AppStateProvider } from "./state/AppState";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/global.css";

// Which lineup to show: ?year=2025 in the URL, else the build-time default.
const year = Number(new URLSearchParams(location.search).get("year")) || Number(import.meta.env.VITE_LINEUP_YEAR) || 2025;

const services = {
  api: createApi(),
  analytics: browserAnalytics(),
  comments: createCommentClient(),
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppStateProvider services={services}>
      <App year={year} />
    </AppStateProvider>
  </StrictMode>,
);
