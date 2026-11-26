import JSZip from "jszip";
import { t } from "@scholarkit/i18n";
import { pseudoText } from "./dom";
import type { ContentsLine, ExportJob } from "./job";
import { equationSvg } from "./math";
import { escape, questionOf, type Question } from "./questions";

export { courseSummary, questionOf, type Question } from "./questions";

/**
 * An export as a course for a learning platform: an IMS Common Cartridge
 * 1.1 file that Canvas, Moodle and Brightspace import. Each page becomes
 * a page, and the questions on a page become one quiz after it, in QTI
 * 1.2, which the platform grades itself. Cartridge 1.1 is the newest
 * version Moodle imports, and its quizzes know four kinds of question:
 * one answer, several answers, one blank and an essay. Every other
 * tutorial block stays on its page, as it prints.
 */

const field = (label: string, entry: string) =>
  `<qtimetadatafield><fieldlabel>${label}</fieldlabel><fieldentry>${escape(entry)}</fieldentry></qtimetadatafield>`;

const material = (text: string, html = false) =>
  `<material><mattext texttype="${html ? "text/html" : "text/plain"}">${escape(text)}</mattext></material>`;

const PROFILES: Record<Question["kind"], (question: Question) => string> = {
  choice: (question) =>
    question.kind === "choice" && question.answer.length > 1
      ? "cc.multiple_response.v0p1"
      : "cc.multiple_choice.v0p1",
  blank: () => "cc.fib.v0p1",
  essay: () => "cc.essay.v0p1",
};

/** The feedback every answer shows, when there is one. */
function feedback(text: string) {
  if (!text) return { condition: "", item: "" };
  return {
    condition:
      '<respcondition continue="Yes"><conditionvar><other/></conditionvar><displayfeedback feedbacktype="Response" linkrefid="general_fb"/></respcondition>',
    item: `<itemfeedback ident="general_fb"><flow_mat>${material(text)}</flow_mat></itemfeedback>`,
  };
}

const SCORE =
  '<outcomes><decvar varname="SCORE" vartype="Decimal" minvalue="0" maxvalue="100"/></outcomes>';

/** One question as a QTI item. */
function item(question: Question, id: string): string {
  const meta = `<itemmetadata><qtimetadata>${field("cc_profile", PROFILES[question.kind](question))}${field("cc_weighting", String(question.points))}</qtimetadata></itemmetadata>`;
  if (question.kind === "choice") {
    const many = question.answer.length > 1;
    const labels = question.options
      .map(
        (option, index) =>
          `<response_label ident="${id}_${index + 1}">${material(option)}</response_label>`,
      )
      .join("");
    // Moodle takes the options marked case="Yes" as the correct ones of several.
    const right = (index: number) =>
      `<varequal respident="response1" case="Yes">${id}_${index + 1}</varequal>`;
    const condition = many
      ? `<and>${question.options
          .map((_, index) =>
            question.answer.includes(index)
              ? right(index)
              : `<not>${right(index)}</not>`,
          )
          .join("")}</and>`
      : right(question.answer[0]);
    const notes = feedback(question.feedback);
    return [
      `<item ident="${id}" title="${escape(t("Question"))}">`,
      meta,
      `<presentation>${material(question.text)}<response_lid ident="response1" rcardinality="${many ? "Multiple" : "Single"}"><render_choice>${labels}</render_choice></response_lid></presentation>`,
      `<resprocessing>${SCORE}${notes.condition}<respcondition continue="No"><conditionvar>${condition}</conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing>`,
      notes.item,
      "</item>",
    ].join("");
  }
  if (question.kind === "blank") {
    // The profile has no `or`: the answers it accepts sit side by side, as
    // Common Cartridge's own examples write them and Moodle reads them.
    const answers = `<respcondition continue="No"><conditionvar>${question.answers
      .map(
        (answer) =>
          `<varequal respident="response1" case="No">${escape(answer)}</varequal>`,
      )
      .join(
        "",
      )}</conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>`;
    return [
      `<item ident="${id}" title="${escape(t("Question"))}">`,
      meta,
      `<presentation>${material(question.text)}<response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1"/></render_fib></response_str></presentation>`,
      `<resprocessing>${SCORE}${answers}</resprocessing>`,
      "</item>",
    ].join("");
  }
  const notes = feedback(question.feedback);
  return [
    `<item ident="${id}" title="${escape(t("Question"))}">`,
    meta,
    `<presentation>${material(question.html, true)}<response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str></presentation>`,
    `<resprocessing>${SCORE}${notes.condition}</resprocessing>`,
    notes.item,
    "</item>",
  ].join("");
}

