/**
 * Reading the pages an export draws. Word, PowerPoint and HTML are made
 * from the same pages the PDF prints, so citations, numbering, footnotes
 * and tutorial blocks read the same in every format.
 */

/** A piece of text with one look. */
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Set in the monospace face: inline code. */
  mono?: boolean;
  /** Hex without `#`, when it isn't the text color around it. */
  color?: string;
  /** Hex without `#`: highlighted text. */
  highlight?: string;
  href?: string;
  /** A footnote's number, where the note is cited. */
  footnote?: number;
  /** An equation in the text, as TeX. */
  math?: string;
  /** An image in the text. */
  image?: HTMLImageElement;
  /** A line break inside the paragraph. */
  lineBreak?: boolean;
}

let canvas: CanvasRenderingContext2D | null | undefined;
const hexes = new Map<string, string | null>();

/**
 * A CSS color as hex without `#`, laid over white, or null when it
 * can't be seen. The browser parses the color, whatever the notation.
 */
export function hex(color: string): string | null {
  const known = hexes.get(color);
  if (known !== undefined) return known;
  canvas ??= document.createElement("canvas").getContext("2d", {
    willReadFrequently: true,
  });
  let result: string | null = null;
  if (canvas) {
    canvas.clearRect(0, 0, 1, 1);
    canvas.fillStyle = "#fff";
    canvas.fillRect(0, 0, 1, 1);
    canvas.fillStyle = "#fff";
    canvas.fillStyle = color;
    canvas.fillRect(0, 0, 1, 1);
    const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data;
    result = [r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("");
  }
  // A transparent color leaves the white as it was.
  if (/^(transparent|rgba\([^)]*,\s*0\))$/.test(color.trim())) result = null;
  hexes.set(color, result);
  return result;
}

/** The text a `::before` or `::after` adds, or "" when it adds none. */
export function pseudoText(element: Element, which: "::before" | "::after"): string {
  const content = getComputedStyle(element, which).content;
  if (!content || content === "none" || content === "normal") return "";
  let text = "";
  const parts =
    content.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|attr\([^)]*\)/g) ?? [];
  for (const part of parts) {
    if (part.startsWith("attr(")) {
      text += element.getAttribute(part.slice(5, -1).trim()) ?? "";
    } else {
      text += part.slice(1, -1).replace(/\\(.)/g, "$1");
    }
  }
  return text;
}

/** Hidden from sight but there for screen readers, such as a checkbox's label. */
const offScreen = (element: Element) => {
  const style = (element as HTMLElement).style;
  return style?.position === "absolute" && style.width === "1px";
};

/** Elements a run of text leaves out. */
const SKIP = new Set(["LABEL", "BUTTON", "INPUT", "SVG", "svg", "STYLE", "SCRIPT"]);

/** The look of the text an element holds, compared with the paragraph's. */
function look(element: Element, base: CSSStyleDeclaration): Omit<Run, "text"> {
  const style = getComputedStyle(element);
  const weight = Number(style.fontWeight) || 400;
  const decoration = style.textDecorationLine;
  const color = style.color !== base.color ? hex(style.color) : null;
  const background = element.tagName === "MARK" ? hex(style.backgroundColor) : null;
  return {
    bold: weight >= 600 || undefined,
    italic: style.fontStyle === "italic" || undefined,
    underline: decoration.includes("underline") || undefined,
    strike: decoration.includes("line-through") || undefined,
    mono: /mono|courier|consolas|menlo/i.test(style.fontFamily) || undefined,
    color: color ?? undefined,
    highlight: background ?? undefined,
  };
}

/** Counts footnotes as the page numbers them: in order, from 1, per page. */
export class FootnoteCounter {
  private next = 1;
  take(): number {
    return this.next++;
  }
}

/**
 * The text of an element as runs, with bold, italic, links, footnote
 * marks and equations, in the order a reader reads them.
 */
