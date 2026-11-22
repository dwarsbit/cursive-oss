// @vitest-environment happy-dom
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { base64, inlineRuns, plainText, texText } from "./dom";
import { makeDocx } from "./docx";
import { makeHtml } from "./html";
import type { ExportJob } from "./job";
import { makePptx } from "./pptx";

/** A page as the export draws it, without the editor around it. */
function drawn(html: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "print-root print-paper";
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}

const PAGE = `
<section class="print-part">
  <h1 class="print-title">Pilot study</h1>
  <div><div class="tiptap ProseMirror doc" contenteditable="false">
    <p>Students skip items<sup class="footnote" data-footnote="Twelve of 40."></sup> in <strong>section 3</strong>, see <a href="https://example.com">the site</a>.</p>
    <h2>Open tasks</h2>
    <ul data-type="taskList">
      <li data-checked="true"><label><input type="checkbox"></label><div><p>Book the room</p></div></li>
      <li data-checked="false"><label><input type="checkbox"></label><div><p>Print the forms</p></div></li>
    </ul>
    <ol><li><p>First</p></li><li><p>Second</p></li></ol>
    <div class="tableWrapper"><table><tbody>
      <tr><th><p>Week</p></th><th><p>Step</p></th></tr>
      <tr><td><p>46</p></td><td><p>Pilot</p></td></tr>
    </tbody></table></div>
    <pre><code>score &lt;- 1</code></pre>
  </div></div>
  <ol class="footnotes"><li><span>Twelve of 40.</span></li></ol>
</section>`;

const paperJob: ExportJob = {
  name: "Pilot study",
  format: "paper",
  notes: false,
  parts: [
    {
      kind: "page",
      path: "Pilot study.md",
      title: "Pilot study",
      markdown: "",
      style: "apa",
    },
  ],
  contents: null,
};

const unzip = async (bytes: Uint8Array) => JSZip.loadAsync(bytes);

describe("texText", () => {
  it("writes simple equations as characters", () => {
    expect(texText("x^2 + y_i")).toBe("x² + yᵢ");
    expect(texText("\\alpha \\leq 0.05")).toBe("α ≤ 0.05");
  });

  it("keeps the TeX of an equation it can't write as characters", () => {
    expect(texText("\\frac{1}{n}")).toBe("\\frac{1}{n}");
  });
});

describe("inlineRuns", () => {
  it("reads links, footnotes and the text around them", () => {
    const root = drawn(PAGE);
    const runs = inlineRuns(root.querySelector(".doc p")!);
    expect(plainText(runs)).toBe("Students skip items1 in section 3, see the site.");
    expect(runs.find((run) => run.href)).toMatchObject({
      text: "the site",
      href: "https://example.com",
    });
    expect(runs.some((run) => run.footnote === 1)).toBe(true);
  });

  it("leaves out a checkbox's label", () => {
    const root = drawn(PAGE);
    expect(plainText(inlineRuns(root.querySelector("li[data-checked]")!))).toBe(
      "Book the room",
    );
  });
});

describe("base64", () => {
  it("encodes bytes", () => {
    expect(base64(new TextEncoder().encode("Cursive"))).toBe("Q3Vyc2l2ZQ==");
  });
});

describe("makeDocx", () => {
  it("writes headings, lists, tables, code and footnotes as Word's own", async () => {
    const zip = await unzip(await makeDocx(drawn(PAGE), paperJob));
    const body = await zip.file("word/document.xml")!.async("string");
    const notes = await zip.file("word/footnotes.xml")!.async("string");
    expect(body).toContain('w:val="Heading1"');
    expect(body).toContain('w:val="Heading3"');
    expect(body).toContain("Pilot study");
    expect(body).toContain("☑ ");
    expect(body).toContain("☐ ");
    expect(body).toContain("<w:numPr>");
    expect(body).toContain("<w:tbl>");
    expect(body).toContain("score &lt;- 1");
    expect(body).toContain("w:footnoteReference");
    expect(notes).toContain("Twelve of 40.");
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain("https://example.com");
  });
});

describe("makeHtml", () => {
  it("makes one file with the pages and the styles, not editable", async () => {
    const html = await makeHtml(drawn(PAGE), paperJob);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>Pilot study</title>");
    expect(html).toContain("Book the room");
    expect(html).not.toContain("contenteditable");
    expect(html).toMatch(/<input type="checkbox"[^>]*checked/);
  });
});

describe("makePptx", () => {
  it("makes a slide for each slide, with the speaker notes", async () => {
    const root = drawn(
      [1, 2]
        .map(
          (n) => `
<div class="print-slide" data-part="0"><div class="slide"><div class="slide-page slide-content">
  <div class="slide-body"><div><div class="doc"><h2>Slide ${n}</h2><ul><li><p>Point ${n}</p></li></ul></div></div></div>
  <div class="slide-foot"><span>Talk</span><span>${n}</span></div>
</div></div></div>`,
        )
        .join(""),
    );
    root.className = "print-root print-slides";
    const job: ExportJob = {
      name: "Talk",
      format: "slides",
      notes: false,
      parts: [
        {
          kind: "slides",
          path: "Talk.md",
          title: "Talk",
          style: "apa",
          slides: [
            {
              layout: "content",
              small: false,
              body: "",
              notes: "Open with the question.",
            },
            { layout: "content", small: false, body: "", notes: "" },
          ],
        },
      ],
      contents: null,
    };
    const [file] = await makePptx(root, job);
    expect(file.name).toBe("Talk");
    const zip = await unzip(file.bytes);
    const slide = await zip.file("ppt/slides/slide2.xml")!.async("string");
    expect(slide).toContain("Slide 2");
    expect(slide).toContain("Point 2");
    expect(zip.file("ppt/slides/slide3.xml")).toBeNull();
    const notes = Object.keys(zip.files).filter((name) =>
      name.startsWith("ppt/notesSlides/notesSlide"),
    );
    const texts = await Promise.all(
      notes.map((name) => zip.file(name)!.async("string")),
    );
    expect(texts.join("")).toContain("Open with the question.");
  });
});
