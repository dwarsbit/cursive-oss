import type { ChainedCommands, Editor } from "@tiptap/core";
import type { LucideIcon } from "lucide-react";
import { newSource, type TutorialKind } from "../tutorial/blocks";
import { addTableCaption } from "./numbering";
import {
  BookA,
  BookMarked,
  AtSign,
  Captions,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Code,
  Columns2,
  FileText,
  Image,
  Paperclip,
  Info,
  Layers,
  List,
  ListOrdered,
  Minus,
  PenLine,
  Play,
  Quote,
  SquareCheck,
  Superscript,
  Table,
  Target,
  TextCursorInput,
} from "lucide-react";
import { msg, t } from "@scholarkit/i18n";

/**
 * Asks the open editor to let the reader pick files from their
 * computer: images, or files of any kind.
 */
function requestFiles(kind: "image" | "file"): boolean {
  window.dispatchEvent(new CustomEvent("cursive:add-files", { detail: kind }));
  return true;
}

/** A block the slash menu and the "Turn into" menu can make. */
export interface BlockItem {
  id: string;
  title: string;
  description: string;
  /** Extra words the slash menu's filter matches. */
  keywords: string[];
  group: "Basic blocks" | "More blocks" | "Media" | "References" | "Tutorial blocks";
  /** The tile: a few letters or an icon. */
  glyph: string | LucideIcon;
  /** The block opens a field of its own, so the caret doesn't go back to the page. */
  opensField?: boolean;
  /** Whether a block with text can be turned into this one. */
  turnInto: boolean;
  isActive?: (editor: Editor) => boolean;
  run: (chain: ChainedCommands) => ChainedCommands;
}

/** The tutorial blocks, in the order the slash menu lists them. */
const TUTORIAL: Array<{
  id: TutorialKind;
  title: string;
  description: string;
  keywords: string[];
  glyph: LucideIcon;
}> = [
  {
    id: "goals",
    title: t("Learning goals"),
    description: t("What a learner can do after this page"),
    keywords: ["objectives", "outcomes", "aims"],
    glyph: Target,
  },
  {
    id: "terms",
    title: t("Key terms"),
    description: t("Terms with their definitions"),
    keywords: ["glossary", "definition", "vocabulary"],
    glyph: BookA,
  },
  {
    id: "video",
    title: t("Video"),
    description: t("A YouTube or Vimeo video, or a video file"),
    keywords: ["youtube", "vimeo", "movie", "clip"],
    glyph: Play,
  },
  {
    id: "compare",
    title: t("Before and after"),
    description: t("A weak version next to a better one"),
    keywords: ["compare", "example", "good", "bad"],
    glyph: Columns2,
  },
  {
    id: "quiz",
    title: t("Quiz"),
    description: t("A question with answers to choose from"),
    keywords: ["question", "multiple", "choice", "test"],
    glyph: CircleHelp,
  },
  {
    id: "blanks",
    title: t("Fill in the blanks"),
    description: t("A text with words to fill in"),
    keywords: ["gap", "cloze", "missing"],
    glyph: TextCursorInput,
  },
  {
    id: "order",
    title: t("Put in order"),
    description: t("Items to sort into the correct order"),
    keywords: ["sort", "sequence", "rank", "steps"],
    glyph: ListOrdered,
  },
  {
    id: "exercise",
    title: t("Exercise"),
    description: t("An open question with a hint and a model answer"),
    keywords: ["practice", "hint", "answer"],
    glyph: PenLine,
  },
  {
    id: "flashcards",
    title: t("Flashcards"),
    description: t("Cards to turn over"),
    keywords: ["cards", "memorize", "flip"],
    glyph: Layers,
  },
  {
    id: "assignment",
    title: t("Assignment"),
    description: t("Work that learners hand in"),
    keywords: ["homework", "submit", "task", "rubric"],
    glyph: ClipboardList,
  },
];

