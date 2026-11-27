import {
  stringArg,
  toolkit,
  type CardState,
  type Tool,
  type ToolArgs,
  type Toolkit,
} from "@scholarkit/assistant";
import { readPage } from "@scholarkit/editor/lib/page-file";
import { pageLabel } from "@scholarkit/editor/lib/paths";
import { lineWords, searchProject } from "@scholarkit/editor/lib/search";
import {
  lookupOf,
  type FoundPaper,
  type LookedUpWork,
  type PaperSearch,
} from "@scholarkit/editor/references/lookup";
import {
  familyName,
  pageReferences,
  type Reference,
} from "@scholarkit/editor/references/reference";
import { t } from "@scholarkit/i18n";

/**
 * The assistant's tools in Cursive: it lists, reads and searches the
 * project's pages, checks every quote it gives from them, and proposes
 * rewrites, papers to cite and fixes to references as cards that change
 * nothing until you accept them. Papers and works are looked up through
 * our server, never straight at the source.
 */

/** A field of a reference that differs from the work it names. */
export interface ReferenceChange {
  field:
    "title" | "author" | "year" | "container" | "volume" | "issue" | "pages" | "doi";
  before: string;
  after: string;
}

/** What a card shows, and what accepting it does. */
export type CursiveCard = { state?: CardState; note?: string | null } & (
  | {
      type: "quote";
      n: number;
      path: string;
      /** The page's title. */
      source: string;
      quote: string;
    }
  | {
      type: "edit";
      id: number;
      path: string;
      title: string;
      /** For the person, in a sentence or two. */
      explanation: string;
      /** The page's Markdown as the card was made, and as it would be. */
      before: string;
      after: string;
      replacements: Array<{ find: string; replace: string }>;
    }
  | {
      type: "papers";
      id: number;
      papers: FoundPaper[];
      /** The ones cited, by their place in the list. */
      cited?: number[];
      /** Why citing one failed. */
      notes?: Record<number, string>;
    }
  | {
      type: "reference";
      id: number;
      path: string;
      key: string;
      changes: ReferenceChange[];
      /** The reference as it would be. */
      fixed: Reference;
    }
);

/** What the tools reach in the project. */
export interface CursiveHost {
  /** Every page's file, by path. */
  pages(): Record<string, string>;
  /** Papers by their title or authors, through our server. Absent without an account. */
  searchPapers?: (q: string) => Promise<PaperSearch>;
  /** A work by its DOI, ISBN, arXiv or PubMed ID, through our server. Absent without an account. */
  lookUp?: (
    kind: "doi" | "isbn" | "arxiv" | "pubmed",
    id: string,
  ) => Promise<LookedUpWork | null>;
}

/** Numbers shared by one conversation: citations and cards. */
export interface Numbering {
  quotes: Array<{ path: string; quote: string; n: number }>;
  cards: number;
}

export const newNumbering = (): Numbering => ({ quotes: [], cards: 0 });

/** Room for one tool's answer, in characters. */
const ROOM = 16_000;

const objectOf = (properties: Record<string, object>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
});

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });

const numberArg = (args: ToolArgs, name: string): number | null => {
  const value = args[name];
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && value !== null && value !== "" ? Math.round(n) : null;
};

/** Authors as a citation shortens them: "Clinton", "Mangen and Kuiken", "Delgado et al.". */
export function authorsShort(authors: string[]): string {
  const names = authors.map(familyName).filter(Boolean);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} et al.`;
}

/** Text with the Markdown taken out and the spaces made one, to compare quotes in. */
function plainLines(markdown: string): string {
  let fence = false;
  const out: string[] = [];
  for (const raw of markdown.split("\n")) {
    if (/^\s*(`{3,}|~{3,})/.test(raw)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const line = lineWords(raw);
    if (line) out.push(line);
  }
  return out.join(" ");
}

const fold = (text: string) =>
  text
    .normalize("NFKC")
    // Emphasis marks: the page shows the words without them.
    .replace(/[*_]/g, "")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();