/** The attempts a quiz allows: as often as learners like, unless a question says otherwise. */
function attempts(questions: Question[]): string {
  const most = Math.max(
    0,
    ...questions.map((question) =>
      question.kind === "choice" ? question.attempts : 0,
    ),
  );
  return most > 0 ? String(most) : "unlimited";
}

/** A page's questions as one QTI 1.2 assessment, in Common Cartridge's profile. */
export function assessmentXml(
  id: string,
  title: string,
  questions: Question[],
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/profile/cc/ccv1p1/ccv1p1_qtiasiv1p2p1_v1p0.xsd">',
    `<assessment ident="${id}" title="${escape(title)}">`,
    `<qtimetadata>${field("cc_profile", "cc.exam.v0p1")}${field("qmd_assessmenttype", "Examination")}${field("qmd_scoretype", "Percentage")}${field("cc_maxattempts", attempts(questions))}</qtimetadata>`,
    `<section ident="${id}_section">`,
    ...questions.map((question, index) => item(question, `${id}_q${index + 1}`)),
    "</section>",
    "</assessment>",
    "</questestinterop>",
  ].join("\n");
}

/** A line of the course's outline: a folder, a page or a quiz. */
export interface Outline {
  id: string;
  title: string;
  /** The resource it opens; a folder has none. */
  resource?: string;
  children?: Outline[];
}

export interface Resource {
  id: string;
  type: "webcontent" | "imsqti_xmlv1p2/imscc_xmlv1p1/assessment";
  /** The file a learner opens. A quiz and a set of files have none. */
  href?: string;
  files: string[];
  dependencies?: string[];
}

function outlineXml(line: Outline): string {
  const ref = line.resource ? ` identifierref="${line.resource}"` : "";
  return `<item identifier="${line.id}"${ref}><title>${escape(line.title)}</title>${(line.children ?? []).map(outlineXml).join("")}</item>`;
}

/** The cartridge's table of contents: its outline and the files of each resource. */
export function manifestXml(
  id: string,
  title: string,
  outline: Outline[],
  resources: Resource[],
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<manifest identifier="${id}" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/profile/cc/ccv1p1/ccv1p1_imscp_v1p2_v1p0.xsd http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest http://www.imsglobal.org/profile/cc/ccv1p1/LOM/ccv1p1_lommanifest_v1p0.xsd">`,
    `<metadata><schema>IMS Common Cartridge</schema><schemaversion>1.1.0</schemaversion><lomimscc:lom><lomimscc:general><lomimscc:title><lomimscc:string>${escape(title)}</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom></metadata>`,
    '<organizations><organization identifier="outline" structure="rooted-hierarchy"><item identifier="root">',
    ...outline.map(outlineXml),
    "</item></organization></organizations>",
    "<resources>",
    ...resources.map((resource) =>
      [
        `<resource identifier="${resource.id}" type="${resource.type}"${resource.href ? ` href="${escape(resource.href)}"` : ""}>`,
        ...resource.files.map((file) => `<file href="${escape(file)}"/>`),
        ...(resource.dependencies ?? []).map(
          (dep) => `<dependency identifierref="${dep}"/>`,
        ),
        "</resource>",
      ].join(""),
    ),
    "</resources>",
    "</manifest>",
  ].join("\n");
}

/** A file name a page can have in the cartridge, from its title. */
export function slug(title: string, taken: Set<string>): string {
  const base =
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page";
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  taken.add(name);
  return name;
}

/**
 * The outline of a project as the cartridge lists it: folders with their
 * pages, each page followed by its quiz. `pages` gives each page's
 * resource and quiz, in the order the contents list them. Platforms make
 * each top-level line a section or module, so pages outside folders go
 * together in a first one, named after the course.
 */
