import { describe, expect, it } from "vitest";
import { safeHref } from "./safe-href";

describe("safeHref", () => {
  it("keeps web, mail, phone, Zotero and scheme-less links", () => {
    for (const href of [
      "https://example.org/a?b=c",
      "HTTP://example.org",
      "mailto:ada@example.org",
      "tel:+31201234567",
      "zotero://select/library/items/ABCD1234",
      "notes/methods.md",
      "../Figures/plot.png",
      "#results",
      "/projects/1",
    ]) {
      expect(safeHref(href)).toBe(href);
    }
  });

  it("drops every other scheme, however it is spelled", () => {
    for (const href of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "\u0001javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      "file:///etc/passwd",
      "ms-msdt:/id",
    ]) {
      expect(safeHref(href)).toBe("");
    }
  });

  it("reads nothing as nothing", () => {
    expect(safeHref(undefined)).toBe("");
    expect(safeHref(null)).toBe("");
    expect(safeHref("  ")).toBe("");
  });
});
