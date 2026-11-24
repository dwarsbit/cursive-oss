import React from "react";
import ReactDOM from "react-dom/client";
import { startLanguage } from "@scholarkit/i18n";
import { isDesktop } from "@scholarkit/editor/lib/platform";
import { invoke } from "@tauri-apps/api/core";
import { catalogs } from "./lib/languages";
import { startMonitoring } from "./lib/monitoring";
import "./index.css";

// The theme follows the system until the app has its own setting.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () =>
  document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

// The desktop app has its own menus: the webview's (Reload, Inspect
// Element) shows only in fields, for spelling and copy and paste, and
// in development.
if (isDesktop && import.meta.env.PROD) {
  window.addEventListener("contextmenu", (event) => {
    const target = event.target as Element | null;
    if (!target?.closest?.("input, textarea, [contenteditable='true'], .cm-editor")) {
      event.preventDefault();
    }
  });
}

void start();

/**
 * The language comes first: the app's modules translate their text as they
 * load, so they load once it is set.
 */
async function start() {
  void startMonitoring();
  await startLanguage({ loaders: catalogs, dev: import.meta.env.DEV });
  const [
    { default: App },
    { Desktop },
    { Web },
    { UpdateCard },
    updates,
    sample,
    store,
  ] = await Promise.all([
    import("./App"),
    import("./components/Desktop"),
    import("./components/Web"),
    import("@scholarkit/updates/components/UpdateCard"),
    import("./lib/updates"),
    import("@scholarkit/editor/editor/sample"),
    import("./lib/browser-store"),
  ]);
  const { DOWNLOAD_URL, updater } = updates;

  // The desktop app keeps a project as a folder on disk. The web build
  // (`pnpm build:web`) runs on the Scholarkit server and keeps projects in
  // the account. Any other browser build is the demo, which keeps the
  // sample project in the browser's own storage.
  const app = isDesktop ? (
    <>
      <Desktop />
      {updater && (
        <UpdateCard
          updater={updater}
          app="Cursive"
          downloadUrl={DOWNLOAD_URL}
          openUrl={(url) => void invoke("open_in_browser", { url }).catch(() => {})}
        />
      )}
    </>
  ) : import.meta.env.MODE === "web" ? (
    <Web />
  ) : (
    <App
      store={store.browserStore(sample.SAMPLE_PROJECT)}
      firstOpen={sample.SAMPLE_PAGE}
    />
  );

  // The desktop app checks for a new version soon after it starts, and once a day after that.
  // Development builds only check from Settings.
  if (import.meta.env.PROD) updater?.start();

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>{app}</React.StrictMode>,
  );
}
