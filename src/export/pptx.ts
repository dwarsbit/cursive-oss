import type PptxGenJS from "pptxgenjs";
import {
  base64,
  FootnoteCounter,
  hex,
  inlineRuns,
  picture,
  texText,
  type Run,
} from "./dom";
import type { ExportJob } from "./job";
import { equationPicture } from "./math";

/**
 * Presentations as PowerPoint files: one slide for each slide, with
 * every block where Cursive draws it, as text PowerPoint edits. The
 * places come from the slides the PDF prints, so the layouts match.
 * Text is set in Arial, which every computer has.
 */

type Slide = PptxGenJS.Slide;
type TextProps = PptxGenJS.TextProps;

const FONT = "Arial";
const MONO = "Courier New";
/** A slide is 960 by 540 pixels and 10 by 5.625 inches. */
const INCH = 96;
const pt = (px: number) => Math.round(px * 0.75 * 10) / 10;

interface Place {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where an element sits on its slide, in inches. */
const placeOf = (element: Element, page: DOMRect): Place => {
  const r = element.getBoundingClientRect();
  return {
    x: (r.left - page.left) / INCH,
    y: (r.top - page.top) / INCH,
    w: Math.max(r.width, 1) / INCH,
    h: Math.max(r.height, 1) / INCH,
  };
};

/** One paragraph of a text box: its runs and how it is set. */
interface Para {
  runs: Run[];
  element: Element;
  level?: number;
  bullet?: "bullet" | "number";
}

const BLOCK =
  /^(P|H[1-6]|UL|OL|LI|DIV|BLOCKQUOTE|PRE|TABLE|FIGURE|DL|DT|DD|SECTION|HR)$/;

/** The paragraphs inside an element: those of lists keep their level and mark. */
function parasOf(element: Element, counter: FootnoteCounter, level = 0): Para[] {
  const tag = element.tagName;
  if (tag === "UL" || tag === "OL") {
    const plain =
      element.getAttribute("data-type") === "taskList" ||
      element.classList.contains("print-options");
    const out: Para[] = [];
    for (const item of element.children) {
      const checked = item.getAttribute("data-checked");
      const holder =
        checked !== null ? (item.querySelector(":scope > div") ?? item) : item;
      let first = true;
      const parts = [...holder.children];
      // An item with only text in it, such as a quiz option, is its own paragraph.
      for (const part of parts.some((child) => BLOCK.test(child.tagName))
        ? parts
        : [holder]) {
        if (part.tagName === "UL" || part.tagName === "OL") {
          out.push(...parasOf(part, counter, level + 1));
          continue;
        }
        const runs = inlineRuns(part, counter);
        if (checked !== null && first)
          runs.unshift({ text: checked === "true" ? "☑ " : "☐ " });
        out.push({
          runs,
          element: part,
          level,
          bullet: first && !plain ? (tag === "OL" ? "number" : "bullet") : undefined,
        });
        first = false;
      }
    }
    return out;
  }
  const children = [...element.children].filter(
    (child) => BLOCK.test(child.tagName) && !child.classList.contains("footnotes"),
  );
  if (children.length === 0 || tag === "P" || /^H\d$/.test(tag)) {
    const runs = inlineRuns(element, counter);
    return runs.length ? [{ runs, element }] : [];
  }
  return children.flatMap((child) => parasOf(child, counter, level));
}

/** Paragraphs as PowerPoint text. */
function textOf(paras: Para[], tint: string): TextProps[] {
  const out: TextProps[] = [];
  paras.forEach((para, index) => {
    const style = getComputedStyle(para.element);
    const size = parseFloat(style.fontSize) || 21;
    const height = parseFloat(style.lineHeight) || size * 1.3;
    const shared: PptxGenJS.TextPropsOptions = {
      fontFace: FONT,
      fontSize: pt(size),
      color: hex(style.color) ?? "000000",
      bold: (Number(style.fontWeight) || 400) >= 600,
      align:
        style.textAlign === "center"
          ? "center"
          : style.textAlign === "right"
            ? "right"
            : "left",
      lineSpacingMultiple: Math.round((height / (size * 1.2)) * 100) / 100,
      paraSpaceBefore: index === 0 ? 0 : pt(parseFloat(style.marginTop) || 0),
      bullet: para.bullet
        ? para.bullet === "number"
          ? { type: "number", indent: pt(size * 1.3) }
          : { indent: pt(size * 1.1) }
        : undefined,
      indentLevel: para.level,
    };
    const runs = para.runs.length ? para.runs : [{ text: "" }];
    runs.forEach((run, at) => {
      const last = at === runs.length - 1 && index < paras.length - 1;
      const text = run.lineBreak
        ? "\n"
        : run.footnote !== undefined
          ? String(run.footnote)
          : run.math !== undefined
            ? texText(run.math)
            : run.text;
      if (run.image) return;
      out.push({
        text,
        options: {
          ...shared,
          bold: run.bold ?? shared.bold,
          italic: run.italic,
          underline: run.underline || run.href ? { style: "sng" } : undefined,
          strike: run.strike ? "sngStrike" : undefined,
          fontFace: run.mono ? MONO : FONT,
          color: run.color ?? (run.footnote !== undefined ? tint : shared.color),
          highlight: run.highlight,
          superscript: run.footnote !== undefined || undefined,
          hyperlink: run.href ? { url: run.href } : undefined,
          breakLine: last || undefined,
        },
      });
    });
  });
  return out;
}

const TEXT_BOX: PptxGenJS.TextPropsOptions = {
  margin: 0,
  valign: "top",
  wrap: true,
  fit: "none",
};

/** An image as PowerPoint takes it: its type and base64 bytes. */
const dataOf = (data: Uint8Array, type: string) =>
  `image/${type === "jpg" ? "jpeg" : type};base64,${base64(data)}`;

interface Look {
  tint: string;
  line: string;
  ink: string;
  muted: string;
}

async function block(
  pptx: PptxGenJS,
  slide: Slide,
  element: Element,
  page: DOMRect,
  counter: FootnoteCounter,
  look: Look,
): Promise<void> {
  const tag = element.tagName;
  const place = placeOf(element, page);
  const style = getComputedStyle(element);

  const figure = element.matches("figure")
    ? element
    : element.querySelector(":scope > figure");
  if (figure) {
    const img = figure.querySelector("img");
    if (img) {
      const image = await picture(img);
      if (image) {
        slide.addImage({
          data: dataOf(image.data, image.type),
          ...placeOf(img, page),
          altText: img.alt,
        });
      }
    }
    const caption = figure.querySelector("figcaption");
    if (caption) {
      slide.addText(textOf(parasOf(caption, counter), look.tint), {
        ...TEXT_BOX,
        ...placeOf(caption, page),
      });
    }
    return;
  }

  const math = element.matches('[data-type="block-math"]')
    ? element
    : element.querySelector(':scope > [data-type="block-math"]');
  if (math) {
    const tex = math.getAttribute("data-latex") ?? "";
    const size = parseFloat(getComputedStyle(math).fontSize) || 21;
    const image = await equationPicture(tex, true, size, look.ink);
    const box = placeOf(math, page);
    if (image) {
      const w = image.width / INCH;
      const h = image.height / INCH;
      slide.addImage({
        data: dataOf(image.data, "png"),
        x: box.x + (box.w - w) / 2,
        y: box.y + (box.h - h) / 2,
        w,
        h,
        altText: tex,
      });
    } else {
      slide.addText(tex, {
        ...TEXT_BOX,
        ...box,
        fontFace: MONO,
        fontSize: pt(size),
        align: "center",
      });
    }
    const number = math.getAttribute("data-number");
    if (number) {
      slide.addText(number, {
        ...TEXT_BOX,
        x: box.x + box.w - 1,
        y: box.y,
        w: 0.9,
        h: box.h,
        valign: "middle",
        align: "right",
        fontFace: FONT,
        fontSize: pt(14),
        color: look.muted,
      });
    }
    return;
  }

  const pre = tag === "PRE" ? element : element.querySelector("pre");
  if (pre && (tag === "PRE" || element.classList.contains("code-block"))) {
    const preStyle = getComputedStyle(pre);
    const fill =
      hex(preStyle.backgroundColor) ?? hex(style.backgroundColor) ?? "f4f2f4";
    const size = parseFloat(preStyle.fontSize) || 15;
    const pad = (side: string) =>
      pt(parseFloat(preStyle.getPropertyValue(`padding-${side}`)) || 0);
    const height = parseFloat(preStyle.lineHeight) || size * 1.4;
    slide.addText([{ text: (pre.textContent ?? "").replace(/\n$/, "") }], {
      ...TEXT_BOX,
      ...placeOf(pre, page),
      fill: { color: fill },
      // PowerPoint's order: left, right, bottom, top.
      margin: [pad("left") || 4, pad("right") || 4, pad("bottom"), pad("top")],
      fontFace: MONO,
      fontSize: pt(size),
      lineSpacingMultiple: Math.round((height / (size * 1.2)) * 100) / 100,
      color: look.ink,
    });
    return;
  }

  const table = tag === "TABLE" ? element : element.querySelector("table");
  if (table) {
    const rows = [...table.querySelectorAll("tr")];
    const first = rows[0] ? [...rows[0].children] : [];
    const size = parseFloat(getComputedStyle(table).fontSize) || 17;
    const line = { type: "solid" as const, pt: 0.75, color: look.line };
    slide.addTable(
      rows.map((row) =>
        [...row.children].map((cell) => {
          const head = cell.tagName === "TH";
          const text = textOf(parasOf(cell, counter), look.tint);
          return {
            text: text.length ? text : "",
            options: {
              fontFace: FONT,
              fontSize: pt(parseFloat(getComputedStyle(cell).fontSize) || size),
              bold: head || undefined,
              fill: head ? { color: "f4f2f4" } : undefined,
              colspan: Number(cell.getAttribute("colspan")) || undefined,
              valign: "top" as const,
              // PowerPoint's order: left, right, bottom, top.
              margin: [pt(8), pt(8), pt(4), pt(4)] as [number, number, number, number],
            },
          };
        }),
      ),
      {
        ...placeOf(table, page),
        colW: first.map((cell) => cell.getBoundingClientRect().width / INCH),
        rowH: rows.map((row) => row.getBoundingClientRect().height / INCH),
        border: line,
      },
    );
    return;
  }

  if (tag === "HR") {
    slide.addShape(pptx.ShapeType.line, {
      x: place.x,
      y: place.y + place.h / 2,
      w: place.w,
      h: 0,
      line: { color: look.line, width: 0.75 },
    });
    return;
  }

  // A box drawn around blocks, such as a callout or a tutorial block.
  const fill = hex(style.backgroundColor);
  const border =
    parseFloat(style.borderTopWidth) > 0 ? hex(style.borderTopColor) : null;
  if ((fill && fill !== "ffffff") || border) {
    slide.addShape(pptx.ShapeType.roundRect, {
      ...place,
      fill: fill ? { color: fill } : undefined,
      line: border ? { color: border, width: 0.75 } : { type: "none" },
      rectRadius: Math.min(0.1, (parseFloat(style.borderTopLeftRadius) || 0) / INCH),
    });
    const inner = element.classList.contains("callout")
      ? (element.querySelector(":scope > div") ?? element)
      : element;
    const innerPlace = placeOf(inner, page);
    const padX = inner === element ? (parseFloat(style.paddingLeft) || 0) / INCH : 0;
    const padY = inner === element ? (parseFloat(style.paddingTop) || 0) / INCH : 0;
    slide.addText(textOf(parasOf(inner, counter), look.tint), {
      ...TEXT_BOX,
      x: innerPlace.x + padX,
      y: innerPlace.y + padY,
      w: innerPlace.w - 2 * padX,
      h: innerPlace.h - 2 * padY,
    });
    return;
  }

  // A quote is drawn with its rule; anything else is its text.
  if (tag === "BLOCKQUOTE" && parseFloat(style.borderLeftWidth) > 0) {
    slide.addShape(pptx.ShapeType.rect, {
      x: place.x,
      y: place.y,
      w: parseFloat(style.borderLeftWidth) / INCH,
      h: place.h,
      fill: { color: hex(style.borderLeftColor) ?? look.ink },
      line: { type: "none" },
    });
  }
  const paras = parasOf(element, counter);
  if (paras.length === 0) return;
  const inset =
    tag === "BLOCKQUOTE"
      ? (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.borderLeftWidth) || 0)
      : 0;
  slide.addText(textOf(paras, look.tint), {
    ...TEXT_BOX,
    x: place.x + inset / INCH,
    y: place.y,
    // A little room, as Arial sets some lines wider than the app's typeface.
    w: place.w - inset / INCH + 0.15,
    h: place.h,
  });
}

