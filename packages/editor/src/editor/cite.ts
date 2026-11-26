import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion, type SuggestionOptions } from "@tiptap/suggestion";

/** What the citation menu needs while it is open. */
export interface CiteState {
  editor: Editor;
  query: string;
  range: Range;
  rect: () => DOMRect | null;
}

type KeyHandler = (event: KeyboardEvent) => boolean;

export interface CiteController {
  options: { onChange: (state: CiteState | null) => void; onKeyDown: KeyHandler };
  subscribe: (listener: () => void) => () => void;
  getState: () => CiteState | null;
  handleKeys: (handler: KeyHandler) => () => void;
  close: () => void;
}

export function createCiteController(): CiteController {
  let state: CiteState | null = null;
  let keys: KeyHandler | null = null;
  const listeners = new Set<() => void>();
  const set = (next: CiteState | null) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    options: { onChange: set, onKeyDown: (event) => keys?.(event) ?? false },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    handleKeys: (handler) => {
      keys = handler;
      return () => {
        if (keys === handler) keys = null;
      };
    },
    close: () => set(null),
  };
}

export const citeKey = new PluginKey("cite");

/** At most this many words are searched for after `@`. */
export const CITE_MAX_WORDS = 6;

/** What may come right before `@`: the start of the text, a space, a bracket. */
const BEFORE_AT = new Set(["", " ", "\u00a0", "(", "["]);

/** A word ending in one of these ends the search: the sentence goes on. */
const ENDS_SEARCH = /[.,;:!?)\]}"”]$/;

/** After the first word, these end the search too. */
const BREAKS_SEARCH = /[.,;:!?()[\]{}"“”]/;

/**
 * Where the `@` being typed starts in `text` (what comes before the caret),
 * and what was typed after it: one word, as before, or several words
 * separated by single spaces. The first word may hold anything but a space
 * (a key, a DOI, an arXiv ID). Punctuation after it, a new line, two
 * spaces or a seventh word end the search: the sentence goes on.
 */
export function citeQueryAt(text: string): { index: number; query: string } | null {
  const index = text.lastIndexOf("@");
  if (index < 0) return null;
  if (!BEFORE_AT.has(text.slice(Math.max(0, index - 1), index))) return null;
  const query = text.slice(index + 1);
  if (!/\s/.test(query)) return { index, query };
  const plain = query.replace(/\u00a0/g, " ");
  if (/^\s|\s\s|[^\S ]/.test(plain)) return null;
  const words = plain.split(" ");
  if (words.filter(Boolean).length > CITE_MAX_WORDS) return null;
  const [first, ...rest] = words;
  if (ENDS_SEARCH.test(first) || BREAKS_SEARCH.test(rest.join(" "))) return null;
  return { index, query };
}

/** Whether every word of `query` starts one of the `words`. */
export function matchesWords(words: string[], query: string): boolean {
  const wanted = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!wanted.length) return true;
  const have = words.map((word) => word.toLowerCase());
  return wanted.every((part) => have.some((word) => word.startsWith(part)));
}

const findCiteMatch: NonNullable<SuggestionOptions["findSuggestionMatch"]> = ({
  $position,
}) => {
  const before = $position.nodeBefore;
  if (!before?.isText || !before.text) return null;
  const found = citeQueryAt(before.text);
  if (!found) return null;
  const from = $position.pos - before.text.length + found.index;
  return {
    range: { from, to: $position.pos },
    query: found.query,
    text: `@${found.query}`,
  };
};

/**
 * Citing as you type: `@` at the start of a word opens a menu of works
 * from the page and from Zotero, and what you type next searches them,
 * up to six words (see `citeQueryAt`).
 */
export const Cite = Extension.create<CiteController["options"]>({
  name: "cite",

  addOptions() {
    return { onChange: () => {}, onKeyDown: () => false };
  },

  addProseMirrorPlugins() {
    const { onChange, onKeyDown } = this.options;
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: citeKey,
        char: "@",
        // Spaces are allowed; `citeQueryAt` decides where the search ends.
        allowSpaces: true,
        allowedPrefixes: [" ", "(", "["],
        findSuggestionMatch: findCiteMatch,
        shouldShow: ({ editor }) =>
          !editor.isActive("codeBlock") && !editor.isActive("code"),
        items: () => [],
        command: () => {},
        render: () => {
          const show = (props: {
            editor: Editor;
            query: string;
            range: Range;
            clientRect?: (() => DOMRect | null) | null;
          }) =>
            onChange({
              editor: props.editor,
              query: props.query,
              range: props.range,
              rect: () => props.clientRect?.() ?? null,
            });
          return {
            onStart: show,
            onUpdate: show,
            onKeyDown: ({ event }) => {
              if (event.key === "Escape") {
                onChange(null);
                return true;
              }
              return onKeyDown(event);
            },
            onExit: () => onChange(null),
          };
        },
      }),
    ];
  },
});
