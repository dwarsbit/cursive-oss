import type { Reference, ReferenceType } from "./reference";

/**
 * Reference files for other tools: BibTeX for LaTeX, RIS for reference
 * managers and CSL JSON for Pandoc and citation processors. Each writer
 * takes references in the order they go in the file and leaves out the
 * fields that are empty.
 */

/** A reference with what an exported file can carry besides it. */
export type ExportReference = Reference & {
  isbn?: string;
  /** Tags, written as keywords. */
  keywords?: string[];
};

export type ExportFormat = "bibtex" | "ris" | "csl-json";

export const EXPORT_FORMATS: {
  id: ExportFormat;
  label: string;
  extension: string;
  mediaType: string;
}[] = [
  {
    id: "bibtex",
    label: "BibTeX",
    extension: "bib",
    mediaType: "application/x-bibtex",
  },
  {
    id: "ris",
    label: "RIS",
    extension: "ris",
    mediaType: "application/x-research-info-systems",
  },
  {
    id: "csl-json",
    label: "CSL JSON",
    extension: "json",
    mediaType: "application/vnd.citationstyles.csl+json",
  },
];

/** The references as a file in a format. */
export function writeReferences(format: ExportFormat, refs: ExportReference[]): string {
  switch (format) {
    case "bibtex":
      return writeBibtex(refs);
    case "ris":
      return writeRis(refs);
    case "csl-json":
      return writeCslJson(refs);
  }
}

/** A name's family and given parts; an organization, without a comma, is one literal. */
function nameParts(
  name: string,
): { family: string; given: string } | { literal: string } {
  const at = name.indexOf(",");
  if (at < 0) return { literal: name.trim() };
  return { family: name.slice(0, at).trim(), given: name.slice(at + 1).trim() };
}

/** "12-34" as its first and last page. */
function pageRange(pages: string): { start: string; end: string } {
  const [start, end] = pages.split(/\s*[-–—]+\s*/, 2);
  return { start: start?.trim() ?? "", end: end?.trim() ?? "" };
}

const isDoctoral = (genre: string) => !/master/i.test(genre);

// ---------- BibTeX ----------

const BIBTEX_TYPES: Record<ReferenceType, string> = {
  article: "article",
  book: "book",
  chapter: "incollection",
  conference: "inproceedings",
  thesis: "phdthesis",
  report: "techreport",
  webpage: "misc",
  other: "misc",
};

/** Text with LaTeX's special characters escaped. Letters outside ASCII stay: BibTeX files are UTF-8. */
export function latexEscape(value: string): string {
  return value.replace(/[\\{}&%$#_~^]/g, (char) => {
    switch (char) {
      case "\\":
        return "\\textbackslash{}";
      case "~":
        return "\\textasciitilde{}";
      case "^":
        return "\\textasciicircum{}";
      // An escaped brace would still count for BibTeX's brace matching.
      case "{":
        return "\\textbraceleft{}";
      case "}":
        return "\\textbraceright{}";
      default:
        return `\\${char}`;
    }
  });
}

/**
 * A title for BibTeX: a word with a capital after its first letter, or
 * any capital after the first word, is braced, so styles that lowercase
 * titles keep "Zotero", "UNESCO" and "iPhone" as written.
 */
function bibTitle(title: string): string {
  let first = true;
  return title
    .split(/(\s+)/)
    .map((word) => {
      if (/^\s+$/.test(word) || !word) return word;
      const escaped = latexEscape(word);
      const capital = first ? /\p{Lu}/u.test(word.slice(1)) : /\p{Lu}/u.test(word);
      first = false;
      return capital ? `{${escaped}}` : escaped;
    })
    .join("");
}

/** Names for BibTeX: "Family, Given and {Organization}". */
const bibNames = (names: string[]) =>
  names
    .map((name) => {
      const parts = nameParts(name);
      return "literal" in parts
        ? `{${latexEscape(parts.literal)}}`
        : parts.given
          ? `${latexEscape(parts.family)}, ${latexEscape(parts.given)}`
          : latexEscape(parts.family);
    })
    .join(" and ");

/** A web address or DOI as BibTeX takes it: only its braces would break the file. */
const bibVerbatim = (value: string) => value.replace(/[{}]/g, "");