export function inlineRuns(
  element: Element,
  footnotes: FootnoteCounter = new FootnoteCounter(),
): Run[] {
  const base = getComputedStyle(element);
  const runs: Run[] = [];
  const visit = (node: Node, inherited: Omit<Run, "text">) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/[\n\t]+/g, " ");
      if (text) runs.push({ ...inherited, text });
      return;
    }
    if (!(node instanceof Element)) return;
    if (SKIP.has(node.tagName) || offScreen(node)) return;
    if (node.classList.contains("katex-mathml")) return;
    if (node.tagName === "BR") {
      runs.push({ ...inherited, text: "", lineBreak: true });
      return;
    }
    if (node.classList.contains("footnote")) {
      runs.push({ ...inherited, text: "", footnote: footnotes.take() });
      return;
    }
    if (node.getAttribute("data-type") === "inline-math") {
      runs.push({
        ...inherited,
        text: "",
        math: node.getAttribute("data-latex") ?? "",
      });
      return;
    }
    // Tutorial blocks on paper: the boxes to tick and the gaps to fill.
    if (node.classList.contains("print-box")) {
      runs.push({
        ...inherited,
        text: node.classList.contains("print-round") ? "○ " : "☐ ",
      });
      return;
    }
    if (node.classList.contains("print-gap")) {
      runs.push({ ...inherited, text: " __________ " });
      return;
    }
    if (node.tagName === "IMG") {
      runs.push({ ...inherited, text: "", image: node as HTMLImageElement });
      return;
    }
    const own = node === element ? {} : look(node, base);
    const next: Omit<Run, "text"> = { ...inherited };
    for (const [key, value] of Object.entries(own)) {
      if (value !== undefined) (next as Record<string, unknown>)[key] = value;
    }
    const href = node.tagName === "A" ? node.getAttribute("href") : null;
    if (href && /^(https?:|mailto:)/i.test(href)) next.href = href;
    const before = pseudoText(node, "::before");
    if (before)
      runs.push({ ...next, ...pseudoLook(node, "::before", base), text: before });
    node.childNodes.forEach((child) => visit(child, next));
    const after = pseudoText(node, "::after");
    if (after)
      runs.push({ ...next, ...pseudoLook(node, "::after", base), text: after });
  };
  visit(element, {});
  return trim(runs);
}

function pseudoLook(
  element: Element,
  which: "::before" | "::after",
  base: CSSStyleDeclaration,
): Omit<Run, "text"> {
  const style = getComputedStyle(element, which);
  const color = style.color !== base.color ? hex(style.color) : null;
  return {
    bold: (Number(style.fontWeight) || 400) >= 600 || undefined,
    color: color ?? undefined,
  };
}

/** Runs without the spaces HTML wouldn't show at the start and end. */
function trim(runs: Run[]): Run[] {
  const out = runs.map((run) => ({ ...run, text: run.text.replace(/ {2,}/g, " ") }));
  const first = out.find((run) => run.text || !isText(run));
  if (first && isText(first)) first.text = first.text.trimStart();
  const last = [...out].reverse().find((run) => run.text || !isText(run));
  if (last && isText(last)) last.text = last.text.trimEnd();
  return out.filter((run) => run.text || !isText(run));
}

const isText = (run: Run) =>
  !run.lineBreak && run.footnote === undefined && run.math === undefined && !run.image;

/** The plain text of runs, equations as their TeX. */
export const plainText = (runs: Run[]) =>
  runs
    .map((run) =>
      run.lineBreak
        ? "\n"
        : run.footnote !== undefined
          ? String(run.footnote)
          : run.math !== undefined
            ? texText(run.math)
            : run.text,
    )
    .join("");

/**
 * An equation in the text as plain characters, for a place that can't
 * hold a picture: simple TeX reads well this way, the rest keeps its TeX.
 */
