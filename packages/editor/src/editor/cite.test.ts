// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { Cite, citeKey, citeQueryAt, createCiteController, matchesWords } from "./cite";
import { documentExtensions } from "./extensions";

describe("citeQueryAt", () => {
  const query = (text: string) => citeQueryAt(text)?.query ?? null;

  it("reads one word after @, as before", () => {
    expect(query("Sleep helps @stickgold")).toBe("stickgold");
    expect(query("@rasch2013")).toBe("rasch2013");
    expect(query("see (@10.1038/nature04286")).toBe("10.1038/nature04286");
    expect(query("Sleep helps @")).toBe("");
  });

  it("reads several words after @", () => {
    expect(query("Sleep helps @stickgold sleep 2005")).toBe("stickgold sleep 2005");
    expect(query("Sleep helps @stickgold ")).toBe("stickgold ");
    expect(citeQueryAt("Sleep helps @stickgold sleep")?.index).toBe(12);
  });

  it("needs a space or a bracket before @", () => {
    expect(query("mail leon@example.org")).toBeNull();
    expect(query("[@rasch")).toBe("rasch");
  });

  it("ends at punctuation after the first word", () => {
    expect(query("@stickgold showed that,")).toBeNull();
    expect(query("@stickgold showed. Then")).toBeNull();
    expect(query("@rasch, born")).toBeNull();
    expect(query("@rasch) and")).toBeNull();
    expect(query("@rasch,")).toBe("rasch,");
  });

  it("ends at two spaces, a space first, a tab or a seventh word", () => {
    expect(query("@stickgold  sleep")).toBeNull();
    expect(query("@ stickgold")).toBeNull();
    expect(query("@stickgold\tsleep")).toBeNull();
    expect(query("@a b c d e f")).toBe("a b c d e f");
    expect(query("@a b c d e f ")).toBe("a b c d e f ");
    expect(query("@a b c d e f g")).toBeNull();
  });

  it("keeps hyphens and apostrophes in later words", () => {
    expect(query("@o'neill sleep-dependent")).toBe("o'neill sleep-dependent");
  });

  it("takes the last @", () => {
    expect(query("@first, then @second word")).toBe("second word");
  });
});

describe("matchesWords", () => {
  const words = ["Stickgold", "2005", "Sleep-dependent", "memory", "consolidation"];

  it("needs every word to start one of the words", () => {
    expect(matchesWords(words, "stick")).toBe(true);
    expect(matchesWords(words, "stickgold 2005")).toBe(true);
    expect(matchesWords(words, "MEM stick ")).toBe(true);
    expect(matchesWords(words, "stickgold walker")).toBe(false);
  });

  it("matches anything when nothing was typed", () => {
    expect(matchesWords(words, "  ")).toBe(true);
  });
});

describe("the @ menu in the editor", () => {
  const editors: Editor[] = [];
  afterEach(() => {
    for (const editor of editors.splice(0)) editor.destroy();
  });

  function typing(text: string) {
    const controller = createCiteController();
    const editor = new Editor({
      extensions: [...documentExtensions(), Cite.configure(controller.options)],
      content: "<p></p>",
    });
    editors.push(editor);
    editor.commands.insertContent(text);
    return citeKey.getState(editor.state) as {
      active: boolean;
      query: string | null;
    };
  }

  it("stays open across spaces", () => {
    const state = typing("Sleep helps @stickgold sleep");
    expect(state.active).toBe(true);
    expect(state.query).toBe("stickgold sleep");
  });

  it("closes at a comma", () => {
    expect(typing("Sleep helps @stickgold showed that,").active).toBe(false);
  });
});