function bibtexEntry(ref: ExportReference): string {
  const fields: [string, string][] = [];
  const add = (name: string, value: string) => {
    if (value) fields.push([name, value]);
  };
  add("author", bibNames(ref.author));
  add("editor", bibNames(ref.editor));
  add("title", bibTitle(ref.title));
  const container = latexEscape(ref.container);
  switch (ref.type) {
    case "article":
      add("journal", container);
      break;
    case "chapter":
    case "conference":
      add("booktitle", container);
      break;
    case "webpage":
    case "other":
      add("howpublished", container);
      break;
    default:
      break;
  }
  const publisher = latexEscape(ref.publisher);
  add(
    ref.type === "thesis"
      ? "school"
      : ref.type === "report"
        ? "institution"
        : "publisher",
    publisher,
  );
  add("address", latexEscape(ref.place));
  add("year", latexEscape(ref.year));
  add("volume", latexEscape(ref.volume));
  if (ref.type === "report") add("number", latexEscape(ref.genre || ref.issue));
  else add("number", latexEscape(ref.issue));
  if (
    ref.type === "thesis" &&
    !/^(doctoral dissertation|master'?s thesis)$/i.test(ref.genre)
  )
    add("type", latexEscape(ref.genre));
  const { start, end } = pageRange(ref.pages);
  add("pages", end ? `${latexEscape(start)}--${latexEscape(end)}` : latexEscape(start));
  add("isbn", latexEscape(ref.isbn ?? ""));
  add("doi", bibVerbatim(ref.doi));
  add("url", bibVerbatim(ref.url));
  add("keywords", latexEscape((ref.keywords ?? []).join(", ")));
  const type =
    ref.type === "thesis" && !isDoctoral(ref.genre)
      ? "mastersthesis"
      : BIBTEX_TYPES[ref.type];
  const body = fields.map(([name, value]) => `  ${name} = {${value}}`).join(",\n");
  return body ? `@${type}{${ref.key},\n${body}\n}` : `@${type}{${ref.key}\n}`;
}

/** The references as a BibTeX file. */
export function writeBibtex(refs: ExportReference[]): string {
  return refs.length ? `${refs.map(bibtexEntry).join("\n\n")}\n` : "";
}

// ---------- RIS ----------

const RIS_TYPES: Record<ReferenceType, string> = {
  article: "JOUR",
  book: "BOOK",
  chapter: "CHAP",
  conference: "CPAPER",
  thesis: "THES",
  report: "RPRT",
  webpage: "ELEC",
  other: "GEN",
};

/** One line's value: RIS has no way to write a line break inside one. */
const risValue = (value: string) => value.replace(/\s*[\r\n]+\s*/g, " ").trim();

function risEntry(ref: ExportReference): string {
  const lines: string[] = [`TY  - ${RIS_TYPES[ref.type]}`];
  const add = (tag: string, value: string) => {
    const clean = risValue(value);
    if (clean) lines.push(`${tag}  - ${clean}`);
  };
  add("ID", ref.key);
  for (const name of ref.author) add("AU", name);
  for (const name of ref.editor) add("ED", name);
  add("TI", ref.title);
  add("T2", ref.container);
  add("PY", ref.year);
  add("VL", ref.volume);
  add("IS", ref.issue);
  const { start, end } = pageRange(ref.pages);
  add("SP", start);
  add("EP", end);
  add("PB", ref.publisher);
  add("CY", ref.place);
  if (ref.type === "thesis") add("M3", ref.genre);
  if (ref.type === "report") add("M1", ref.genre);
  add("SN", ref.isbn ?? "");
  add("DO", ref.doi);
  add("UR", ref.url);
  for (const keyword of ref.keywords ?? []) add("KW", keyword);
  lines.push("ER  - ");
  return lines.join("\r\n");
}

/** The references as an RIS file, with the line breaks the format asks for. */
export function writeRis(refs: ExportReference[]): string {
  return refs.length ? `${refs.map(risEntry).join("\r\n\r\n")}\r\n` : "";
}

// ---------- CSL JSON ----------

const CSL_TYPES: Record<ReferenceType, string> = {
  article: "article-journal",
  book: "book",
  chapter: "chapter",
  conference: "paper-conference",
  thesis: "thesis",
  report: "report",
  webpage: "webpage",
  other: "document",
};

const cslNames = (names: string[]) => names.map(nameParts);

/** One reference as a CSL JSON item. */
export function cslItem(ref: ExportReference): Record<string, unknown> {
  const item: Record<string, unknown> = { id: ref.key, type: CSL_TYPES[ref.type] };
  const add = (field: string, value: unknown) => {
    if (Array.isArray(value) ? value.length : value) item[field] = value;
  };
  add("author", cslNames(ref.author));
  add("editor", cslNames(ref.editor));
  add("title", ref.title);
  add("container-title", ref.container);
  add("publisher", ref.publisher);
  add("publisher-place", ref.place);
  add("volume", ref.volume);
  add("issue", ref.issue);
  add(
    "page",
    pageRange(ref.pages).end ? ref.pages.replace(/\s*[–—-]+\s*/, "-") : ref.pages,
  );
  if (ref.type === "report") add("number", ref.genre);
  else add("genre", ref.genre);
  const year = /^\d{1,4}$/.exec(ref.year.trim())?.[0];
  if (year) item.issued = { "date-parts": [[Number(year)]] };
  else add("issued", ref.year ? { literal: ref.year } : "");
  add("ISBN", ref.isbn ?? "");
  add("DOI", ref.doi);
  add("URL", ref.url);
  add("keyword", (ref.keywords ?? []).join(", "));
  return item;
}

/** The references as a CSL JSON file. */
export function writeCslJson(refs: ExportReference[]): string {
  return `${JSON.stringify(refs.map(cslItem), null, 2)}\n`;
}
