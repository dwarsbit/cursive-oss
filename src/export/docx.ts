import type {
  IParagraphOptions,
  Paragraph,
  ParagraphChild,
  Table as DocxTable,
} from "docx";
import { FootnoteCounter, hex, inlineRuns, picture, texText, type Run } from "./dom";
import type { ExportJob } from "./job";
import { equationPicture } from "./math";

/**
 * An export as a Word document, made from the pages the PDF prints:
 * Word's own headings, lists, tables, footnotes and captions, so the
 * reader edits it as any other Word document. Equations are pictures,
 * with their TeX as the alt text.
 */

type Docx = typeof import("docx");
/** What a Word document's body and table cells hold. */
type FileChild = Paragraph | DocxTable;

/** A4 with 25 mm margins: the text is 160 mm wide, in twips. */
const TEXT_WIDTH = 9070;
/** The PDF's pages are 672 pixels wide; Word's text is 605. */
const SCALE = 605 / 672;
const FONT = "Arial";
const MONO = "Courier New";
const BODY_PX = (11 * 96) / 72;

interface Box {
  /** A tinted box, such as a callout, around the paragraphs. */
  shading?: string;
  border?: string;
  /** Extra indent, in twips. */
  indent?: number;
  /** Close together, as in a table cell. */
  tight?: boolean;
}

class Writer {
  footnotes: Record<string, { children: Paragraph[] }> = {};
  private nextNote = 1;
  private nextList = 1;
  ink: string;
  muted: string;
  line: string;

  constructor(
    readonly d: Docx,
    root: HTMLElement,
  ) {
    const style = getComputedStyle(root);
    this.ink = hex(style.color) ?? "1b141a";
    this.muted =
      hex(style.getPropertyValue("--muted-foreground").trim() || "#6e636c") ?? "6e636c";
    this.line = hex(style.getPropertyValue("--border").trim() || "#e4e0e4") ?? "e4e0e4";
  }

  listInstance() {
    return this.nextList++;
  }

  /** A footnote from the item that holds its text; gives its number in the document. */
  async footnote(item: Element | undefined): Promise<number> {
    const id = this.nextNote++;
    const runs = item ? inlineRuns(item) : [{ text: "" }];
    this.footnotes[id] = {
      children: [new this.d.Paragraph({ children: await this.runs(runs, null) })],
    };
    return id;
  }

  /** Runs as Word's, with links, footnotes and equations. */
  async runs(
    runs: Run[],
    notes: Element[] | null,
    extra: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {},
  ): Promise<ParagraphChild[]> {
    const { d } = this;
    const out: ParagraphChild[] = [];
    for (const run of runs) {
      if (run.lineBreak) {
        out.push(new d.TextRun({ text: "", break: 1 }));
        continue;
      }
      if (run.footnote !== undefined) {
        if (notes) {
          out.push(
            new d.FootnoteReferenceRun(await this.footnote(notes[run.footnote - 1])),
          );
        }
        continue;
      }
      if (run.math !== undefined) {
        const image = await equationPicture(run.math, false, BODY_PX, this.ink);
        out.push(
          image
            ? new d.ImageRun({
                type: "png",
                data: image.data,
                transformation: { width: image.width, height: image.height },
                altText: { name: "Equation", description: run.math },
              })
            : new d.TextRun({ text: texText(run.math), font: FONT }),
        );
        continue;
      }
      if (run.image) {
        const shown = run.image.getBoundingClientRect();
        const image = await picture(run.image);
        if (image) {
          out.push(
            new d.ImageRun({
              type: image.type,
              data: image.data,
              transformation: {
                width: Math.max(1, shown.width * SCALE),
                height: Math.max(1, shown.height * SCALE),
              },
              altText: { name: "Image", description: run.image.alt },
            }),
          );
        }
        continue;
      }
      const text = new d.TextRun({
        text: run.text,
        bold: run.bold ?? extra.bold,
        italics: run.italic ?? extra.italics,
        underline: run.underline && !run.href ? {} : undefined,
        strike: run.strike,
        font: run.mono ? MONO : undefined,
        color: run.color ?? extra.color,
        size: extra.size,
        shading: run.highlight
          ? { type: d.ShadingType.CLEAR, fill: run.highlight, color: "auto" }
          : undefined,
        style: run.href ? "Hyperlink" : undefined,
      });
      out.push(
        run.href ? new d.ExternalHyperlink({ link: run.href, children: [text] }) : text,
      );
    }
    return out;
  }

