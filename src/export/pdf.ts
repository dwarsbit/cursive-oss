import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "@/lib/desktop-store";
import { makeHtml } from "./html";
import { fileName, sheetRule, type ExportJob, type Sheet } from "./job";
import { saveExport } from "./save";
import { t } from "@scholarkit/i18n";

/**
 * A PDF saved with no print window. The desktop app's own webview prints
 * the pages to the file the reader picks. In the browser the server prints
 * them: the pages go to it as one HTML file, as the HTML export makes it,
 * and the PDF comes back as a download.
 */

/**
 * WebKit (macOS, Linux) lays pages out within the margins the printing
 * gives it and ignores those a page sets. Chromium (Windows, the server)
 * uses the page's own, so the page carries them there too.
 */
export const marginsInCss = () =>
  !isDesktop ||
  (typeof navigator !== "undefined" && /Windows/.test(navigator.userAgent));

/** The page rule the pages are drawn with for a PDF on this sheet. */
export const pdfPageStyle = (sheet: Sheet) => sheetRule(sheet, marginsInCss());

/** What the server's answer means for the reader. */
async function problemOf(response: Response): Promise<string> {
  let message = "";
  try {
    const body = (await response.json()) as { message?: string };
    message = typeof body.message === "string" ? body.message : "";
  } catch {
    // Not the API's JSON: a proxy's error page, for one.
  }
  if (response.status === 401)
    return t(
      "Sign in to save a PDF here, or choose Print… and save it from the print window.",
    );
  if (response.status === 404)
    return t(
      "This server doesn’t make PDFs. Choose Print… and save it from the print window.",
    );
  return message || t("The server answered {status}.", { status: response.status });
}

/** Saves the export as a PDF. Gives the saved file's name, or null when the reader cancels. */
export async function savePdf(
  root: HTMLElement,
  job: ExportJob,
  sheet: Sheet,
): Promise<string | null> {
  const name = fileName(job.name);
  if (isDesktop) return invoke<string | null>("export_pdf", { name, sheet });
  const html = await makeHtml(root, job, sheetRule(sheet, true));
  let response: Response;
  try {
    response = await fetch("/api/pdf", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "text/html; charset=utf-8" },
      body: html,
    });
  } catch {
    throw new Error(t("The server can’t be reached. Check your connection."));
  }
  if (!response.ok) throw new Error(await problemOf(response));
  const bytes = new Uint8Array(await response.arrayBuffer());
  return saveExport({ name, extension: "pdf", bytes });
}