export const BLOCKS: BlockItem[] = [
  {
    id: "text",
    title: t("Text"),
    description: t("A plain paragraph"),
    keywords: ["paragraph", "plain"],
    group: msg("Basic blocks"),
    glyph: "Aa",
    turnInto: true,
    run: (chain) => chain.clearNodes(),
  },
  {
    id: "heading-1",
    title: t("Heading 1"),
    description: t("Large section heading"),
    keywords: ["h1", "title"],
    group: msg("Basic blocks"),
    glyph: "H1",
    turnInto: true,
    isActive: (editor) => editor.isActive("heading", { level: 1 }),
    run: (chain) => chain.clearNodes().setNode("heading", { level: 1 }),
  },
  {
    id: "heading-2",
    title: t("Heading 2"),
    description: t("Medium section heading"),
    keywords: ["h2", "subtitle"],
    group: msg("Basic blocks"),
    glyph: "H2",
    turnInto: true,
    isActive: (editor) => editor.isActive("heading", { level: 2 }),
    run: (chain) => chain.clearNodes().setNode("heading", { level: 2 }),
  },
  {
    id: "heading-3",
    title: t("Heading 3"),
    description: t("Small section heading"),
    keywords: ["h3"],
    group: msg("Basic blocks"),
    glyph: "H3",
    turnInto: true,
    isActive: (editor) => editor.isActive("heading", { level: 3 }),
    run: (chain) => chain.clearNodes().setNode("heading", { level: 3 }),
  },
  {
    id: "to-do",
    title: t("To-do list"),
    description: t("Track tasks with checkboxes"),
    keywords: ["todo", "task", "checkbox", "check"],
    group: msg("Basic blocks"),
    glyph: SquareCheck,
    turnInto: true,
    isActive: (editor) => editor.isActive("taskList"),
    run: (chain) => chain.clearNodes().toggleTaskList(),
  },
  {
    id: "bulleted-list",
    title: t("Bulleted list"),
    description: t("A simple list"),
    keywords: ["bullet", "unordered", "ul"],
    group: msg("Basic blocks"),
    glyph: List,
    turnInto: true,
    isActive: (editor) => editor.isActive("bulletList"),
    run: (chain) => chain.clearNodes().toggleBulletList(),
  },
  {
    id: "numbered-list",
    title: t("Numbered list"),
    description: t("A list with numbers"),
    keywords: ["ordered", "ol", "steps"],
    group: msg("Basic blocks"),
    glyph: ListOrdered,
    turnInto: true,
    isActive: (editor) => editor.isActive("orderedList"),
    run: (chain) => chain.clearNodes().toggleOrderedList(),
  },
  {
    id: "page-link",
    title: t("Link to page"),
    description: t("A link to another page of the project"),
    keywords: ["mention", "wiki", "backlink", "reference"],
    group: msg("Basic blocks"),
    glyph: FileText,
    turnInto: false,
    run: (chain) => chain.insertContent("[["),
  },
  {
    id: "image",
    title: t("Image"),
    description: t("A picture from your computer"),
    keywords: ["picture", "photo", "figure", "img", "upload"],
    group: msg("Media"),
    glyph: Image,
    opensField: true,
    turnInto: false,
    run: (chain) => chain.command(() => requestFiles("image")),
  },
  {
    id: "file",
    title: t("File"),
    description: t("A file to open or download, such as a PDF"),
    keywords: ["attachment", "pdf", "upload", "document"],
    group: msg("Media"),
    glyph: Paperclip,
    opensField: true,
    turnInto: false,
    run: (chain) => chain.command(() => requestFiles("file")),
  },
  {
    id: "toggle",
    title: t("Toggle"),
    description: t("A line that hides the text under it"),
    keywords: ["details", "collapse", "fold"],
    group: msg("More blocks"),
    glyph: ChevronRight,
    turnInto: false,
    isActive: (editor) => editor.isActive("details"),
    run: (chain) =>
      chain.clearNodes().setDetails().updateAttributes("details", { open: true }),
  },
  {
    id: "quote",
    title: t("Quote"),
    description: t("A quotation, set apart"),
    keywords: ["blockquote", "citation"],
    group: msg("More blocks"),
    glyph: Quote,
    turnInto: true,
    isActive: (editor) => editor.isActive("blockquote"),
    run: (chain) => chain.clearNodes().setBlockquote(),
  },
  {
    id: "callout",
    title: t("Callout"),
    description: t("A note that stands out"),
    keywords: ["note", "info", "tip", "warning", "alert"],
    group: msg("More blocks"),
    glyph: Info,
    turnInto: true,
    isActive: (editor) => editor.isActive("callout"),
    run: (chain) => chain.clearNodes().setCallout("note"),
  },
  {
    id: "table",
    title: t("Table"),
    description: t("Rows and columns"),
    keywords: ["grid", "columns", "rows"],
    group: msg("More blocks"),
    glyph: Table,
    turnInto: false,
    run: (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
  },
  {
    id: "table-caption",
    title: t("Table caption"),
    description: t("A numbered caption for the table next to it"),
    keywords: ["caption", "number", "label", "tbl"],
    group: msg("More blocks"),
    glyph: Captions,
    turnInto: false,
    isActive: (editor) => editor.isActive("tableCaption"),
    run: (chain) => chain.command(addTableCaption),
  },
  {
    id: "code",
    title: t("Code"),
    description: t("A block with syntax colors"),
    keywords: ["codeblock", "snippet", "pre"],
    group: msg("More blocks"),
    glyph: Code,
    turnInto: true,
    isActive: (editor) => editor.isActive("codeBlock"),
    run: (chain) => chain.clearNodes().setCodeBlock(),
  },
  {
    id: "equation",
    title: t("Equation"),
    description: t("Display math, written in TeX"),
    keywords: ["math", "latex", "tex", "formula"],
    group: msg("More blocks"),
    glyph: "∑",
    opensField: true,
    turnInto: false,
    run: (chain) => chain.insertContent({ type: "blockMath", attrs: { latex: "" } }),
  },
  {
    id: "divider",
    title: t("Divider"),
    description: t("A line between sections"),
    keywords: ["rule", "hr", "line", "separator"],
    group: msg("More blocks"),
    glyph: Minus,
    turnInto: false,
    run: (chain) => chain.setHorizontalRule(),
  },
  {
    id: "footnote",
    title: t("Footnote"),
    description: t("A note under the page"),
    keywords: ["note", "endnote", "remark"],
    group: msg("References"),
    glyph: Superscript,
    opensField: true,
    turnInto: false,
    run: (chain) => chain.insertFootnote(),
  },
  {
    id: "citation",
    title: t("Citation"),
    description: t("Cite a work from Zotero"),
    keywords: ["cite", "reference", "zotero", "source"],
    group: msg("References"),
    glyph: AtSign,
    turnInto: false,
    run: (chain) => chain.insertContent("@"),
  },
  {
    id: "bibliography",
    title: t("Bibliography"),
    description: t("The works this page cites"),
    keywords: ["references", "works cited", "sources", "zotero"],
    group: msg("References"),
    glyph: BookMarked,
    turnInto: false,
    run: (chain) =>
      chain.insertContent({ type: "bibliography", attrs: { source: "" } }),
  },
  ...TUTORIAL.map(({ id, title, description, keywords, glyph }): BlockItem => ({
    id,
    title,
    description,
    keywords: [...keywords, "tutorial"],
    group: msg("Tutorial blocks"),
    glyph,
    opensField: true,
    turnInto: false,
    run: (chain) => chain.insertContent({ type: id, attrs: { source: newSource(id) } }),
  })),
];

/**
 * The blocks that match what was typed after the slash: titles that
 * start with it first, then later words of a title, then keywords.
 */
export function filterBlocks(query: string, blocks: BlockItem[] = BLOCKS): BlockItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return blocks;
  const rank = (block: BlockItem): number => {
    const title = block.title.toLowerCase();
    if (title.startsWith(q)) return 0;
    if (title.split(/[\s-]/).some((word) => word.startsWith(q))) return 1;
    if (block.keywords.some((keyword) => keyword.startsWith(q))) return 2;
    return -1;
  };
  return blocks
    .map((block, index) => ({ block, index, rank: rank(block) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.block);
}

/** The block the caret is in, for the label on the "Turn into" button. */
export function currentBlock(editor: Editor): BlockItem {
  const inner = ["heading-1", "heading-2", "heading-3", "code"];
  const outer = [
    "to-do",
    "bulleted-list",
    "numbered-list",
    "toggle",
    "callout",
    "quote",
  ];
  for (const id of [...inner, ...outer]) {
    const block = BLOCKS.find((item) => item.id === id);
    if (block?.isActive?.(editor)) return block;
  }
  return BLOCKS[0];
}
