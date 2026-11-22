import { styleOfProperties } from "@scholarkit/editor/references/styles";
import { inlineNumberedNotes } from "@scholarkit/editor/editor/footnote";
import { readPage } from "@scholarkit/editor/lib/page-file";
import { buildTree, pageLabel, type Project, type TreeNode } from "@/lib/project";
import { isPresentation, readDeck, type Slide } from "@/slides/deck";
import { t } from "@scholarkit/i18n";

/** What goes into the export: the open page, or every page of the project. */
export type Scope = "page" | "project";

/** The kinds of file an export makes. */
export type Format = "pdf" | "pptx" | "docx" | "html";

export const FORMATS: Array<{ id: Format; label: string; extension: string }> = [
  { id: "pdf", label: "PDF", extension: "pdf" },
  { id: "pptx", label: "PowerPoint", extension: "pptx" },
  { id: "docx", label: "Word", extension: "docx" },
  { id: "html", label: "HTML", extension: "html" },
];

export const isFormat = (value: unknown): value is Format =>
  FORMATS.some((format) => format.id === value);

export interface ExportOptions {
  scope: Scope;
  /** Speaker notes under each slide. */
  notes: boolean;
  /** PDF when left out. */
  format?: Format;
}

/** One page of the project as it goes into the export. */
export type Part =
  | { kind: "page"; path: string; title: string; markdown: string; style: string }
  | { kind: "slides"; path: string; title: string; slides: Slide[]; style: string };

/** A line of the contents list on the first sheet of a project. */
export interface ContentsLine {
  label: string;
  /** How deep in folders the line sits. */
  depth: number;
  folder: boolean;
}

export interface ExportJob {
  /** The file's suggested name, without its extension. */
  name: string;
  /**
   * `slides`: every sheet is one slide, at the slide's own size.
   * `paper`: pages of text on the paper the reader chooses, with slides
   * drawn as pictures on them.
   */
  format: "slides" | "paper";
  notes: boolean;
  parts: Part[];
  /** The contents list of a whole project; null for a single page. */
  contents: ContentsLine[] | null;
}

function part(path: string, source: string): Part {
  const page = readPage(source);
  const title = pageLabel(path, source);
  const style = styleOfProperties(page.properties).id;
  return isPresentation(page)
    ? {
        kind: "slides",
        path,
        title,
        slides: readDeck(inlineNumberedNotes(page.markdown)),
        style,
      }
    : { kind: "page", path, title, markdown: page.markdown, style };
}

/** The pages of a tree in the order the sidebar lists them. */
function walk(nodes: TreeNode[], depth: number, lines: ContentsLine[]): string[] {
  return nodes.flatMap((node) => {
    lines.push({ label: node.label, depth, folder: node.kind === "folder" });
    return node.kind === "page" ? [node.path] : walk(node.children, depth + 1, lines);
  });
}

/** The pages an export takes from, as their sources. */
function sourcesIn(project: Project, active: string | null, scope: Scope) {
  return scope === "project"
    ? Object.values(project.pages)
    : active && active in project.pages
      ? [project.pages[active]]
      : [];
}

/** How many presentations the export holds. Speaker notes and PowerPoint need one. */
export const countSlides = (project: Project, active: string | null, scope: Scope) =>
  sourcesIn(project, active, scope).filter((source) => isPresentation(readPage(source)))
    .length;

/** Does the export hold a presentation? Then speaker notes are a choice. */
export const hasSlides = (project: Project, active: string | null, scope: Scope) =>
  countSlides(project, active, scope) > 0;

/** A name a file can have on every system: without the marks Windows refuses. */
export const fileName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "") || "Export";

/**
 * What to draw for an export, or null when there is nothing to export.
 * PowerPoint takes only presentations, one slide per sheet. Word and
 * HTML put everything on paper, as a PDF with speaker notes does.
 */
export function buildJob(
  project: Project,
  active: string | null,
  options: ExportOptions,
): ExportJob | null {
  const format = options.format ?? "pdf";
  if (format === "pptx") return slidesJob(project, active, options.scope);
  const paper = format === "docx" || format === "html";
  if (options.scope === "page") {
    if (!active || !(active in project.pages)) return null;
    const only = part(active, project.pages[active]);
    return {
      name: only.title,
      format: only.kind === "slides" && !options.notes && !paper ? "slides" : "paper",
      notes: options.notes,
      parts: [only],
      contents: null,
    };
  }
  const contents: ContentsLine[] = [];
  const paths = walk(buildTree(project), 0, contents);
  if (paths.length === 0) return null;
  return {
    name: project.name,
    format: "paper",
    notes: options.notes,
    parts: paths.map((path) => part(path, project.pages[path])),
    contents,
  };
}

/** Every presentation in the export, one slide per sheet, without notes. */
function slidesJob(project: Project, active: string | null, scope: Scope) {
  const paths =
    scope === "page"
      ? active && active in project.pages
        ? [active]
        : []
      : walk(buildTree(project), 0, []);
  const parts = paths
    .map((path) => part(path, project.pages[path]))
    .filter((one) => one.kind === "slides");
  if (parts.length === 0) return null;
  return {
    name: scope === "page" ? parts[0].title : project.name,
    format: "slides" as const,
    notes: false,
    parts,
    contents: null,
  };
}

/** The sheet's size and margins. A slide is 960 by 540 CSS pixels: 10 by 5.625 inches. */
export const pageRule = (format: ExportJob["format"]) =>
  format === "slides"
    ? "@page { size: 10in 5.625in; margin: 0; }"
    : "@page { margin: 18mm 17mm; }";

/** The paper a PDF of pages is saved on. With the print window, the reader picks it there. */
export type Paper = "a4" | "letter";

export const PAPERS: Array<{
  id: Paper;
  label: string;
  width: number;
  height: number;
}> = [
  { id: "a4", label: "A4", width: 210, height: 297 },
  { id: "letter", label: t("Letter"), width: 215.9, height: 279.4 },
];

export const isPaper = (value: unknown): value is Paper =>
  PAPERS.some((paper) => paper.id === value);

/** Letter where it is the usual paper, A4 everywhere else. */
export function defaultPaper(locale: string): Paper {
  const region = (/[-_]([A-Za-z]{2})\b/.exec(locale)?.[1] ?? "").toUpperCase();
  return ["US", "CA", "MX", "PH", "CL", "CO", "VE", "GT", "PR"].includes(region)
    ? "letter"
    : "a4";
}

/** A sheet of a PDF, in millimetres. */
export interface Sheet {
  width: number;
  height: number;
  /** Top, right, bottom, left. */
  margin: [number, number, number, number];
}

/** The sheet a PDF saved without the print window prints on. */
export function sheetOf(format: ExportJob["format"], paper: Paper): Sheet {
  if (format === "slides") return { width: 254, height: 142.875, margin: [0, 0, 0, 0] };
  const { width, height } = PAPERS.find((one) => one.id === paper) ?? PAPERS[0];
  return { width, height, margin: [18, 17, 18, 17] };
}

/**
 * The page rule for a sheet. `marginsInCss: false` leaves the margins to the
 * printing itself: WebKit lays pages out within the margins it is given, and
 * ignores those a page sets.
 */
export const sheetRule = (sheet: Sheet, marginsInCss = true) =>
  `@page { size: ${sheet.width}mm ${sheet.height}mm; margin: ${
    marginsInCss ? sheet.margin.map((mm) => `${mm}mm`).join(" ") : "0"
  }; }`;
