// @vitest-environment happy-dom
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  assessmentXml,
  courseSummary,
  makeCourse,
  manifestXml,
  outlineOf,
  questionOf,
  slug,
} from "./course";
import type { ExportJob } from "./job";

const QUIZ = `id: q1
question: Which design answers the question?
options:
  - A survey
  - An interview
  - ""
  - A diary study
answer: [1, 4]
points: 2
attempts: 3
explanation: Both reach enough students.`;

const escapeAttr = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** A tutorial block as the export draws it. */
const block = (kind: string, source: string, inner = "") =>
  `<div class="print-block" data-node-view-wrapper="" data-tutorial="${kind}" data-tutorial-source="${escapeAttr(source)}"><p class="print-block-kind">${kind}</p>${inner}</div>`;

describe("questionOf", () => {
  it("makes a quiz with several answers a multiple response question, without empty options", () => {
    expect(questionOf("quiz", QUIZ)).toEqual({
      kind: "choice",
      text: "Which design answers the question?",
      options: ["A survey", "An interview", "A diary study"],
      answer: [0, 2],
      points: 2,
      attempts: 3,
      feedback: "Both reach enough students.",
    });
  });

  it("takes blanks with one gap, with every answer it accepts", () => {
    expect(
      questionOf("blanks", "id: b1\ntext: The mean is {{12|twelve}} points."),
    ).toEqual({
      kind: "blank",
      text: "The mean is _____ points.",
      answers: ["12", "twelve"],
      points: 1,
    });
  });

  it("leaves blanks with several gaps, put in order and assignments on the page", () => {
    expect(questionOf("blanks", "text: '{{a}} and {{b}}'")).toBeNull();
    expect(questionOf("order", "items: [a, b]")).toBeNull();
    expect(questionOf("assignment", "title: Essay")).toBeNull();
    expect(
      questionOf("quiz", "question: No answer\noptions: [a, b]\nanswer: []"),
    ).toBeNull();
  });

  it("makes an exercise an essay with the model answer as feedback", () => {
    expect(
      questionOf(
        "exercise",
        "id: e1\nprompt: Why pilot?\nanswer: To find problems early.",
      ),
    ).toMatchObject({
      kind: "essay",
      html: "<p>Why pilot?</p>",
      feedback: "To find problems early.",
    });
  });
});

describe("assessmentXml", () => {
  it("writes QTI 1.2 in Common Cartridge's profile", () => {
    const xml = assessmentXml("quiz_1", "Quiz: Lesson 1", [
      questionOf("quiz", QUIZ)!,
      questionOf("blanks", "text: x is {{1}}")!,
    ]);
    expect(xml).toContain("<fieldentry>cc.exam.v0p1</fieldentry>");
    expect(xml).toContain("<fieldentry>cc.multiple_response.v0p1</fieldentry>");
    expect(xml).toContain("<fieldentry>cc.fib.v0p1</fieldentry>");
    expect(xml).toContain(
      "<fieldlabel>cc_maxattempts</fieldlabel><fieldentry>3</fieldentry>",
    );
    expect(xml).toContain('rcardinality="Multiple"');
    expect(xml).toContain(
      '<and><varequal respident="response1" case="Yes">quiz_1_q1_1</varequal><not><varequal respident="response1" case="Yes">quiz_1_q1_2</varequal></not><varequal respident="response1" case="Yes">quiz_1_q1_3</varequal></and>',
    );
    expect(xml).toContain("Both reach enough students.");
    expect(
      new DOMParser()
        .parseFromString(xml, "application/xml")
        .querySelector("parsererror"),
    ).toBeNull();
  });
});