export function outlineOf(
  title: string,
  contents: ContentsLine[] | null,
  pages: Array<{ title: string; page: string; quiz?: { id: string; title: string } }>,
): Outline[] {
  const top: Outline[] = [];
  const stack: Array<{ depth: number; children: Outline[] }> = [
    { depth: -1, children: top },
  ];
  let at = 0;
  let folders = 0;
  const lines =
    contents ?? pages.map((page) => ({ label: page.title, depth: 0, folder: false }));
  for (const line of lines) {
    while (stack.length > 1 && stack[stack.length - 1].depth >= line.depth) stack.pop();
    const into = stack[stack.length - 1].children;
    if (line.folder) {
      const folder: Outline = {
        id: `folder${++folders}`,
        title: line.label,
        children: [],
      };
      into.push(folder);
      stack.push({ depth: line.depth, children: folder.children! });
      continue;
    }
    const page = pages[at++];
    if (!page) break;
    into.push({ id: `item_${page.page}`, title: page.title, resource: page.page });
    if (page.quiz) {
      into.push({
        id: `item_${page.quiz.id}`,
        title: page.quiz.title,
        resource: page.quiz.id,
      });
    }
  }
  const loose = top.filter((line) => !line.children);
  if (loose.length === 0 || loose.length === top.length) return top;
  return [
    { id: "general", title, children: loose },
    ...top.filter((line) => line.children),
  ];
}

/* ---- The pages, from what the export drew ---- */

/** Attributes a page keeps; the app's classes and data mean nothing in a learning platform. */
const KEEP = new Set([
  "href",
  "src",
  "alt",
  "title",
  "colspan",
  "rowspan",
  "checked",
  "disabled",
  "type",
  "start",
  "open",
  "width",
  "height",
]);

const BOX = "border:1px solid #d9d4da;border-radius:8px;padding:4px 16px;margin:16px 0";
const SMALL = "font-size:0.85em;color:#6f6571";

/** Inline looks for the app's classes, which the platform's own styles don't know. */
const LOOKS: Array<[string, string]> = [
  [".print-block", BOX],
  [
    ".callout",
    "border-left:3px solid #9a4a1c;background:#f7f4f7;padding:4px 16px;margin:16px 0",
  ],
  [
    ".print-block-kind",
    `${SMALL};font-weight:600;text-transform:uppercase;letter-spacing:0.04em`,
  ],
  [".print-block-hint", SMALL],
  [".footnotes", SMALL],
  [
    "blockquote",
    "border-left:3px solid #d9d4da;margin:16px 0;padding-left:16px;color:#4f4651",
  ],
  ["table", "border-collapse:collapse"],
  ["th, td", "border:1px solid #d9d4da;padding:4px 8px;vertical-align:top"],
  ["pre", "background:#f7f4f7;padding:12px;border-radius:6px;overflow:auto"],
];

/** Files a page uses, gathered for the cartridge. */
class Files {
  readonly entries = new Map<string, Uint8Array | string>();
  private count = 0;
  private known = new Map<string, string>();

  add(bytes: Uint8Array | string, extension: string, key?: string): string {
    const found = key && this.known.get(key);
    if (found) return found;
    const path = `web_resources/${++this.count}.${extension}`;
    this.entries.set(path, bytes);
    if (key) this.known.set(key, path);
    return path;
  }
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

/** An image's bytes, or null when it can't be read. */
async function imageBytes(
  src: string,
): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type };
  } catch {
    return null;
  }
}

/** The words CSS adds before and after elements, such as figure labels, written into the copy. */
function keepAddedText(live: Element, copy: Element) {
  const lives = [live, ...live.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll("*")];
  if (lives.length !== copies.length) return;
  lives.forEach((element, index) => {
    const before = pseudoText(element, "::before");
    const after = pseudoText(element, "::after");
    if (before) copies[index].prepend(before);
    if (after) copies[index].append(after);
  });
}