  paragraph(options: IParagraphOptions, box: Box) {
    const { d } = this;
    return new d.Paragraph({
      ...options,
      spacing: box.tight ? { ...options.spacing, after: 40 } : options.spacing,
      indent: box.indent
        ? {
            ...options.indent,
            left: ((options.indent?.left as number) ?? 0) + box.indent,
          }
        : options.indent,
      shading: box.shading
        ? { type: d.ShadingType.CLEAR, fill: box.shading, color: "auto" }
        : options.shading,
      border: box.border
        ? {
            left: {
              style: d.BorderStyle.SINGLE,
              size: 18,
              color: box.border,
              space: 8,
            },
          }
        : options.border,
    });
  }
}

/** The footnotes a page's blocks cite: the list the page shows under them. */
function notesOf(doc: Element): Element[] {
  const list = doc.parentElement?.nextElementSibling;
  return list?.matches("ol.footnotes") ? [...list.children] : [];
}

const HEADINGS = ["H1", "H2", "H3"];
const BLOCKISH = /^(P|H[1-6]|UL|OL|DIV|FIGURE|TABLE|PRE|BLOCKQUOTE|DL)$/;

/** The blocks inside an element, as Word's paragraphs and tables. */
async function blocks(
  w: Writer,
  parent: Element,
  notes: Element[] | null,
  counter: FootnoteCounter,
  box: Box = {},
): Promise<FileChild[]> {
  const out: FileChild[] = [];
  for (const element of parent.children) {
    out.push(...(await block(w, element, notes, counter, box)));
  }
  return out;
}

