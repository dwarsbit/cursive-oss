import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Annotation, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  remoteCursors,
  setRemoteCursors,
  type RemoteCursor,
} from "@scholarkit/collab/codemirror";
import { useEffect, useRef } from "react";
import { offerFindTarget } from "../lib/find";
import { codeMirrorFindTarget, findField } from "../lib/find-codemirror";
import { t } from "@scholarkit/i18n";

// The words stay in the text color and the syntax around them is
// muted, so the source reads like the page.
const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.monospace, color: "var(--destructive)" },
  { tag: tags.link, textDecoration: "underline" },
  {
    tag: [
      tags.processingInstruction,
      tags.meta,
      tags.url,
      tags.contentSeparator,
      tags.labelName,
    ],
    color: "var(--muted-foreground)",
  },
  {
    tag: [tags.quote],
    color: "color-mix(in srgb, var(--foreground) 80%, var(--muted-foreground))",
  },
  {
    tag: [tags.keyword, tags.atom, tags.bool, tags.propertyName],
    color: "var(--syn-kw)",
  },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--syn-str)" },
  { tag: [tags.number], color: "var(--syn-num)" },
  { tag: [tags.comment], color: "var(--muted-foreground)", fontStyle: "italic" },
]);

const theme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontSize: "13.5px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.75",
    overflow: "visible",
  },
  ".cm-content": { padding: "0", caretColor: "var(--foreground)" },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
    { backgroundColor: "var(--selection)" },
});

/** Marks a change that came from elsewhere: it is not reported back. */
const fromElsewhere = Annotation.define<boolean>();

/** The one change that turns `from` into `to`: the text between their common start and end. */
export function textDiff(
  from: string,
  to: string,
): { from: number; to: number; insert: string } | null {
  if (from === to) return null;
  let start = 0;
  const shorter = Math.min(from.length, to.length);
  while (start < shorter && from[start] === to[start]) start++;
  let end = 0;
  while (
    end < shorter - start &&
    from[from.length - 1 - end] === to[to.length - 1 - end]
  )
    end++;
  return {
    from: start,
    to: from.length - end,
    insert: to.slice(start, to.length - end),
  };
}

/** The Markdown face of a page: the file as text. */
export function MarkdownEditor({
  source,
  onChange,
  remote,
  others,
  onSelection,
}: {
  /**
   * The file when the editor opens; later edits live in the editor. When
   * `remote` goes up, the file changed elsewhere and `source` comes in.
   */
  source: string;
  onChange: (source: string) => void;
  /** Counts the changes to the file from elsewhere; each one brings `source` in. */
  remote?: number;
  /** Other people's carets and selections in this file, as offsets into it. */
  others?: RemoteCursor[];
  /** Where your caret and selection are, as offsets into the file, as they move. */
  onSelection?: (selection: { anchor: number; head: number }) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const initial = useRef(source);
  const sourceRef = useRef(source);
  const onChangeRef = useRef(onChange);
  const onSelectionRef = useRef(onSelection);
  useEffect(() => {
    onChangeRef.current = onChange;
    onSelectionRef.current = onSelection;
    sourceRef.current = source;
  });

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial.current,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          // The front matter is read as YAML, the rest as Markdown.
          yamlFrontmatter({ content: markdown({ base: markdownLanguage }) }),
          syntaxHighlighting(highlight),
          theme,
          findField,
          remoteCursors,
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.contentAttributes.of({
            "aria-label": t("Page as Markdown"),
            spellcheck: "true",
          }),
          EditorView.updateListener.of((update) => {
            const elsewhere = update.transactions.some((tr) =>
              tr.annotation(fromElsewhere),
            );
            if (update.docChanged && !elsewhere)
              onChangeRef.current(update.state.doc.toString());
            if (update.selectionSet || update.docChanged) {
              const { anchor, head } = update.state.selection.main;
              onSelectionRef.current?.({ anchor, head });
            }
          }),
        ],
      }),
    });
    editor.focus();
    view.current = editor;
    const withdraw = offerFindTarget(codeMirrorFindTarget(editor));
    return () => {
      withdraw();
      view.current = null;
      editor.destroy();
    };
  }, []);

  // The file changed elsewhere: bring in the part that differs, so the caret stays put.
  useEffect(() => {
    const editor = view.current;
    if (!remote || !editor) return;
    const change = textDiff(editor.state.doc.toString(), sourceRef.current);
    if (change) {
      editor.dispatch({
        changes: change,
        annotations: [fromElsewhere.of(true)],
      });
    }
  }, [remote]);

  // Others' carets, as they last said where they are; between their updates they move with the text.
  useEffect(() => {
    const editor = view.current;
    if (!editor || others === undefined) return;
    editor.dispatch({ effects: setRemoteCursors.of(others) });
  }, [others]);

  return <div ref={host} className="source" />;
}