/** Equations in an element as TeX in `\( \)`, as platforms set them with MathJax. */
function equationsAsTex(element: Element) {
  element
    .querySelectorAll('[data-type="inline-math"], [data-type="block-math"]')
    .forEach((math) => {
      const tex = math.getAttribute("data-latex") ?? "";
      const block = math.getAttribute("data-type") === "block-math";
      const out = element.ownerDocument.createElement(block ? "p" : "span");
      out.textContent = block ? `\\[${tex}\\]` : `\\(${tex}\\)`;
      math.replaceWith(out);
    });
}

/** Strips an element down to plain HTML, with inline looks where the app used classes. */
function plain(element: Element) {
  element
    .querySelectorAll("button, style, script, .slide-foot, .media-loading")
    .forEach((node) => node.remove());
  element
    .querySelectorAll(".print-gap")
    .forEach((gap) => (gap.textContent = " _____ "));
  element
    .querySelectorAll(".print-block-kind > span")
    .forEach((note) => note.prepend(" · "));
  element
    .querySelectorAll(".print-box")
    .forEach(
      (box) => (box.textContent = box.classList.contains("print-round") ? "○ " : "☐ "),
    );
  element
    .querySelectorAll<HTMLInputElement>('li[data-checked] input[type="checkbox"]')
    .forEach((box) => {
      if (box.closest("li")?.getAttribute("data-checked") === "true") {
        box.setAttribute("checked", "");
      }
      box.setAttribute("disabled", "");
    });
  const looks = new Map<Element, string>();
  for (const [selector, look] of LOOKS) {
    element.querySelectorAll(selector).forEach((node) => {
      looks.set(node, [looks.get(node), look].filter(Boolean).join(";"));
    });
  }
  for (const node of [element, ...element.querySelectorAll("*")]) {
    for (const name of node.getAttributeNames()) {
      if (!KEEP.has(name)) node.removeAttribute(name);
    }
    const look = looks.get(node);
    if (look) node.setAttribute("style", look);
  }
}

/** A question's place on its page, where the block was. */
const pointer = (doc: Document, number: number, quiz: string) => {
  const note = doc.createElement("p");
  const em = doc.createElement("em");
  em.textContent = t("Question {number} of the quiz “{quiz}”.", { number, quiz });
  note.append(em);
  return note;
};