async function block(
  w: Writer,
  element: Element,
  notes: Element[] | null,
  counter: FootnoteCounter,
  box: Box,
): Promise<FileChild[]> {
  const { d } = w;
  const tag = element.tagName;
  const has = (name: string) => element.classList.contains(name);

  if (tag === "STYLE" || tag === "BUTTON" || has("footnotes") || has("slide-foot")) {
    return [];
  }
  // The editor in a page, or a page in a page: a fresh count of footnotes.
  if (has("doc")) {
    return blocks(w, element, notesOf(element), new FootnoteCounter(), box);
  }
  if (HEADINGS.includes(tag)) {
    const level = HEADINGS.indexOf(tag) + 1;
    const heading = [
      d.HeadingLevel.HEADING_2,
      d.HeadingLevel.HEADING_3,
      d.HeadingLevel.HEADING_4,
    ][level - 1];
    return [
      w.paragraph(
        {
          heading,
          keepNext: true,
          children: await w.runs(inlineRuns(element, counter), notes),
        },
        box,
      ),
    ];
  }
  if (tag === "P") {
    const runs = inlineRuns(element, counter);
    if (runs.length === 0) return [];
    if (has("print-block-kind")) {
      const [kind, ...rest] = element.childNodes;
      const note = rest.map((node) => node.textContent ?? "").join("");
      return [
        w.paragraph(
          {
            keepNext: true,
            children: [
              new d.TextRun({
                text: kind?.textContent ?? "",
                bold: true,
                color: hex(getComputedStyle(element).color) ?? undefined,
                size: 18,
              }),
              ...(note
                ? [new d.TextRun({ text: `  ·  ${note}`, color: w.muted, size: 18 })]
                : []),
            ],
          },
          box,
        ),
      ];
    }
    const caption = has("tbl-caption") || has("figure-caption");
    const quiet = has("print-block-hint") || has("print-notes");
    return [
      w.paragraph(
        {
          style: caption ? "Caption" : undefined,
          keepNext: has("tbl-caption") ? false : undefined,
          indent: has("bib-entry") ? { left: 567, hanging: 567 } : undefined,
          children: await w.runs(runs, notes, {
            italics: has("print-notes") || undefined,
            color: quiet ? w.muted : undefined,
            bold: has("print-block-title") || undefined,
          }),
        },
        box,
      ),
    ];
  }
  // The reference list: each work its own paragraph, hanging, without list marks.
  if (has("bib-list")) {
    const out: FileChild[] = [];
    for (const item of element.children)
      out.push(...(await blocks(w, item, notes, counter, box)));
    return out;
  }
  if (tag === "UL" || tag === "OL") return list(w, element, notes, counter, box, 0);
  if (tag === "BLOCKQUOTE") {
    return blocks(w, element, notes, counter, {
      ...box,
      border: box.border ?? w.ink,
      indent: (box.indent ?? 0) + 284,
    });
  }
  if (tag === "PRE") {
    const lines = (element.textContent ?? "").replace(/\n$/, "").split("\n");
    return lines.map((text, index) =>
      w.paragraph(
        {
          spacing: {
            before: 0,
            after: index === lines.length - 1 ? 160 : 0,
            line: 240,
            lineRule: d.LineRuleType.AUTO,
          },
          shading: { type: d.ShadingType.CLEAR, fill: "f4f2f4", color: "auto" },
          children: [new d.TextRun({ text: text || " ", font: MONO, size: 18 })],
        },
        box,
      ),
    );
  }
  if (tag === "HR") {
    return [
      new d.Paragraph({
        border: {
          bottom: { style: d.BorderStyle.SINGLE, size: 6, color: w.line, space: 1 },
        },
        children: [],
      }),
    ];
  }
  if (tag === "TABLE") return [await table(w, element, notes, counter)];
  if (has("tableWrapper")) {
    const inner = element.querySelector("table");
    return inner ? [await table(w, inner, notes, counter)] : [];
  }
  if (tag === "FIGURE") {
    const img = element.querySelector("img");
    const out: FileChild[] = [];
    if (img) out.push(...(await imageBlock(w, img, box)));
    const caption = element.querySelector("figcaption");
    if (caption) {
      out.push(
        w.paragraph(
          {
            style: "Caption",
            children: await w.runs(inlineRuns(caption, counter), notes),
          },
          box,
        ),
      );
    }
    return out;
  }
  if (tag === "IMG") return imageBlock(w, element as HTMLImageElement, box);
  if (element.getAttribute("data-type") === "block-math") {
    return [await equationBlock(w, element)];
  }
  if (has("callout")) {
    const style = getComputedStyle(element);
    return blocks(w, element, notes, counter, {
      ...box,
      shading: hex(style.backgroundColor) ?? undefined,
      border: hex(getComputedStyle(element, "::before").backgroundColor) ?? w.ink,
    });
  }
  if (has("toggle")) {
    const summary = element.querySelector("summary");
    const content = element.querySelector('[data-type="detailsContent"]');
    return [
      ...(summary
        ? [
            w.paragraph(
              {
                keepNext: true,
                children: await w.runs(inlineRuns(summary, counter), notes, {
                  bold: true,
                }),
              },
              box,
            ),
          ]
        : []),
      ...(content ? await blocks(w, content, notes, counter, box) : []),
    ];
  }
  if (has("print-block")) {
    return [await boxed(w, await blocks(w, element, notes, counter))];
  }
  if (tag === "DL") {
    const out: FileChild[] = [];
    for (const row of element.querySelectorAll(":scope > div")) {
      const term = row.querySelector("dt");
      const definition = row.querySelector("dd");
      out.push(
        w.paragraph(
          {
            children: [
              ...(term
                ? await w.runs(inlineRuns(term, counter), notes, { bold: true })
                : []),
              new d.TextRun({ text: ": " }),
              ...(definition
                ? await w.runs(inlineRuns(definition, counter), notes)
                : []),
            ],
          },
          box,
        ),
      );
    }
    return out;
  }
  if (has("print-pair")) {
    const cells = [...element.children];
    return [
      new d.Table({
        width: { size: TEXT_WIDTH, type: d.WidthType.DXA },
        columnWidths: cells.map(() => Math.floor(TEXT_WIDTH / cells.length)),
        borders: d.TableBorders.NONE,
        rows: [
          new d.TableRow({
            children: await Promise.all(
              cells.map(
                async (cell) =>
                  new d.TableCell({
                    children: nonEmpty(d, await blocks(w, cell, notes, counter)),
                  }),
              ),
            ),
          }),
        ],
      }),
    ];
  }
  if (has("print-slide")) return slide(w, element);
  if (has("bib-head")) return blocks(w, element, notes, counter, box);

  // Anything else: its blocks, or its text as one paragraph.
  const blockChildren = [...element.children].some((child) =>
    /^(P|H[1-6]|UL|OL|DIV|FIGURE|TABLE|PRE|BLOCKQUOTE|HR|SECTION|DL)$/.test(
      child.tagName,
    ),
  );
  if (blockChildren) return blocks(w, element, notes, counter, box);
  const runs = inlineRuns(element, counter);
  return runs.length ? [w.paragraph({ children: await w.runs(runs, notes) }, box)] : [];
}

