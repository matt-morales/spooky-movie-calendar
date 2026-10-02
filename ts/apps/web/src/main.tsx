import { createCommentClient } from "@spooky/comment";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { browserAnalytics } from "./lib/analytics";
import { createApi } from "./lib/api";
import { routeFor } from "./lib/route";
import { AppStateProvider } from "./state/AppState";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/comments.css";

// Which lineup to show: the year in the path ("/2025"), else the build-time
// default. The address bar is rewritten to the canonical "/<year>" URL before
// anything runs, so the page view records it too.
const { year, url } = routeFor(location, Number(import.meta.env.VITE_LINEUP_YEAR) || 2026);
if (url !== location.pathname + location.hash) history.replaceState(null, "", url);

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
