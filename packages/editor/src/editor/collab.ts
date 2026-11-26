import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { StepMap } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { inlineNumberedNotes } from "./footnote";

/**
 * Working on a page together. A page is Markdown underneath, so what
 * someone else changed arrives as the page's new Markdown: `mergeMarkdown`
 * brings it in as one change over the part that differs, so your caret
 * and selection stay put. Other people's carets and selections show in
 * their color with their name (`RemoteCarets`).
 */

/** Marks a transaction that brought in a change from elsewhere. */
export const REMOTE_CHANGE = "remoteChange";

/** A part of the page that changed: `from`'s [start, endFrom) became `to`'s [start, endTo). */
interface Change {
  start: number;
  endFrom: number;
  endTo: number;
  /** Where the part starts in `to`. */
  startTo: number;
}

/** Narrows a changed part to where its two versions start and stop differing. */
function narrow(
  from: ProseNode,
  to: ProseNode,
  [a0, a1]: [number, number],
  [b0, b1]: [number, number],
): Change | null {
  const old = from.content.cut(a0, a1);
  const now = to.content.cut(b0, b1);
  const start = old.findDiffStart(now);
  if (start === null) return null;
  const end = old.findDiffEnd(now);
  let endFrom = end?.a ?? old.size;
  let endTo = end?.b ?? now.size;
  // Repeated content can make the end overlap the start; move both ends past it.
  const overlap = start - Math.min(endFrom, endTo);
  if (overlap > 0) {
    endFrom += overlap;
    endTo += overlap;
  }
  return {
    start: a0 + start,
    endFrom: a0 + endFrom,
    startTo: b0 + start,
    endTo: b0 + endTo,
  };
}

/** Where each top-level block starts, and the end of the last one. */
function offsets(doc: ProseNode): number[] {
  const found = [0];
  doc.forEach((node) => found.push(found[found.length - 1]! + node.nodeSize));
  return found;
}

/**
 * The parts that changed between `from` and `to`, first to last. Blocks
 * both have stay matched, so two changes far apart are two parts and
 * whatever lies between them is left alone.
 */
export function docChanges(from: ProseNode, to: ProseNode): Change[] {
  const a: ProseNode[] = [];
  const b: ProseNode[] = [];
  from.forEach((node) => a.push(node));
  to.forEach((node) => b.push(node));
  // The longest run of blocks both have, in order.
  const common: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i]![j] = a[i]!.eq(b[j]!)
        ? common[i + 1]![j + 1]! + 1
        : Math.max(common[i + 1]![j]!, common[i]![j + 1]!);
    }
  }
  const at = offsets(from);
  const bt = offsets(to);
  const changes: Change[] = [];
  let i = 0;
  let j = 0;
  let gapA = 0;
  let gapB = 0;
  const flush = () => {
    if (gapA === i && gapB === j) return;
    const change = narrow(from, to, [at[gapA]!, at[i]!], [bt[gapB]!, bt[j]!]);
    if (change) changes.push(change);
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i]!.eq(b[j]!)) {
      flush();
      i++;
      j++;
      gapA = i;
      gapB = j;
    } else if (
      j >= b.length ||
      (i < a.length && common[i + 1]![j]! >= common[i]![j + 1]!)
    ) {
      i++;
    } else {
      j++;
    }
  }
  flush();
  return changes;
}

/** The Markdown each editor last wrote or brought in: what the others know of its page. */
const known = new WeakMap<Editor, string>();

/** Notes the Markdown the editor wrote, after an edit here or when it opened. */
export function noteWritten(editor: Editor, markdown: string): void {
  known.set(editor, markdown);
}

/** The page as this Markdown reads, or null when it doesn't fit the editor. */
function parse(editor: Editor, markdown: string): ProseNode | null {
  const json = editor.markdown?.parse(inlineNumberedNotes(markdown));
  if (!json) return null;
  try {
    return editor.schema.nodeFromJSON(json);
  } catch {
    return null;
  }
}

/**
 * Brings the page's Markdown, changed elsewhere, into the editor. Only
 * the parts the others changed are replaced, so a caret outside them
 * stays where it was, and what the page shows but its Markdown leaves
 * out (a space you just typed at the end of a line) stays too. The
 * change can't be undone here, and isn't reported as an edit. Returns
 * whether anything changed.
 */