/** Whether a page says `quote`, word for word: case, quote marks and spacing aside. */
export function pageSays(markdown: string, quote: string): boolean {
  const needle = fold(quote.replace(/^["“'‘]+|["”'’]+$/g, ""));
  return needle.length > 0 && fold(plainLines(markdown)).includes(needle);
}

/** How often `find` is in `text`, up to two. */
function occurrences(text: string, find: string): number {
  const first = text.indexOf(find);
  if (first < 0) return 0;
  return text.indexOf(find, first + find.length) < 0 ? 1 : 2;
}

/**
 * Makes the replacements in a page's Markdown. Each `find` must be in
 * it exactly once. Throws with what went wrong, for the model.
 */
export function replaceIn(
  markdown: string,
  replacements: Array<{ find: string; replace: string }>,
): string {
  let out = markdown;
  for (const { find, replace } of replacements) {
    if (!find) throw new Error("A `find` is empty: copy a few words of the page.");
    const count = occurrences(out, find);
    if (count === 0)
      throw new Error(
        `"${find.slice(0, 80)}" isn't in the page. Copy it exactly from read_page.`,
      );
    if (count > 1)
      throw new Error(
        `"${find.slice(0, 80)}" is in the page more than once. Make it longer, so it is there once.`,
      );
    out = out.replace(find, () => replace);
  }
  return out;
}

const COMPARED: ReferenceChange["field"][] = [
  "title",
  "author",
  "year",
  "container",
  "volume",
  "issue",
  "pages",
  "doi",
];

const valueOf = (ref: Reference | LookedUpWork, field: ReferenceChange["field"]) =>
  field === "author" ? ref.author.join("; ") : String(ref[field] ?? "");

const same = (a: string, b: string) =>
  a
    .replace(/[\s.,:;]+/g, " ")
    .trim()
    .toLocaleLowerCase() ===
  b
    .replace(/[\s.,:;]+/g, " ")
    .trim()
    .toLocaleLowerCase();

/** Where a reference differs from the work it names; the work's empty fields aside. */
export function referenceChanges(
  ref: Reference,
  work: LookedUpWork,
): ReferenceChange[] {
  const changes: ReferenceChange[] = [];
  for (const field of COMPARED) {
    const before = valueOf(ref, field);
    const after = valueOf(work, field);
    if (after.trim() && !same(before, after)) changes.push({ field, before, after });
  }
  return changes;
}

/** A reference with the work's fields where they differ. */
function fixedReference(
  ref: Reference,
  changes: ReferenceChange[],
  work: LookedUpWork,
) {
  const fixed: Reference = { ...ref };
  for (const change of changes) {
    if (change.field === "author") fixed.author = work.author;
    else fixed[change.field] = work[change.field];
  }
  return fixed;
}

export function cursiveKit(
  host: CursiveHost,
  numbers: Numbering,
): Toolkit<CursiveCard> {
  const card = () => ++numbers.cards;
  const pageAt = (args: ToolArgs) => {
    const path = stringArg(args, "path") ?? "";
    const source = host.pages()[path];
    if (source === undefined)
      throw new Error(`No page at "${path}". Take a path from list_pages.`);
    return { path, source, page: readPage(source), title: pageLabel(path, source) };
  };
  const titleOf = (args: ToolArgs) => {
    const path = stringArg(args, "path") ?? "";
    const source = host.pages()[path];
    return source === undefined ? path : pageLabel(path, source);
  };

  const tools: Tool<CursiveCard>[] = [
    {
      name: "list_pages",
      description:
        "Lists the project's pages: their paths, titles and length. Paths are what the other tools take.",
      parameters: objectOf({}),
      kind: "read",
      run: async () => {
        const lines = Object.entries(host.pages())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([path, source]) => {
            const page = readPage(source);
            const words = plainLines(page.markdown).split(" ").filter(Boolean).length;
            const refs = pageReferences(page.markdown).length;
            return [
              path,
              `"${pageLabel(path, source)}"`,
              `${words} words`,
              refs ? `${refs} references` : "",
            ]
              .filter(Boolean)
              .join(" | ");
          });
        return lines.length ? lines.join("\n") : "The project has no pages.";
      },
      describe: () => t("Looked at the pages"),
    },
    {
      name: "read_page",
      description:
        "Reads a page's Markdown, as it is in its file. Long pages come in parts: read on with `from`, a line number.",
      parameters: objectOf(
        {
          path: str("The page's path."),
          from: int("The first line, from 1."),
        },
        ["path"],
      ),
      kind: "read",
      run: async (args) => {
        const { page, title } = pageAt(args);
        const lines = page.markdown.split("\n");
        const from = Math.max(1, numberArg(args, "from") ?? 1);
        let out = "";
        let last = from - 1;
        for (let i = from - 1; i < lines.length; i++) {
          if (out.length + lines[i].length > ROOM) break;
          out += `${lines[i]}\n`;
          last = i + 1;
        }
        const more =
          last < lines.length ? `\n[cut: read on from line ${last + 1}]` : "";
        return `"${title}", lines ${from} to ${last} of ${lines.length}:\n\n${out.trimEnd()}${more}`;
      },
      describe: (args) => t("Read “{title}”", { title: titleOf(args) }),
    },
    {
      name: "search_pages",
      description:
        "Searches the project's pages for words, accents and case aside. Gives the pages that have them, with the lines they are on.",
      parameters: objectOf({ query: str("A word or a few words.") }, ["query"]),
      kind: "read",
      run: async (args) => {
        const query = (stringArg(args, "query") ?? "").trim();
        const pages = host.pages();
        let results = searchProject(pages, query, 12);
        // No page has the words together: the pages with most of them apart.
        if (!results.length) {
          const words = query.split(/\s+/).filter((word) => word.length > 2);
          const hits = new Map<string, (typeof results)[number]>();
          const score = new Map<string, number>();
          for (const word of words)
            for (const result of searchProject(pages, word, 12)) {
              score.set(result.path, (score.get(result.path) ?? 0) + 1);
              if (!hits.has(result.path)) hits.set(result.path, result);
            }
          results = [...hits.values()]
            .sort((a, b) => (score.get(b.path) ?? 0) - (score.get(a.path) ?? 0))
            .slice(0, 12);
        }
        if (!results.length) return `No page has "${query}".`;
        return results
          .map(
            (result) =>
              `[${result.path}] "${result.title}"\n` +
              result.excerpts
                .map((e) => `  …${e.before}${e.match}${e.after}…`)
                .join("\n"),
          )
          .join("\n\n");
      },
      describe: (args) =>
        t("Searched the pages for “{query}”", {
          query: stringArg(args, "query") ?? "",
        }),
    },
    {
      name: "quote",
      description:
        "Checks a quote from one of the project's pages, word for word, before you use it in an answer. Gives the number to cite it by, as [n] after the statement it backs. Quote 5 to 25 words exactly as the page has them.",
      parameters: objectOf(
        {
          path: str("The page's path."),
          quote: str("The words, copied exactly from the page."),
        },
        ["path", "quote"],
      ),
      kind: "read",
      run: async (args) => {
        const { path, page, title } = pageAt(args);
        const quote = (stringArg(args, "quote") ?? "").trim();
        if (!pageSays(page.markdown, quote))
          return `Not found word for word in "${title}". Don't use this quote: read the page again and copy its words exactly.`;
        // A quote cited before keeps its number, and shows again under this answer.
        const known = numbers.quotes.find((q) => q.path === path && q.quote === quote);
        const n = known?.n ?? numbers.quotes.length + 1;
        if (!known) numbers.quotes.push({ path, quote, n });
        return {
          result: `Checked. Cite it as [${n}].`,
          attachment: { type: "quote", n, path, source: title, quote },
        };
      },
      describe: (_args, result) =>
        result.startsWith("Checked")
          ? t("Checked a quote")
          : t("A quote wasn't in the page"),
    },
    {
      name: "propose_edit",
      description:
        "Proposes a change to a page, as a card the user applies or discards: a rewrite of a sentence or a paragraph, a translation, a fix. Nothing is written by this tool. Each `find` is copied exactly from the page's Markdown (read_page) and is in it once; keep it short but unique. Keep the Markdown as it is around what you change: citations like [@key], links, footnotes.",
      parameters: objectOf(
        {
          path: str("The page's path."),
          explanation: str("One sentence for the user on what the change does."),
          replacements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                find: str("The words to replace, copied exactly."),
                replace: str("What takes their place."),
              },
              required: ["find", "replace"],
            },
          },
        },
        ["path", "explanation", "replacements"],
      ),
      kind: "propose",
      run: async (args) => {
        const { path, page, title } = pageAt(args);
        const replacements = (
          Array.isArray(args.replacements)
            ? (args.replacements as Array<Record<string, unknown>>)
            : []
        )
          .map((r) => ({
            find: typeof r.find === "string" ? r.find : "",
            replace: typeof r.replace === "string" ? r.replace : "",
          }))
          .filter((r) => r.find !== r.replace);
        if (!replacements.length) return "Error: nothing to change.";
        let after: string;
        try {
          after = replaceIn(page.markdown, replacements);
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : String(error)}`;
        }
        const id = card();
        return {
          result: `Proposed as card ${id}. The user applies or discards it.`,
          attachment: {
            type: "edit",
            id,
            path,
            title,
            explanation: (stringArg(args, "explanation") ?? "").trim(),
            before: page.markdown,
            after,
            replacements,
          },
        };
      },
      describe: (args, result) =>
        result.startsWith("Error")
          ? t("Couldn't propose a change to “{title}”", { title: titleOf(args) })
          : t("Proposed a change to “{title}”", { title: titleOf(args) }),
    },
  ];

  if (host.searchPapers) {
    const search = host.searchPapers;
    tools.push({
      name: "find_papers",
      description:
        "Finds papers by their title, authors or topic words, through Scholarkit's server (OpenAlex). Shows them as cards the user can cite from, at the selection or the caret. Search with the words a paper on the claim would have in its title.",
      parameters: objectOf({ query: str("Title words, authors or a topic.") }, [
        "query",
      ]),
      kind: "propose",
      run: async (args) => {
        const query = stringArg(args, "query") ?? "";
        const found = await search(query);
        const papers = found.works.slice(0, 5);
        if (!papers.length) return `No papers found for "${query}".`;
        const list = papers.map(
          (paper, i) =>
            `${i + 1}. "${paper.title}" (${authorsShort(paper.author)} ${paper.year})${paper.container ? `, ${paper.container}` : ""}${paper.doi ? `, DOI ${paper.doi}` : ""}`,
        );
        const id = card();
        return {
          result: `Shown as card ${id}, where the user can cite them:\n${list.join("\n")}`,
          attachment: { type: "papers", id, papers },
        };
      },
      describe: (args) =>
        t("Searched papers for “{query}”", { query: stringArg(args, "query") ?? "" }),
    });
  }

  if (host.lookUp) {
    const lookUp = host.lookUp;
    const describeWork = (work: LookedUpWork) =>
      [
        `Title: ${work.title}`,
        work.author.length ? `Authors: ${work.author.join("; ")}` : "",
        work.year ? `Year: ${work.year}` : "",
        work.container ? `Published in: ${work.container}` : "",
        work.volume ? `Volume: ${work.volume}` : "",
        work.issue ? `Issue: ${work.issue}` : "",
        work.pages ? `Pages: ${work.pages}` : "",
        work.publisher ? `Publisher: ${work.publisher}` : "",
        work.doi ? `DOI: ${work.doi}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    tools.push(
      {
        name: "look_up_work",
        description:
          "Looks a work up by its DOI, ISBN, arXiv or PubMed ID, through Scholarkit's server.",
        parameters: objectOf({ id: str("The DOI, ISBN, arXiv or PubMed ID.") }, ["id"]),
        kind: "read",
        run: async (args) => {
          const asked = stringArg(args, "id") ?? "";
          const lookup = lookupOf(asked);
          if (!lookup) return `"${asked}" isn't a DOI, ISBN, arXiv or PubMed ID.`;
          const work = await lookUp(lookup.kind, lookup.id);
          return work ? describeWork(work) : `No work found for ${asked}.`;
        },
        describe: (args) => t("Looked up {id}", { id: stringArg(args, "id") ?? "" }),
      },
      {
        name: "check_reference",
        description:
          "Checks a reference in a page's reference list against the work it names, by its DOI, through Scholarkit's server. When fields differ, shows a card the user can fix the reference with.",
        parameters: objectOf(
          {
            path: str("The page's path."),
            key: str("The reference's key, as cited: [@key]."),
          },
          ["path", "key"],
        ),
        kind: "propose",
        run: async (args) => {
          const { path, page } = pageAt(args);
          const key = (stringArg(args, "key") ?? "")
            .replace(/^\[?@/, "")
            .replace(/\]$/, "");
          const ref = pageReferences(page.markdown).find((r) => r.key === key);
          if (!ref) return `The page has no reference "${key}".`;
          const lookup = ref.doi ? lookupOf(ref.doi) : null;
          if (!lookup)
            return `"${key}" has no DOI to check it by. Compare it by hand with find_papers, or ask the user for its DOI.`;
          const work = await lookUp(lookup.kind, lookup.id);
          if (!work) return `No work found for the DOI ${ref.doi}.`;
          const changes = referenceChanges(ref, work);
          if (!changes.length)
            return `"${key}" matches the work its DOI names:\n${describeWork(work)}`;
          const id = card();
          return {
            result:
              `"${key}" differs from the work its DOI names. Shown as card ${id}, which the user can fix it with:\n` +
              changes.map((c) => `${c.field}: "${c.before}" → "${c.after}"`).join("\n"),
            attachment: {
              type: "reference",
              id,
              path,
              key,
              changes,
              fixed: fixedReference(ref, changes, work),
            },
          };
        },
        describe: (args) =>
          t("Checked the reference {key}", { key: stringArg(args, "key") ?? "" }),
      },
    );
  }

  return toolkit(tools);
}

/** The step running now, as the person reads it. */
export function describeStart(tool: string): string {
  switch (tool) {
    case "list_pages":
      return t("Looking at the pages…");
    case "read_page":
      return t("Reading a page…");
    case "search_pages":
      return t("Searching the pages…");
    case "quote":
      return t("Checking a quote…");
    case "propose_edit":
      return t("Writing a change…");
    case "find_papers":
      return t("Searching papers…");
    case "look_up_work":
      return t("Looking it up…");
    case "check_reference":
      return t("Checking a reference…");
    default:
      return t("Working…");
  }
}

/** What the assistant is and how it works in Cursive. */
export function systemPrompt(papers: boolean): string {
  return `You are the assistant in Cursive, where people write notes, papers, course pages and slides as pages of Markdown in a project. Citations look like [@key] and name a reference in the page's reference list.

How you work:
- You change nothing yourself. A change to a page is a card from propose_edit that the user applies; say in one sentence what it does. Read the page first and copy each \`find\` exactly.
- When you rewrite (shorter, clearer, a translation, spelling), keep what the text says: don't add claims, and keep its citations, links and footnotes where they belong.
- When you answer from the project, check each quote with the quote tool and cite it as [n] right after the statement it backs, with the number the tool gave. Never make up a number.${papers ? "\n- To find a source for a claim use find_papers; the user cites a paper from its card. Never write a citation key yourself for a paper the page doesn't have. To check a reference, use check_reference." : "\n- Finding papers and checking references needs a Scholarkit account; when asked, say so."}
- Write plainly, in short sentences, in the user's language. Keep answers short: a few sentences or a short list.`;
}

/** What the next question carries: the open page, a selection in it. */
export interface AskContext {
  page: { path: string; title: string } | null;
  selection: string | null;
}

/** The user's question as the model reads it, with what it is about. */
export function userMessage(question: string, context: AskContext): string {
  const about: string[] = [];
  if (context.page)
    about.push(
      `The user has "${context.page.title}" open (path: ${context.page.path}).`,
    );
  if (context.selection) about.push(`They selected this in it: "${context.selection}"`);
  return about.length ? `${about.join(" ")}\n\n${question}` : question;
}