/** The short rule a title slide has above its text. */
function titleRule(pptx: PptxGenJS, slide: Slide, doc: Element, page: DOMRect) {
  const rule = getComputedStyle(doc, "::before");
  if (rule.content === "none" || rule.content === "normal") return;
  const width = parseFloat(rule.width);
  const height = parseFloat(rule.height);
  const first = doc.firstElementChild;
  if (!width || !height || !first) return;
  const top =
    first.getBoundingClientRect().top -
    (parseFloat(getComputedStyle(first).marginTop) || 0) -
    (parseFloat(rule.marginBottom) || 0) -
    height;
  const left =
    doc.getBoundingClientRect().left +
    (parseFloat(getComputedStyle(doc).paddingLeft) || 0);
  slide.addShape(pptx.ShapeType.roundRect, {
    x: (left - page.left) / INCH,
    y: (top - page.top) / INCH,
    w: width / INCH,
    h: height / INCH,
    fill: { color: hex(rule.backgroundColor) ?? "9a4a1c" },
    line: { type: "none" },
    rectRadius: height / 2 / INCH,
  });
}

/** One slide of the export, drawn into PowerPoint's. */
async function drawSlide(pptx: PptxGenJS, element: Element, notes: string, look: Look) {
  const slide = pptx.addSlide();
  const pageElement = element.querySelector(".slide-page");
  if (!pageElement) return;
  const page = pageElement.getBoundingClientRect();
  slide.background = {
    color:
      hex(
        getComputedStyle(element.querySelector(".slide") ?? pageElement)
          .backgroundColor,
      ) ?? "ffffff",
  };
  const doc = pageElement.querySelector(".doc");
  const counter = new FootnoteCounter();
  if (doc) {
    titleRule(pptx, slide, doc, page);
    for (const child of doc.children) {
      await block(pptx, slide, child, page, counter, look);
    }
  }
  const footnotes = pageElement.querySelector("ol.footnotes");
  if (footnotes && footnotes.children.length) {
    const place = placeOf(footnotes, page);
    slide.addShape(pptx.ShapeType.line, {
      x: place.x,
      y: place.y,
      w: 120 / INCH,
      h: 0,
      line: { color: look.line, width: 0.75 },
    });
    const paras: Para[] = [...footnotes.children].map((item, index) => ({
      runs: [{ text: `${index + 1}  ` }, ...inlineRuns(item)],
      element: item,
    }));
    slide.addText(textOf(paras, look.tint), {
      ...TEXT_BOX,
      x: place.x,
      y: place.y + (parseFloat(getComputedStyle(footnotes).paddingTop) || 0) / INCH,
      w: place.w,
      h: place.h,
    });
  }
  for (const span of pageElement.querySelectorAll(".slide-foot > span")) {
    const style = getComputedStyle(span);
    const last = span === span.parentElement?.lastElementChild;
    slide.addText(span.textContent ?? "", {
      ...TEXT_BOX,
      ...placeOf(span, page),
      w: last ? 1 : placeOf(span, page).w + 0.2,
      x: last
        ? placeOf(span, page).x + placeOf(span, page).w - 1
        : placeOf(span, page).x,
      align: last ? "right" : "left",
      fontFace: FONT,
      fontSize: pt(parseFloat(style.fontSize) || 12),
      color: hex(style.color) ?? look.muted,
    });
  }
  if (notes.trim()) slide.addNotes(notes.trim());
}

/** Each presentation in the export as a .pptx file, by its title. */
export async function makePptx(
  root: HTMLElement,
  job: ExportJob,
): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  const { default: Pptx } = await import("pptxgenjs");
  const style = getComputedStyle(root);
  const token = (name: string, fallback: string) =>
    hex(style.getPropertyValue(name).trim() || fallback) ?? fallback.slice(1);
  const look: Look = {
    tint: token("--tint", "#9a4a1c"),
    line: token("--border", "#e4e0e4"),
    ink: hex(style.color) ?? "1b141a",
    muted: token("--muted-foreground", "#6e636c"),
  };
  const files: Array<{ name: string; bytes: Uint8Array }> = [];
  for (const [index, part] of job.parts.entries()) {
    if (part.kind !== "slides") continue;
    const pptx = new Pptx();
    pptx.layout = "LAYOUT_16x9";
    pptx.title = part.title;
    pptx.company = "";
    pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
    const sheets = root.querySelectorAll(`.print-slide[data-part="${index}"]`);
    for (const [at, sheet] of [...sheets].entries()) {
      await drawSlide(pptx, sheet, part.slides[at]?.notes ?? "", look);
    }
    const bytes = (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
    files.push({ name: part.title, bytes });
  }
  return files;
}
