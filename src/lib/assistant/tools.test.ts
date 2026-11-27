import { describe, expect, it, vi } from "vitest";
import type { ToolOutcome } from "@scholarkit/assistant";
import { writePage } from "@scholarkit/editor/lib/page-file";
import type { LookedUpWork } from "@scholarkit/editor/references/lookup";
import {
  cursiveKit,
  newNumbering,
  pageSays,
  replaceIn,
  userMessage,
  type CursiveCard,
  type CursiveHost,
} from "./tools";

const ESSAY = writePage({
  title: "Reading on screens",
  properties: "",
  markdown: `Students who read on **paper** remember more of the argument [@clinton2019].

Reading on screen isn't slower. But the eyes move faster than the thinking.

\`\`\`bibliography
- key: clinton2019
  type: article
  author:
    - Clinton, Virginia
  title: Reading from paper compared to screens
  year: "2018"
  doi: 10.1111/1467-9817.12269
\`\`\`
`,
});
const PLAN = writePage({
  title: "Course plan",
  properties: "",
  markdown: "Week 1: reading on paper and on screens.\n",
});

const WORK: LookedUpWork = {
  type: "article",
  author: ["Clinton, Virginia"],
  editor: [],
  title:
    "Reading from paper compared to screens: A systematic review and meta-analysis",
  year: "2019",
  container: "Journal of Research in Reading",
  publisher: "",
  place: "",
  volume: "42",
  issue: "2",
  pages: "288-325",
  doi: "10.1111/1467-9817.12269",
  url: "",
  isbn: "",
  arxiv: "",
  pmid: "",
};

function host(overrides: Partial<CursiveHost> = {}): CursiveHost {
  return {
    pages: () => ({ "Reading on screens.md": ESSAY, "Course/Course plan.md": PLAN }),
    ...overrides,
  };
}

async function run(kit: ReturnType<typeof cursiveKit>, name: string, args: object) {
  const tool = kit.get(name);
  if (!tool) throw new Error(`no tool ${name}`);
  const out = await tool.run(args as Record<string, unknown>);
  return typeof out === "string"
    ? { result: out, attachment: undefined }
    : (out as ToolOutcome<CursiveCard>);
}

describe("Cursive's tools", () => {
  it("list, read and search the pages", async () => {
    const kit = cursiveKit(host(), newNumbering());
    const list = (await run(kit, "list_pages", {})).result;
    expect(list).toContain('Course/Course plan.md | "Course plan"');
    expect(list).toContain("1 references");
    expect(
      (await run(kit, "read_page", { path: "Course/Course plan.md" })).result,
    ).toBe(
      '"Course plan", lines 1 to 2 of 2:\n\nWeek 1: reading on paper and on screens.',
    );
    await expect(run(kit, "read_page", { path: "Nope.md" })).rejects.toThrow(
      "list_pages",
    );
    // The words apart, when no page has them together.
    const found = (await run(kit, "search_pages", { query: "screens thinking" }))
      .result;
    expect(found.split("\n\n")[0]).toContain("[Reading on screens.md]");
  });

  it("check quotes word for word, Markdown aside, and number them once", async () => {
    const numbers = newNumbering();
    const kit = cursiveKit(host(), numbers);
    const quote = "Students who read on paper remember more of the argument";
    const first = await run(kit, "quote", { path: "Reading on screens.md", quote });
    expect(first.result).toBe("Checked. Cite it as [1].");
    expect(first.attachment).toMatchObject({
      type: "quote",
      n: 1,
      source: "Reading on screens",
    });
    const again = await run(kit, "quote", { path: "Reading on screens.md", quote });
    expect(again.result).toContain("[1]");
    const wrong = await run(kit, "quote", {
      path: "Reading on screens.md",
      quote: "students remember everything they read on paper",
    });
    expect(wrong.result).toMatch(/^Not found/);
    expect(numbers.quotes).toHaveLength(1);
  });

  it("propose a change only when each find is there once", async () => {
    const kit = cursiveKit(host(), newNumbering());
    const { attachment } = await run(kit, "propose_edit", {
      path: "Reading on screens.md",
      explanation: "Shorter.",
      replacements: [
        { find: "isn't slower. But the eyes", replace: "isn't slower, but the eyes" },
      ],
    });
    expect(attachment).toMatchObject({
      type: "edit",
      id: 1,
      title: "Reading on screens",
    });
    const card = attachment as Extract<CursiveCard, { type: "edit" }>;
    expect(card.after).toContain("isn't slower, but the eyes move");
    const twice = await run(kit, "propose_edit", {
      path: "Reading on screens.md",
      explanation: "",
      replacements: [{ find: "on", replace: "upon" }],
    });
    expect(twice.result).toMatch(/^Error: .*more than once/);
    expect(twice.attachment).toBeUndefined();
  });

  it("offer papers and lookups only with an account", async () => {
    const kit = cursiveKit(host(), newNumbering());
    expect(kit.get("find_papers")).toBeUndefined();
    expect(kit.get("check_reference")).toBeUndefined();
  });

  it("check a reference against the work its DOI names, and propose the fix", async () => {
    const lookUp = vi.fn(async () => WORK);
    const kit = cursiveKit(host({ lookUp }), newNumbering());
    const { result, attachment } = await run(kit, "check_reference", {
      path: "Reading on screens.md",
      key: "@clinton2019",
    });
    expect(lookUp).toHaveBeenCalledWith("doi", "10.1111/1467-9817.12269");
    expect(result).toContain('year: "2018" → "2019"');
    const card = attachment as Extract<CursiveCard, { type: "reference" }>;
    expect(card.changes.map((c) => c.field)).toEqual([
      "title",
      "year",
      "container",
      "volume",
      "issue",
      "pages",
    ]);
    expect(card.fixed).toMatchObject({
      key: "clinton2019",
      year: "2019",
      volume: "42",
    });
  });

  it("make replacements, and say why one can't be made", () => {
    expect(replaceIn("a b c", [{ find: "b", replace: "B" }])).toBe("a B c");
    expect(() => replaceIn("a b c", [{ find: "x", replace: "y" }])).toThrow("isn't in");
    expect(pageSays("A *really* “good” idea.", 'a really "good" idea')).toBe(true);
  });

  it("tell the model what the question is about", () => {
    expect(
      userMessage("Shorter?", {
        page: { path: "Reading on screens.md", title: "Reading on screens" },
        selection: "Reading on screen isn't slower.",
      }),
    ).toBe(
      'The user has "Reading on screens" open (path: Reading on screens.md). They selected this in it: "Reading on screen isn\'t slower."\n\nShorter?',
    );
  });
});
