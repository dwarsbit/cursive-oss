// Error reports to Sentry, through the Scholarkit API's tunnel (see packages/monitoring). Off
// without VITE_SENTRY_DSN, so a build from the public repository, and the demo, send nothing. The
// browser build always reports; the desktop app reports unless "Send error reports" is off in
// Settings, and also sends a panic of its Rust side at the next start (src-tauri/src/crash.rs).

import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "@scholarkit/editor/lib/platform";

const dsn = import.meta.env.VITE_SENTRY_DSN;
/** The browser build reports to its own server; the desktop app to the hosted one. */
const tunnel =
  import.meta.env.VITE_SENTRY_TUNNEL ||
  (isDesktop ? "https://app.scholarkit.app/api/monitoring" : "/api/monitoring");
const SETTING = "cursive.error-reports";

/** Whether this build can send error reports, and so shows the setting. */
export const reportsBuiltIn = Boolean(dsn);

/** The desktop app's "Send error reports" setting: on unless turned off. */
export function errorReportsOn(): boolean {
  try {
    return localStorage.getItem(SETTING) !== "off";
  } catch {
    return true;
  }
}

/** A panic in the desktop app's Rust side, kept until the next start. */
interface NativeCrash {
  message: string;
  location: string | null;
  version: string;
}

/** The SDK, loaded only when reports are on. */
let monitoring: Promise<typeof import("@scholarkit/monitoring/browser")> | undefined;

function load() {
  monitoring ??= import("@scholarkit/monitoring/browser").then((m) => {
    m.startBrowserMonitoring({
      dsn,
      tunnel,
      app: "cursive",
      platform: isDesktop ? "desktop" : "web",
      release: `cursive@${__APP_VERSION__}`,
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || "production",
    });
    return m;
  });
  return monitoring;
}

/** Starts error reporting when this build and the user's setting allow it. */
export async function startMonitoring(): Promise<void> {
  if (!dsn || (isDesktop && !errorReportsOn())) return;
  const m = await load();
  if (!isDesktop) return;
  const crash = await invoke<NativeCrash | null>("take_last_crash").catch(() => null);
  if (crash) {
    const error = new Error(crash.message);
    error.name = "Panic";
    m.reportError(error, {
      source: "rust",
      location: crash.location ?? "unknown",
      crashed_version: crash.version,
    });
  }
}

/** The "Send error reports" setting changed: start reporting, or hold every report back. */
export async function setErrorReports(on: boolean): Promise<void> {
  try {
    if (on) localStorage.removeItem(SETTING);
    else localStorage.setItem(SETTING, "off");
  } catch {
    // Storage is off: the setting lasts until the app closes.
  }
  if (!dsn) return;
  const m = on ? await load() : await monitoring;
  m?.allowReports(on);
}