/** One page as HTML for the cartridge, with its questions taken out for the quiz. */
async function page(
  live: Element,
  quizTitle: string,
  files: Files,
): Promise<{ body: string; questions: Question[]; files: string[] }> {
  const doc = live.ownerDocument;
  const copy = live.cloneNode(true) as Element;
  keepAddedText(live, copy);
  copy.querySelector(":scope > .print-title")?.remove();

  // Footnote marks are numbered by CSS.
  copy.querySelectorAll("sup.footnote").forEach((mark, index) => {
    mark.textContent = String(index + 1);
  });

  // Questions go to the quiz; the page says where they went.
  const questions: Question[] = [];
  for (const block of copy.querySelectorAll("[data-tutorial]")) {
    if (block.parentElement?.closest("[data-tutorial]")) continue;
    const kind = block.getAttribute("data-tutorial") ?? "";
    const source = block.getAttribute("data-tutorial-source") ?? "";
    let html = "";
    if (kind === "exercise") {
      const prompt = block.cloneNode(true) as Element;
      prompt.querySelector(".print-block-kind")?.remove();
      prompt.querySelectorAll("img").forEach((img) => img.replaceWith(img.alt));
      equationsAsTex(prompt);
      plain(prompt);
      html = prompt.innerHTML;
    }
    const question = questionOf(kind, source, html);
    if (!question) continue;
    questions.push(question);
    block.replaceWith(pointer(doc, questions.length, quizTitle));
  }
  copy
    .querySelectorAll("[data-tutorial-source]")
    .forEach((block) => block.removeAttribute("data-tutorial-source"));

  // Equations as pictures: they look the same in every platform.
  const used: string[] = [];
  for (const math of copy.querySelectorAll(
    '[data-type="inline-math"], [data-type="block-math"]',
  )) {
    const tex = math.getAttribute("data-latex") ?? "";
    const block = math.getAttribute("data-type") === "block-math";
    const set = await equationSvg(tex, block, 16, "1f1a20");
    const out = doc.createElement(block ? "p" : "span");
    if (set) {
      const path = files.add(set.svg, "svg", `math:${block}:${tex}`);
      used.push(path);
      const img = doc.createElement("img");
      img.setAttribute("src", `../${path}`);
      img.setAttribute("alt", tex);
      img.setAttribute("width", String(Math.round(set.width)));
      img.setAttribute("height", String(Math.round(set.height)));
      if (!block)
        img.setAttribute("style", `vertical-align:${(-set.depth).toFixed(1)}px`);
      out.append(img);
      if (block) out.setAttribute("style", "text-align:center");
    } else {
      out.textContent = block ? `\\[${tex}\\]` : `\\(${tex}\\)`;
    }
    math.replaceWith(out);
  }

  // Images go into the cartridge next to the pages.
  const lives = live.querySelectorAll("img");
  const copies = [...copy.querySelectorAll("img")].filter(
    (img) => !img.getAttribute("src")?.startsWith("../"),
  );
  const originals = [...lives];
  for (let i = 0; i < copies.length; i++) {
    const src =
      originals[i]?.currentSrc ||
      originals[i]?.src ||
      copies[i].getAttribute("src") ||
      "";
    const image = src ? await imageBytes(src) : null;
    const extension = image && EXTENSIONS[image.type];
    if (!image || !extension) {
      copies[i].replaceWith(copies[i].alt);
      continue;
    }
    const path = files.add(image.bytes, extension, src);
    used.push(path);
    copies[i].setAttribute("src", `../${path}`);
  }

  // Slides follow each other on the page, with a line between them.
  copy.querySelectorAll(".print-slide + .print-slide").forEach((slide) => {
    slide.before(doc.createElement("hr"));
  });

  // Inline styles the equations set survive; the rest is plain HTML.
  const kept = new Map<Element, string>();
  copy.querySelectorAll("img[style], p[style]").forEach((node) => {
    kept.set(node, node.getAttribute("style") ?? "");
  });
  plain(copy);
  kept.forEach((style, node) => node.setAttribute("style", style));
  return { body: copy.innerHTML, questions, files: [...new Set(used)] };
}

const htmlFile = (title: string, body: string) =>
  [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escape(title)}</title>`,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
  ].join("\n");

/** A random identifier for the cartridge, as XML allows it. */
const randomId = () =>
  `cursive_${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("")}`;

/** The export as a Common Cartridge, from the pages it drew. */
export async function makeCourse(
  root: HTMLElement,
  job: ExportJob,
): Promise<Uint8Array> {
  const zip = new JSZip();
  const files = new Files();
  const resources: Resource[] = [];
  const pages: Parameters<typeof outlineOf>[2] = [];
  const taken = new Set<string>();
  const parts = root.querySelectorAll(":scope > .print-part");
  for (let index = 0; index < job.parts.length; index++) {
    const live = parts[index];
    if (!live) break;
    const title = job.parts[index].title;
    const name = slug(title, taken);
    const quizTitle = t("Quiz: {page}", { page: title });
    const drawn = await page(live, quizTitle, files);
    const href = `wiki_content/${name}.html`;
    zip.file(href, htmlFile(title, drawn.body));
    const id = `page_${index + 1}`;
    resources.push({ id, type: "webcontent", href, files: [href, ...drawn.files] });
    let quiz: { id: string; title: string } | undefined;
    if (drawn.questions.length > 0) {
      quiz = { id: `quiz_${index + 1}`, title: quizTitle };
      const path = `${quiz.id}/assessment_qti.xml`;
      zip.file(path, assessmentXml(quiz.id, quizTitle, drawn.questions));
      resources.push({
        id: quiz.id,
        type: "imsqti_xmlv1p2/imscc_xmlv1p1/assessment",
        files: [path],
      });
    }
    pages.push({ title, page: id, quiz });
  }
  for (const [path, bytes] of files.entries) zip.file(path, bytes);
  zip.file(
    "imsmanifest.xml",
    manifestXml(
      randomId(),
      job.name,
      outlineOf(job.name, job.contents, pages),
      resources,
    ),
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