/** Word needs a paragraph in every table cell. */
const nonEmpty = (d: Docx, children: FileChild[]) =>
  children.length ? children : [new d.Paragraph({ children: [] })];

async function list(
  w: Writer,
  element: Element,
  notes: Element[] | null,
  counter: FootnoteCounter,
  box: Box,
  level: number,
): Promise<FileChild[]> {
  const ordered = element.tagName === "OL";
  const plain =
    element.getAttribute("data-type") === "taskList" ||
    element.classList.contains("print-options");
  const instance = ordered ? w.listInstance() : 0;
  const out: FileChild[] = [];
  for (const item of element.children) {
    if (item.tagName !== "LI") continue;
    const checked = item.getAttribute("data-checked");
    let first = true;
    // A to-do item holds its text in a div next to the checkbox.
    const parts =
      checked !== null
        ? [...(item.querySelector(":scope > div")?.children ?? [])]
        : [...item.children];
    // An item with only text in it, such as a quiz option, is its own paragraph.
    const loose = parts.some((part) => BLOCKISH.test(part.tagName)) ? parts : [item];
    for (const part of loose) {
      if (part.tagName === "UL" || part.tagName === "OL") {
        out.push(...(await list(w, part, notes, counter, box, level + 1)));
        continue;
      }
      if (part.tagName !== "P" && part !== item) {
        out.push(...(await block(w, part, notes, counter, box)));
        continue;
      }
      const runs = inlineRuns(part, counter);
      if (checked !== null && first) {
        runs.unshift({ text: checked === "true" ? "☑ " : "☐ " });
      }
      const marker =
        !first || plain
          ? { indent: { left: 360 * (level + 1) } }
          : ordered
            ? { numbering: { reference: "numbers", level, instance } }
            : { numbering: { reference: "bullets", level } };
      out.push(
        w.paragraph(
          {
            ...marker,
            spacing: { after: 60 },
            children: await w.runs(runs, notes, {
              color: checked === "true" ? w.muted : undefined,
            }),
          },
          box,
        ),
      );
      first = false;
    }
  }
  return out;
}