export function texText(tex: string): string {
  const symbols: Record<string, string> = {
    alpha: "α",
    beta: "β",
    gamma: "γ",
    delta: "δ",
    epsilon: "ε",
    theta: "θ",
    lambda: "λ",
    mu: "μ",
    pi: "π",
    rho: "ρ",
    sigma: "σ",
    tau: "τ",
    phi: "φ",
    chi: "χ",
    psi: "ψ",
    omega: "ω",
    Delta: "Δ",
    Sigma: "Σ",
    Omega: "Ω",
    times: "×",
    cdot: "·",
    pm: "±",
    leq: "≤",
    geq: "≥",
    le: "≤",
    ge: "≥",
    neq: "≠",
    approx: "≈",
    infty: "∞",
    sum: "∑",
    int: "∫",
    to: "→",
    rightarrow: "→",
    in: "∈",
    sqrt: "√",
    ldots: "…",
    dots: "…",
  };
  let text = tex
    .replace(/\\bar\{(\w)\}/g, "$1̄")
    .replace(/\\hat\{(\w)\}/g, "$1̂")
    .replace(/\\(?:text|mathrm|mathit|mathbf|operatorname)\{([^{}]*)\}/g, "$1")
    .replace(/\\([A-Za-z]+)/g, (whole, name: string) => symbols[name] ?? whole)
    .replace(/\\[,;:! ]/g, " ");
  const sub: Record<string, string> = {
    "0": "₀",
    "1": "₁",
    "2": "₂",
    "3": "₃",
    "4": "₄",
    "5": "₅",
    "6": "₆",
    "7": "₇",
    "8": "₈",
    "9": "₉",
    i: "ᵢ",
    j: "ⱼ",
    n: "ₙ",
    k: "ₖ",
  };
  const sup: Record<string, string> = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
    n: "ⁿ",
    i: "ⁱ",
    "-": "⁻",
    "+": "⁺",
  };
  const script = (map: Record<string, string>) => (whole: string, body: string) =>
    [...body].every((ch) => ch in map)
      ? [...body].map((ch) => map[ch]).join("")
      : whole;
  text = text
    .replace(/_\{([^{}]*)\}|_(\w)/g, (whole, a?: string, b?: string) =>
      script(sub)(whole, a ?? b ?? ""),
    )
    .replace(/\^\{([^{}]*)\}|\^(\w|-)/g, (whole, a?: string, b?: string) =>
      script(sup)(whole, a ?? b ?? ""),
    );
  return /[\\{}^_]/.test(text) ? tex : text;
}

/** The bytes of an image the page shows, as a format Word and PowerPoint read. */
export interface Picture {
  data: Uint8Array;
  type: "png" | "jpg" | "gif";
  /** Its size in CSS pixels. */
  width: number;
  height: number;
}

const kindOf = (bytes: Uint8Array): Picture["type"] | null => {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "gif";
  return null;
};

/** The image's own bytes when Word reads them, else a PNG drawn from it. */
export async function picture(img: HTMLImageElement): Promise<Picture | null> {
  if (!img.complete || img.naturalWidth === 0) {
    await img.decode().catch(() => {});
  }
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) return null;
  try {
    const response = await fetch(img.currentSrc || img.src);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const type = kindOf(bytes);
    if (type) return { data: bytes, type, width, height };
  } catch {
    // Not readable as bytes, such as an image from another site: draw it.
  }
  return drawn(img, width, height);
}

/** An image drawn to a PNG, at its own size. */
export async function drawn(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Picture | null> {
  const board = document.createElement("canvas");
  board.width = Math.max(1, Math.round(width));
  board.height = Math.max(1, Math.round(height));
  const context = board.getContext("2d");
  if (!context) return null;
  try {
    context.drawImage(source, 0, 0, board.width, board.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      board.toBlob(resolve, "image/png"),
    );
    if (!blob) return null;
    return {
      data: new Uint8Array(await blob.arrayBuffer()),
      type: "png",
      width,
      height,
    };
  } catch {
    // An image from another site that the browser won't let us read.
    return null;
  }
}

/** Bytes as base64, for the places that take a data address. */
export function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
