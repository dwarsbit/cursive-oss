import type { ExportJob } from "./job";
import { t } from "@scholarkit/i18n";

/**
 * An export as one HTML file that opens in any browser, offline: the
 * pages the PDF prints, with their styles, images and typefaces inside
 * the file.
 */

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(t("A file couldn't be read.")));
    reader.readAsDataURL(blob);
  });

/** A file the page loads, as an address that holds its bytes; the address itself when it can't be read. */
async function inlined(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  try {
    const response = await fetch(url);
    if (!response.ok) return url;
    return await dataUrl(await response.blob());
  } catch {
    return url;
  }
}

const unquote = (value: string) => value.trim().replace(/^(["'])(.*)\1$/, "$2");

/** Does a typeface rule describe a face the page loaded? Only those go into the file. */
function loaded(rule: CSSFontFaceRule): boolean {
  const family = unquote(rule.style.getPropertyValue("font-family"));
  const range = rule.style
    .getPropertyValue("unicode-range")
    .replace(/\s+/g, "")
    .toLowerCase();
  const style = rule.style.getPropertyValue("font-style") || "normal";
  for (const face of document.fonts) {
    if (face.status !== "loaded" || unquote(face.family) !== family) continue;
    const faceRange = face.unicodeRange.replace(/\s+/g, "").toLowerCase();
    if (range && faceRange !== "u+0-10ffff" && faceRange !== range) continue;
    if ((face.style || "normal") !== style) continue;
    return true;
  }
  return false;
}

/** The app's styles, with the typefaces the export uses inside them. */
async function styles(): Promise<string> {
  const out: string[] = [];
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    const base = sheet.href ?? document.baseURI;
    for (const rule of rules) {
      if (rule instanceof CSSFontFaceRule) {
        if (!loaded(rule)) continue;
        let text = rule.cssText;
        const urls = [...text.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)];
        for (const [whole, , url] of urls) {
          const inline = await inlined(new URL(url, base).href);
          text = text.replace(whole, `url("${inline}")`);
        }
        out.push(text);
      } else {
        out.push(rule.cssText);
      }
    }
  }
  return out.join("\n");
}

/** The export's pages on their own: no editing, no screen-only parts. */
async function pages(root: HTMLElement): Promise<string> {
  const copy = root.cloneNode(true) as HTMLElement;
  copy.removeAttribute("aria-hidden");
  copy.querySelectorAll("[contenteditable]").forEach((element) => {
    element.removeAttribute("contenteditable");
    element.removeAttribute("role");
    element.removeAttribute("translate");
  });
  copy.querySelectorAll("button, style").forEach((element) => element.remove());
  copy
    .querySelectorAll<HTMLInputElement>('li[data-checked] input[type="checkbox"]')
    .forEach((box) => {
      if (box.closest("li")?.getAttribute("data-checked") === "true") {
        box.setAttribute("checked", "");
      }
      box.setAttribute("disabled", "");
    });
  const originals = root.querySelectorAll("img");
  const copies = copy.querySelectorAll("img");
  for (let i = 0; i < copies.length; i++) {
    const src = originals[i]?.currentSrc || originals[i]?.src;
    if (src) copies[i].setAttribute("src", await inlined(src));
    copies[i].removeAttribute("draggable");
  }
  return copy.outerHTML;
}

const escape = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (ch) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[ch]};`,
  );

/** What the file adds to the app's styles: the pages in view, in a column. */
const PAGE_STYLE = `
html, body { height: auto; min-height: 0; overflow: visible; background: #fff; }
body { margin: 0; }
.print-root {
  position: static; z-index: auto; width: auto; max-width: 672px; height: auto;
  margin: 0 auto; padding: 48px 16px 64px; overflow: visible; visibility: visible;
  pointer-events: auto;
}
.print-root .print-part, .print-root .print-cover { margin-bottom: 64px; }
.print-paper .print-slide { max-width: 100%; }
.print-root .slide { contain: none; }
@media print {
  .print-root { max-width: none; padding: 0; }
  .print-root .print-part, .print-root .print-cover { margin-bottom: 0; }
}
`;

/**
 * The export as the text of one HTML file. `pageStyle` sets the sheet it
 * prints on; without it, the reader picks it in the print window.
 */
export async function makeHtml(
  root: HTMLElement,
  job: ExportJob,
  pageStyle?: string,
): Promise<string> {
  const [css, body] = await Promise.all([styles(), pages(root)]);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="generator" content="Cursive">',
    `<title>${escape(job.name)}</title>`,
    `<style>${css}</style>`,
    `<style>${PAGE_STYLE}${pageStyle ?? ""}</style>`,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
  ].join("\n");
}
