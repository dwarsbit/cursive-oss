import { describe, expect, it } from "vitest";
import { bibtexReferences } from "./bibtex";
import { emptyReference, type Reference } from "./reference";
import {
  cslItem,
  latexEscape,
  writeBibtex,
  writeCslJson,
  writeReferences,
  writeRis,
  type ExportReference,
} from "./export";

const ref = (fields: Partial<ExportReference> & { key: string }): ExportReference => ({
  ...emptyReference(fields.key),
  ...fields,
});

const ARTICLE = ref({
  key: "okafor2021",
  type: "article",
  author: ["Okafor, Nkem", "Brandt, Sofie"],
  title: "Screen or paper: how first-year students read in the Netherlands",
  year: "2021",
  container: "Journal of Higher Education Research",
  volume: "12",
  issue: "3",
  pages: "45–67",
  doi: "10.1000/jher.2021.0042",
  keywords: ["survey", "laptops"],
});

const BOOK = ref({
  key: "who2021",
  type: "book",
  author: ["World Health Organization"],
  title: "Reading & writing: 50% of it",
  year: "2021",
  publisher: "WHO Press",
  place: "Geneva",
  isbn: "978-92-4-001512-8",
});

const CHAPTER = ref({
  key: "visser2022",
  type: "chapter",
  author: ["Visser, Anne"],
  editor: ["Moreno, Luis"],
  title: "Annotating on a tablet",
  container: "Reading in the digital age",
  publisher: "Routledge",
  year: "2022",
  pages: "101-120",
});

const THESIS = ref({
  key: "lee2019",
  type: "thesis",
  author: ["Lee, Kim"],
  title: "Second-language reading",
  publisher: "Utrecht University",
  genre: "Master's thesis",
  year: "2019",
});

const WEBPAGE = ref({
  key: "library2025",
  type: "webpage",
  title: "Where students read: library survey 2025",
  container: "University Library",
  url: "https://example.org/where-students-read?x=1&y=2",
});

describe("BibTeX export", () => {
  it("escapes LaTeX's special characters", () => {
    expect(latexEscape("50% & $5 #1 a_b ~ ^ \\ {x}")).toBe(
      "50\\% \\& \\$5 \\#1 a\\_b \\textasciitilde{} \\textasciicircum{} \\textbackslash{} \\textbraceleft{}x\\textbraceright{}",
    );
  });

  it("writes an article", () => {
    expect(writeBibtex([ARTICLE])).toBe(
      [
        "@article{okafor2021,",
        "  author = {Okafor, Nkem and Brandt, Sofie},",
        "  title = {Screen or paper: how first-year students read in the {Netherlands}},",
        "  journal = {Journal of Higher Education Research},",
        "  year = {2021},",
        "  volume = {12},",
        "  number = {3},",
        "  pages = {45--67},",
        "  doi = {10.1000/jher.2021.0042},",
        "  keywords = {survey, laptops}",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("writes organizations, chapters and theses", () => {
    const file = writeBibtex([BOOK, CHAPTER, THESIS, WEBPAGE]);
    expect(file).toContain("@book{who2021,\n  author = {{World Health Organization}},");
    expect(file).toContain("title = {Reading \\& writing: 50\\% of it}");
    expect(file).toContain("@incollection{visser2022,");
    expect(file).toContain("booktitle = {Reading in the digital age}");
    expect(file).toContain("@mastersthesis{lee2019,");
    expect(file).toContain("school = {Utrecht University}");
    expect(file).not.toContain("type = {");
    expect(file).toContain("url = {https://example.org/where-students-read?x=1&y=2}");
  });

  it("reads back as the same references", () => {
    const refs: Reference[] = [ARTICLE, BOOK, CHAPTER, THESIS, WEBPAGE];
    const read = bibtexReferences(writeBibtex(refs));
    expect(read.map((r) => r.key)).toEqual(refs.map((r) => r.key));
    for (const [index, back] of read.entries()) {
      const original = refs[index];
      expect(back.type).toBe(original.type === "webpage" ? "webpage" : original.type);
      expect(back.title).toBe(original.title);
      expect(back.author).toEqual(original.author);
      expect(back.editor).toEqual(original.editor);
      expect(back.container).toBe(original.container);
      expect(back.pages).toBe(original.pages.replace("–", "-"));
      expect(back.url).toBe(original.url);
    }
  });

  it("writes nothing for no references", () => {
    expect(writeBibtex([])).toBe("");
  });
});

describe("RIS export", () => {
  it("writes an article", () => {
    expect(writeRis([ARTICLE]).split("\r\n")).toEqual([
      "TY  - JOUR",
      "ID  - okafor2021",
      "AU  - Okafor, Nkem",
      "AU  - Brandt, Sofie",
      "TI  - Screen or paper: how first-year students read in the Netherlands",
      "T2  - Journal of Higher Education Research",
      "PY  - 2021",
      "VL  - 12",
      "IS  - 3",
      "SP  - 45",
      "EP  - 67",
      "DO  - 10.1000/jher.2021.0042",
      "KW  - survey",
      "KW  - laptops",
      "ER  - ",
      "",
    ]);
  });

  it("writes editors, thesis types and one entry after another", () => {
    const file = writeRis([CHAPTER, THESIS, BOOK]);
    expect(file).toContain(
      "TY  - CHAP\r\nID  - visser2022\r\nAU  - Visser, Anne\r\nED  - Moreno, Luis",
    );
    expect(file).toContain("M3  - Master's thesis");
    expect(file).toContain("SN  - 978-92-4-001512-8");
    expect(file.match(/^TY {2}- /gm)).toHaveLength(3);
    expect(file.match(/^ER {2}- $/gm)).toHaveLength(3);
  });

  it("keeps each value on one line", () => {
    expect(writeRis([ref({ key: "a", title: "One\ntwo" })])).toContain("TI  - One two");
  });
});

describe("CSL JSON export", () => {
  it("writes an article", () => {
    expect(cslItem(ARTICLE)).toEqual({
      id: "okafor2021",
      type: "article-journal",
      author: [
        { family: "Okafor", given: "Nkem" },
        { family: "Brandt", given: "Sofie" },
      ],
      title: "Screen or paper: how first-year students read in the Netherlands",
      "container-title": "Journal of Higher Education Research",
      volume: "12",
      issue: "3",
      page: "45-67",
      issued: { "date-parts": [[2021]] },
      DOI: "10.1000/jher.2021.0042",
      keyword: "survey, laptops",
    });
  });

  it("writes organizations as literal names", () => {
    expect(cslItem(BOOK)).toMatchObject({
      type: "book",
      author: [{ literal: "World Health Organization" }],
      publisher: "WHO Press",
      "publisher-place": "Geneva",
      ISBN: "978-92-4-001512-8",
    });
  });

  it("is a JSON list", () => {
    const file = writeCslJson([ARTICLE, WEBPAGE]);
    const items = JSON.parse(file) as Array<{ id: string; type: string }>;
    expect(items.map((item) => [item.id, item.type])).toEqual([
      ["okafor2021", "article-journal"],
      ["library2025", "webpage"],
    ]);
    expect(writeReferences("csl-json", [])).toBe("[]\n");
  });
});
