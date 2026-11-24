// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";
import { textDiff } from "../components/MarkdownEditor";
import { documentExtensions } from "./extensions";
import {
  mergeMarkdown,
  noteWritten,
  REMOTE_CHANGE,
  RemoteCarets,
  setRemoteCarets,
} from "./collab";

// Every editor made here, destroyed after each test: a live editor's view keeps a timer that
// can fire after happy-dom is torn down, and fails the run with "document is not defined".
const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function track(editor: Editor) {
  editors.push(editor);
  return editor;
}

function editorFor(markdown: string) {
  return track(
    new Editor({
      extensions: [...documentExtensions(), RemoteCarets],
      content: markdown,
      contentType: "markdown",
    }),
  );
}

/** Puts the caret right after the first `text` in the page. */
function caretAfter(editor: Editor, text: string) {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at >= 0 || !node.isText) return;
    const index = node.text!.indexOf(text);
    if (index >= 0) at = pos + index + text.length;
  });
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)),
  );
}

/** The text of the page around the caret, with the caret as "|". */
function withCaret(editor: Editor) {
  const { from } = editor.state.selection;
  const { doc } = editor.state;
  return (
    doc.textBetween(0, from, "\n") + "|" + doc.textBetween(from, doc.content.size, "\n")
  );
}

describe("mergeMarkdown", () => {
  it("brings in a change elsewhere in the page and keeps the caret where it was", () => {
    const editor = editorFor("# Plan\n\nWe run the pilot.\n\nThen the survey.");
    caretAfter(editor, "pilot");
    let reported = 0;
    editor.on("update", ({ transaction }) => {
      if (!transaction.getMeta(REMOTE_CHANGE)) reported++;
    });

    expect(
      mergeMarkdown(
        editor,
        "# Pilot plan\n\nWe run the pilot.\n\nThen the main survey.",
      ),
    ).toBe(true);
    expect(withCaret(editor)).toBe(
      "Pilot plan\nWe run the pilot|.\nThen the main survey.",
    );
    expect(reported).toBe(0);
    // Undo takes back your own edits, not someone else's.
    expect(editor.can().undo()).toBe(false);
  });

  it("keeps the caret in the same paragraph when someone types before it", () => {
    const editor = editorFor("We run the pilot with students.");
    caretAfter(editor, "students");
    mergeMarkdown(editor, "We run the small pilot with students.");
    expect(withCaret(editor)).toBe("We run the small pilot with students|.");
  });

  it("keeps a space you just typed at the end of a line, which the Markdown leaves out", () => {
    const editor = editorFor("We run the pilot.\n\nThe goal is to check timing.");
    noteWritten(editor, "We run the pilot.\n\nThe goal is to check timing.");
    caretAfter(editor, "pilot.");
    editor.view.dispatch(editor.state.tr.insertText(" "));
    // You wrote "We run the pilot." (no trailing space); someone else adds to the next line.
    noteWritten(editor, "We run the pilot.\n\nThe goal is to check timing.");
    mergeMarkdown(
      editor,
      "We run the pilot.\n\nThe goal is to check timing and wording.",
    );
    expect(withCaret(editor)).toBe(
      "We run the pilot. |\nThe goal is to check timing and wording.",
    );
  });

  it("changes nothing when the Markdown says what the page already shows", () => {
    const editor = editorFor("One\n\nTwo");
    expect(mergeMarkdown(editor, "One\n\nTwo")).toBe(false);
  });
});

describe("RemoteCarets", () => {
  it("shows someone's caret and selection, and moves them along with changes", () => {
    const editor = editorFor("Alpha beta gamma");
    setRemoteCarets(editor, [
      { id: "1", name: "Sara Okafor", color: "#0F5B62", anchor: 7, head: 11 },
    ]);
    const dom = editor.view.dom;
    expect(dom.querySelector(".remote-caret-name")?.textContent).toBe("Sara Okafor");
    expect(dom.querySelector(".remote-selection")?.textContent).toBe("beta");

    // Text typed before it pushes it along.
    editor.view.dispatch(editor.state.tr.insertText("New ", 1));
    expect(dom.querySelector(".remote-selection")?.textContent).toBe("beta");

    setRemoteCarets(editor, []);
    expect(dom.querySelector(".remote-caret")).toBeNull();
  });
});

describe("textDiff", () => {
  it("finds the one change between two texts", () => {
    expect(textDiff("abc", "abc")).toBeNull();
    expect(textDiff("one two", "one big two")).toEqual({
      from: 4,
      to: 4,
      insert: "big ",
    });
    expect(textDiff("aaa", "aa")).toEqual({ from: 2, to: 3, insert: "" });
    expect(textDiff("", "x")).toEqual({ from: 0, to: 0, insert: "x" });
  });
});