async function table(
  w: Writer,
  element: Element,
  notes: Element[] | null,
  counter: FootnoteCounter,
): Promise<DocxTable> {
  const { d } = w;
  const rows = [
    ...element.querySelectorAll(
      ":scope > tbody > tr, :scope > thead > tr, :scope > tr",
    ),
  ];
  const first = rows[0] ? [...rows[0].children] : [];
  const widths = first.map((cell) => cell.getBoundingClientRect().width || 1);
  const total = widths.reduce((sum, width) => sum + width, 0) || 1;
  const columnWidths = widths.map((width) => Math.round((width / total) * TEXT_WIDTH));
  const line = { style: d.BorderStyle.SINGLE, size: 4, color: w.line };
  return new d.Table({
    width: { size: TEXT_WIDTH, type: d.WidthType.DXA },
    columnWidths,
    borders: {
      top: line,
      bottom: line,
      left: line,
      right: line,
      insideHorizontal: line,
      insideVertical: line,
    },
    rows: await Promise.all(
      rows.map(async (row, index) => {
        const header = [...row.children].every((cell) => cell.tagName === "TH");
        return new d.TableRow({
          tableHeader: index === 0 && header,
          cantSplit: true,
          children: await Promise.all(
            [...row.children].map(async (cell, column) => {
              const head = cell.tagName === "TH";
              const children = await blocks(w, cell, notes, counter, { tight: true });
              return new d.TableCell({
                width: { size: columnWidths[column] ?? 0, type: d.WidthType.DXA },
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                shading: head
                  ? { type: d.ShadingType.CLEAR, fill: "f4f2f4", color: "auto" }
                  : undefined,
                columnSpan: Number(cell.getAttribute("colspan")) || undefined,
                children: nonEmpty(
                  d,
                  head
                    ? await Promise.all(
                        [...cell.querySelectorAll("p")].map(
                          async (p) =>
                            new d.Paragraph({
                              spacing: { after: 0 },
                              children: await w.runs(inlineRuns(p, counter), notes, {
                                bold: true,
                              }),
                            }),
                        ),
                      )
                    : children,
                ),
              });
            }),
          ),
        });
      }),
    ),
  });
}

/** A tutorial block in a box, as on paper: a table of one cell. */
async function boxed(w: Writer, children: FileChild[]) {
  const { d } = w;
  const line = { style: d.BorderStyle.SINGLE, size: 6, color: w.line };
  return new d.Table({
    width: { size: TEXT_WIDTH, type: d.WidthType.DXA },
    columnWidths: [TEXT_WIDTH],
    borders: {
      top: line,
      bottom: line,
      left: line,
      right: line,
      insideHorizontal: line,
      insideVertical: line,
    },
    rows: [
      new d.TableRow({
        cantSplit: true,
        children: [
          new d.TableCell({
            margins: { top: 120, bottom: 120, left: 200, right: 200 },
            children: nonEmpty(d, children),
          }),
        ],
      }),
    ],
  });
}

async function imageBlock(
  w: Writer,
  img: HTMLImageElement,
  box: Box,
): Promise<FileChild[]> {
  const { d } = w;
  const image = await picture(img);
  if (!image) return [];
  const shown = img.getBoundingClientRect();
  const width = Math.min(605, (shown.width || image.width) * SCALE);
  const height = width * (image.height / image.width);
  return [
    w.paragraph(
      {
        keepNext: true,
        children: [
          new d.ImageRun({
            type: image.type,
            data: image.data,
            transformation: { width, height },
            altText: { name: "Image", description: img.alt },
          }),
        ],
      },
      box,
    ),
  ];
}

/** An equation on its own line, centered, with its number on the right. */
async function equationBlock(w: Writer, element: Element) {
  const { d } = w;
  const tex = element.getAttribute("data-latex") ?? "";
  const number = element.getAttribute("data-number");
  const image = await equationPicture(tex, true, BODY_PX, w.ink);
  const content: ParagraphChild = image
    ? new d.ImageRun({
        type: "png",
        data: image.data,
        transformation: { width: image.width, height: image.height },
        altText: { name: "Equation", description: tex },
      })
    : new d.TextRun({ text: tex, font: MONO });
  return new d.Paragraph({
    tabStops: [
      { type: d.TabStopType.CENTER, position: TEXT_WIDTH / 2 },
      { type: d.TabStopType.RIGHT, position: TEXT_WIDTH },
    ],
    spacing: { before: 120, after: 120 },
    children: [
      new d.TextRun({ children: [new d.Tab()] }),
      content,
      ...(number ? [new d.TextRun({ children: [new d.Tab(), number] })] : []),
    ],
  });
}

/** A slide on paper: its number, its blocks and its notes. */
async function slide(w: Writer, element: Element): Promise<FileChild[]> {
  const { d } = w;
  const index = [
    ...(element.parentElement?.querySelectorAll(":scope > .print-slide") ?? []),
  ].indexOf(element);
  const out: FileChild[] = [
    new d.Paragraph({
      heading: d.HeadingLevel.HEADING_4,
      keepNext: true,
      children: [new d.TextRun({ text: `Slide ${index + 1}`, color: w.muted })],
    }),
  ];
  const body = element.querySelector(".slide-body");
  if (body) out.push(...(await blocks(w, body, null, new FootnoteCounter())));
  const notes = element.querySelector(".print-notes");
  if (notes) out.push(...(await block(w, notes, null, new FootnoteCounter(), {})));
  return out;
}

