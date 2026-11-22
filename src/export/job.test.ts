import { describe, expect, it } from "vitest";
import type { Project } from "@/lib/project";
import {
  buildJob,
  countSlides,
  defaultPaper,
  fileName,
  hasSlides,
  isFormat,
  pageRule,
  sheetOf,
  sheetRule,
} from "./job";
import { mixed } from "./PrintDoc";

const deck = [
  "---",
  "title: Defense",
  "type: presentation",
  "---",
  "",
  "```slide",
  "layout: title",
  "```",
  "",
  "# Pilot study",
  "",
  "---",
  "",
  "## Results",
  "",
  "```notes",
  "Keep this short.",
  "```",
].join("\n");

const project: Project = {
  name: "Thesis",
  folders: ["Chapters", "Empty"],
  pages: {
    "Reading list.md": "---\ntitle: Reading list\n---\n\nBooks.",
    "Defense.md": deck,
    "Chapters/Method.md": "---\ntitle: Method\n---\n\nHow.",
    "Chapters/Introduction.md": "Why.",
  },
};

describe("buildJob", () => {
  it("exports a page as paper pages named after its title", () => {
    const job = buildJob(project, "Reading list.md", { scope: "page", notes: false });
    expect(job).toMatchObject({
      name: "Reading list",
      format: "paper",
      contents: null,
      parts: [{ kind: "page", title: "Reading list", markdown: "Books." }],
    });
  });

  it("exports a presentation as one slide per sheet", () => {
    const job = buildJob(project, "Defense.md", { scope: "page", notes: false });
    expect(job?.format).toBe("slides");
    const [part] = job!.parts;
    expect(part.kind === "slides" && part.slides.map((slide) => slide.notes)).toEqual([
      "",
      "Keep this short.",
    ]);
  });

  it("puts a presentation with its notes on paper", () => {
    const job = buildJob(project, "Defense.md", { scope: "page", notes: true });
    expect(job).toMatchObject({ format: "paper", notes: true });
  });

  it("exports a project in the sidebar's order, with a contents list", () => {
    const job = buildJob(project, "Defense.md", { scope: "project", notes: false });
    expect(job?.name).toBe("Thesis");
    expect(job?.format).toBe("paper");
    expect(job?.parts.map((part) => part.title)).toEqual([
      "Introduction",
      "Method",
      "Defense",
      "Reading list",
    ]);
    expect(job?.contents).toEqual([
      { label: "Chapters", depth: 0, folder: true },
      { label: "Introduction", depth: 1, folder: false },
      { label: "Method", depth: 1, folder: false },
      { label: "Empty", depth: 0, folder: true },
      { label: "Defense", depth: 0, folder: false },
      { label: "Reading list", depth: 0, folder: false },
    ]);
  });

  it("has nothing to export without a page", () => {
    expect(buildJob(project, null, { scope: "page", notes: false })).toBeNull();
    expect(
      buildJob({ name: "New", folders: [], pages: {} }, null, {
        scope: "project",
        notes: false,
      }),
    ).toBeNull();
  });
});

describe("buildJob for other formats", () => {
  it("takes only the presentations into PowerPoint, one slide per sheet", () => {
    const job = buildJob(project, "Reading list.md", {
      scope: "project",
      notes: true,
      format: "pptx",
    });
    expect(job).toMatchObject({
      name: "Thesis",
      format: "slides",
      notes: false,
      contents: null,
    });
    expect(job?.parts.map((part) => part.title)).toEqual(["Defense"]);
  });

  it("has no PowerPoint for a page without slides", () => {
    expect(
      buildJob(project, "Reading list.md", {
        scope: "page",
        notes: false,
        format: "pptx",
      }),
    ).toBeNull();
  });

  it("puts a presentation on paper for Word and HTML", () => {
    for (const format of ["docx", "html"] as const) {
      const job = buildJob(project, "Defense.md", {
        scope: "page",
        notes: false,
        format,
      });
      expect(job?.format).toBe("paper");
    }
  });
});

describe("countSlides", () => {
  it("counts the presentations in what is exported", () => {
    expect(countSlides(project, "Reading list.md", "page")).toBe(0);
    expect(countSlides(project, "Defense.md", "page")).toBe(1);
    expect(countSlides(project, null, "project")).toBe(1);
  });
});

describe("fileName", () => {
  it("leaves out the marks a file name can't hold", () => {
    expect(fileName("Week 3: why/how?")).toBe("Week 3 why how");
    expect(fileName("Notes.")).toBe("Notes");
    expect(fileName(" :/ ")).toBe("Export");
  });
});

describe("isFormat", () => {
  it("knows the formats", () => {
    expect(isFormat("pptx")).toBe(true);
    expect(isFormat("odt")).toBe(false);
    expect(isFormat(null)).toBe(false);
  });
});

describe("hasSlides", () => {
  it("says whether speaker notes are a choice", () => {
    expect(hasSlides(project, "Reading list.md", "page")).toBe(false);
    expect(hasSlides(project, "Defense.md", "page")).toBe(true);
    expect(hasSlides(project, "Reading list.md", "project")).toBe(true);
  });
});

describe("pageRule", () => {
  it("makes a sheet the size of a slide", () => {
    expect(pageRule("slides")).toContain("size: 10in 5.625in");
    expect(pageRule("paper")).not.toContain("size");
  });
});

describe("mixed", () => {
  it("never leaves items in the order they were written in", () => {
    expect(mixed(["a", "b"])).toEqual(["b", "a"]);
    expect(mixed(["a", "b", "c"])).toEqual(["c", "a", "b"]);
    expect(mixed(["a", "b", "c", "d"])).toEqual(["c", "a", "d", "b"]);
    expect(mixed(["a"])).toEqual(["a"]);
  });
});

describe("the sheet of a PDF saved without the print window", () => {
  it("takes Letter where it is the usual paper and A4 elsewhere", () => {
    expect(defaultPaper("en-US")).toBe("letter");
    expect(defaultPaper("fr-CA")).toBe("letter");
    expect(defaultPaper("en-GB")).toBe("a4");
    expect(defaultPaper("nl")).toBe("a4");
    expect(defaultPaper("")).toBe("a4");
  });

  it("prints slides at their own size and pages on the paper with margins", () => {
    expect(sheetOf("slides", "letter")).toEqual({
      width: 254,
      height: 142.875,
      margin: [0, 0, 0, 0],
    });
    expect(sheetOf("paper", "a4")).toEqual({
      width: 210,
      height: 297,
      margin: [18, 17, 18, 17],
    });
    expect(sheetOf("paper", "letter").width).toBe(215.9);
  });

  it("writes the page rule with or without the margins", () => {
    const a4 = sheetOf("paper", "a4");
    expect(sheetRule(a4)).toBe(
      "@page { size: 210mm 297mm; margin: 18mm 17mm 18mm 17mm; }",
    );
    expect(sheetRule(a4, false)).toBe("@page { size: 210mm 297mm; margin: 0; }");
  });
});