export function mergeMarkdown(editor: Editor, markdown: string): boolean {
  if (editor.isDestroyed) return false;
  const next = parse(editor, markdown);
  if (!next) return false;
  const { state } = editor;
  const written = known.get(editor);
  const base = written === undefined ? null : parse(editor, written);
  known.set(editor, markdown);
  // What the others changed, from the page as they knew it; and how that page became
  // the one shown here, to find the same places in it.
  const changes = docChanges(base ?? state.doc, next);
  if (changes.length === 0) return false;
  const here = base
    ? new StepMap(
        docChanges(base, state.doc).flatMap((c) => [
          c.start,
          c.endFrom - c.start,
          c.endTo - c.startTo,
        ]),
      )
    : StepMap.empty;
  const tr = state.tr;
  // Last first, so the positions of the ones before stay right.
  for (const change of [...changes].reverse()) {
    const from = here.map(change.start, -1);
    const to = Math.max(from, here.map(change.endFrom, 1));
    tr.replace(from, to, next.slice(change.startTo, change.endTo));
  }
  if (!tr.docChanged) return false;
  tr.setMeta(REMOTE_CHANGE, true).setMeta("addToHistory", false);
  editor.view.dispatch(tr);
  return true;
}

/** Someone else's caret (`head`) and selection (from `anchor`) in the page. */
export interface RemoteCaret {
  id: string;
  name: string;
  color: string;
  anchor: number;
  head: number;
}

interface CaretState {
  carets: RemoteCaret[];
  decorations: DecorationSet;
}

const caretKey = new PluginKey<CaretState>("remoteCarets");

const clamp = (pos: number, doc: ProseNode) =>
  Math.max(0, Math.min(pos, doc.content.size));

function caretWidget(caret: RemoteCaret): HTMLElement {
  const mark = document.createElement("span");
  mark.className = "remote-caret";
  mark.style.setProperty("--caret", caret.color);
  mark.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "remote-caret-name";
  label.textContent = caret.name;
  mark.appendChild(label);
  return mark;
}

function decorate(doc: ProseNode, carets: RemoteCaret[]): DecorationSet {
  const found: Decoration[] = [];
  for (const caret of carets) {
    const head = clamp(caret.head, doc);
    const anchor = clamp(caret.anchor, doc);
    if (anchor !== head) {
      found.push(
        Decoration.inline(
          Math.min(anchor, head),
          Math.max(anchor, head),
          { class: "remote-selection", style: `--caret: ${caret.color}` },
          { inclusiveStart: false, inclusiveEnd: false },
        ),
      );
    }
    found.push(
      Decoration.widget(head, () => caretWidget(caret), {
        // Changes when they move, so their name shows again.
        key: `caret-${caret.id}-${caret.color}-${caret.name}-${head}-${anchor}`,
        side: 1,
        ignoreSelection: true,
      }),
    );
  }
  return DecorationSet.create(doc, found);
}

/** Shows other people's carets; they move along with your changes until their next one arrives. */
export const RemoteCarets = Extension.create({
  name: "remoteCarets",
  addProseMirrorPlugins() {
    return [
      new Plugin<CaretState>({
        key: caretKey,
        state: {
          init: () => ({ carets: [], decorations: DecorationSet.empty }),
          apply(tr, value, _old, next: EditorState) {
            const given = tr.getMeta(caretKey) as RemoteCaret[] | undefined;
            if (!given && !tr.docChanged) return value;
            // A change from elsewhere doesn't move them: where someone's caret is after
            // it, they say themselves, and that can arrive before the change does.
            if (!given && tr.getMeta(REMOTE_CHANGE)) {
              return { ...value, decorations: decorate(next.doc, value.carets) };
            }
            const carets =
              given ??
              value.carets.map((caret) => ({
                ...caret,
                anchor: tr.mapping.map(caret.anchor),
                head: tr.mapping.map(caret.head),
              }));
            return { carets, decorations: decorate(next.doc, carets) };
          },
        },
        props: {
          decorations: (state) => caretKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});

/** Shows these carets of other people, in place of the ones shown before. */
export function setRemoteCarets(editor: Editor, carets: RemoteCaret[]): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(
    editor.state.tr.setMeta(caretKey, carets).setMeta("addToHistory", false),
  );
}