/** The export as the bytes of a .docx file. */
export async function makeDocx(root: HTMLElement, job: ExportJob): Promise<Uint8Array> {
  const d = await import("docx");
  const w = new Writer(d, root);
  const children: FileChild[] = [];
  let first = true;
  for (const section of root.querySelectorAll(":scope > section")) {
    const title = section.querySelector(":scope > .print-title");
    if (section.classList.contains("print-cover")) {
      children.push(
        new d.Paragraph({
          heading: d.HeadingLevel.TITLE,
          children: [new d.TextRun({ text: title?.textContent ?? job.name })],
        }),
      );
      for (const line of section.querySelectorAll(".print-contents li")) {
        const depth =
          Math.round(parseFloat((line as HTMLElement).style.paddingLeft) / 18) || 0;
        children.push(
          new d.Paragraph({
            indent: { left: 360 * depth },
            spacing: { after: 40 },
            children: [
              new d.TextRun({
                text: line.textContent ?? "",
                bold: line.classList.contains("print-folder"),
              }),
            ],
          }),
        );
      }
      first = false;
      continue;
    }
    children.push(
      new d.Paragraph({
        heading: d.HeadingLevel.HEADING_1,
        pageBreakBefore: !first,
        children: [new d.TextRun({ text: title?.textContent ?? "" })],
      }),
    );
    first = false;
    for (const element of section.children) {
      if (element === title) continue;
      children.push(...(await block(w, element, null, new FootnoteCounter(), {})));
    }
  }

  const heading = (id: string, name: string, size: number, before: number) => ({
    id,
    name,
    basedOn: "Normal",
    next: "Normal",
    quickFormat: true,
    run: { font: FONT, size, bold: true, color: w.ink },
    paragraph: { spacing: { before, after: 120 }, keepNext: true },
  });
  const document = new d.Document({
    creator: "Cursive",
    title: job.name,
    features: { updateFields: false },
    footnotes: w.footnotes,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: w.ink },
          paragraph: {
            spacing: { after: 140, line: 288, lineRule: d.LineRuleType.AUTO },
          },
        },
      },
      paragraphStyles: [
        heading("Title", "Title", 52, 0),
        heading("Heading1", "Heading 1", 40, 0),
        heading("Heading2", "Heading 2", 30, 320),
        heading("Heading3", "Heading 3", 26, 240),
        heading("Heading4", "Heading 4", 23, 200),
        {
          id: "Caption",
          name: "Caption",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 19, color: w.muted },
          paragraph: { spacing: { before: 60, after: 200 } },
        },
      ],
      characterStyles: [
        {
          id: "Hyperlink",
          name: "Hyperlink",
          basedOn: "DefaultParagraphFont",
          run: {
            color:
              hex(getComputedStyle(root).getPropertyValue("--tint").trim()) ?? "9a4a1c",
            underline: {},
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [0, 1, 2, 3, 4, 5].map((level) => ({
            level,
            format: d.LevelFormat.BULLET,
            text: ["•", "◦", "▪"][level % 3],
            alignment: d.AlignmentType.START,
            style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 360 } } },
          })),
        },
        {
          reference: "numbers",
          levels: [0, 1, 2, 3, 4, 5].map((level) => ({
            level,
            format: [
              d.LevelFormat.DECIMAL,
              d.LevelFormat.LOWER_LETTER,
              d.LevelFormat.LOWER_ROMAN,
            ][level % 3],
            text: `%${level + 1}.`,
            alignment: d.AlignmentType.START,
            style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1418, bottom: 1418, left: 1418, right: 1418 },
          },
        },
        children,
      },
    ],
  });
  return new Uint8Array(await d.Packer.toArrayBuffer(document));
}