describe("outlineOf", () => {
  it("puts pages in their folders, each followed by its quiz, and loose pages first", () => {
    const outline = outlineOf(
      "Methods",
      [
        { label: "Week 1", depth: 0, folder: true },
        { label: "Sampling", depth: 1, folder: false },
        { label: "Intro", depth: 0, folder: false },
      ],
      [
        {
          title: "Sampling",
          page: "page_1",
          quiz: { id: "quiz_1", title: "Quiz: Sampling" },
        },
        { title: "Intro", page: "page_2" },
      ],
    );
    expect(outline).toEqual([
      {
        id: "general",
        title: "Methods",
        children: [{ id: "item_page_2", title: "Intro", resource: "page_2" }],
      },
      {
        id: "folder1",
        title: "Week 1",
        children: [
          { id: "item_page_1", title: "Sampling", resource: "page_1" },
          { id: "item_quiz_1", title: "Quiz: Sampling", resource: "quiz_1" },
        ],
      },
    ]);
  });
});

describe("slug", () => {
  it("makes names a file can have, once each", () => {
    const taken = new Set<string>();
    expect(slug("Één: week 1?", taken)).toBe("een-week-1");
    expect(slug("Een week 1", taken)).toBe("een-week-1-2");
    expect(slug("???", taken)).toBe("page");
  });
});

describe("manifestXml", () => {
  it("is well-formed XML with the cartridge's version", () => {
    const xml = manifestXml(
      "c1",
      "Methods & more",
      [],
      [
        {
          id: "page_1",
          type: "webcontent",
          href: "wiki_content/a.html",
          files: ["wiki_content/a.html"],
        },
      ],
    );
    expect(xml).toContain("<schemaversion>1.1.0</schemaversion>");
    expect(xml).toContain("Methods &amp; more");
    expect(
      new DOMParser()
        .parseFromString(xml, "application/xml")
        .querySelector("parsererror"),
    ).toBeNull();
  });
});

const job = (markdown: string): ExportJob => ({
  name: "Methods",
  format: "paper",
  notes: false,
  parts: [
    { kind: "page", path: "Lesson.md", title: "Lesson 1", markdown, style: "apa" },
  ],
  contents: null,
});

describe("courseSummary", () => {
  it("counts the questions, and the blocks with answers that stay on the page", () => {
    const markdown = [
      "```quiz",
      QUIZ,
      "```",
      "",
      "```blanks",
      "text: '{{a}} and {{b}}'",
      "```",
      "",
      "```order",
      "items: [a, b]",
      "```",
    ].join("\n");
    expect(courseSummary(job(markdown))).toEqual({ pages: 1, questions: 1, onPage: 2 });
  });
});

describe("makeCourse", () => {
  it("writes each page, takes its questions to a quiz, and keeps no answers on the page", async () => {
    const root = document.createElement("div");
    root.className = "print-root print-paper";
    root.innerHTML = `<section class="print-part"><h1 class="print-title">Lesson 1</h1>
      <div class="tiptap doc"><p class="intro">Read this<sup class="footnote" data-footnote="A note."></sup>.</p>
      ${block("quiz", QUIZ, "<p>Which design answers the question?</p>")}
      ${block("order", "items: [first, second]", '<ul><li><span class="print-box"></span>second</li></ul>')}
      <button>Open</button></div></section>`;
    document.body.replaceChildren(root);
    const zip = await JSZip.loadAsync(await makeCourse(root, job("")));
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual([
      "imsmanifest.xml",
      "quiz_1/",
      "quiz_1/assessment_qti.xml",
      "wiki_content/",
      "wiki_content/lesson-1.html",
    ]);
    const page = await zip.file("wiki_content/lesson-1.html")!.async("string");
    expect(page).toContain("Question 1 of the quiz “Quiz: Lesson 1”.");
    expect(page).toContain("<sup>1</sup>");
    expect(page).toContain("<span>☐ </span>second");
    expect(page).not.toContain("Both reach enough students");
    expect(page).not.toContain("data-tutorial");
    expect(page).not.toContain("class=");
    expect(page).not.toContain("<button");
    expect(page).not.toContain("<h1");
    const manifest = await zip.file("imsmanifest.xml")!.async("string");
    expect(manifest).toContain('type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment"');
    expect(manifest).toContain(
      '<item identifier="item_quiz_1" identifierref="quiz_1"><title>Quiz: Lesson 1</title></item>',
    );
  });
});
