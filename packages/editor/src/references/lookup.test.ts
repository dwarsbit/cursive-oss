import { describe, expect, it } from "vitest";
import { mayHold } from "./context";
import { lookUp, lookupOf, setWorkLookup } from "./lookup";
import { librariesOf } from "./zotero";

describe("Looking works up", () => {
  it("tells a DOI and an ISBN from other words", () => {
    expect(lookupOf("10.1038/nature14539")).toEqual({
      kind: "doi",
      id: "10.1038/nature14539",
    });
    expect(lookupOf("https://doi.org/10.1000/jr.2020.3.")).toEqual({
      kind: "doi",
      id: "10.1000/jr.2020.3",
    });
    expect(lookupOf("978-0-201-13447-6")).toEqual({
      kind: "isbn",
      id: "9780201134476",
    });
    expect(lookupOf("0-201-13447-0")).toEqual({ kind: "isbn", id: "0201134470" });
    expect(lookupOf("978-0-201-13447-7")).toBeNull();
    expect(lookupOf("vaswani")).toBeNull();
  });

  it("tells an arXiv ID, bare, after arXiv: or as a link", () => {
    for (const typed of [
      "1706.03762",
      "arXiv:1706.03762",
      "arxiv: 1706.03762v7",
      "https://arxiv.org/abs/1706.03762",
      "arxiv.org/pdf/1706.03762v2.pdf",
      "https://arxiv.org/abs/1706.03762v5/",
    ])
      expect(lookupOf(typed), typed).toEqual({ kind: "arxiv", id: "1706.03762" });
    expect(lookupOf("2401.12345")).toEqual({ kind: "arxiv", id: "2401.12345" });
    expect(lookupOf("hep-th/9901001")).toEqual({ kind: "arxiv", id: "hep-th/9901001" });
    expect(lookupOf("arXiv:math.gt/0309136v1")).toEqual({
      kind: "arxiv",
      id: "math.GT/0309136",
    });
    // A thirteenth month is no arXiv ID; a decimal number stays a thought.
    expect(lookupOf("1713.03762")).toBeNull();
    expect(lookupOf("3.14159")).toBeNull();
  });

  it("tells a PubMed ID only after PMID or in a link", () => {
    expect(lookupOf("PMID: 31452104")).toEqual({ kind: "pubmed", id: "31452104" });
    expect(lookupOf("pmid:31452104")).toEqual({ kind: "pubmed", id: "31452104" });
    expect(lookupOf("https://pubmed.ncbi.nlm.nih.gov/31452104/")).toEqual({
      kind: "pubmed",
      id: "31452104",
    });
    expect(lookupOf("www.ncbi.nlm.nih.gov/pubmed/31452104")).toEqual({
      kind: "pubmed",
      id: "31452104",
    });
    expect(lookupOf("PMC6744368")).toEqual({ kind: "pubmed", id: "PMC6744368" });
    expect(lookupOf("https://pmc.ncbi.nlm.nih.gov/articles/PMC6744368/")).toEqual({
      kind: "pubmed",
      id: "PMC6744368",
    });
    // A bare number may be anything: a year, a page, a thought.
    expect(lookupOf("31452104")).toBeNull();
    expect(lookupOf("2019")).toBeNull();
  });

  it("asks the server, never the source, and keys what it finds", async () => {
    const asked: string[] = [];
    setWorkLookup(async (kind, id) => {
      asked.push(`${kind}:${id}`);
      return id === "1706.03762"
        ? {
            type: "article",
            author: ["Vaswani, Ashish", "Shazeer, Noam"],
            editor: [],
            title: "Attention is all you need",
            year: "2017",
            container: "arXiv",
            publisher: "",
            place: "",
            volume: "",
            issue: "",
            pages: "",
            doi: "10.48550/arXiv.1706.03762",
            url: "https://arxiv.org/abs/1706.03762",
            isbn: "",
            arxiv: "1706.03762",
            pmid: "",
          }
        : null;
    });
    const found = await lookUp({ kind: "arxiv", id: "1706.03762" }, ["vaswani2017"]);
    expect(found).toMatchObject({
      key: "vaswani2017a",
      type: "article",
      container: "arXiv",
      doi: "10.48550/arXiv.1706.03762",
      arxiv: "1706.03762",
    });
    expect(await lookUp({ kind: "pubmed", id: "1" }, [])).toBeNull();
    expect(asked).toEqual(["arxiv:1706.03762", "pubmed:1"]);
    setWorkLookup(null);
    await expect(lookUp({ kind: "doi", id: "10.1/x" }, [])).rejects.toThrow(/Sign in/);
  });
});

describe("Zotero group libraries", () => {
  it("searches the groups that are on", () => {
    const libraries = librariesOf({
      id: "s",
      kind: "cloud",
      enabled: true,
      label: "",
      userId: "12",
      apiKey: "k",
      groups: [
        { id: "7", name: "Lab", enabled: true },
        { id: "8", name: "Course", enabled: false },
      ],
    });
    expect(
      libraries.map((library) => [library.path, library.id, library.group]),
    ).toEqual([
      ["users/12", "users/12", ""],
      ["groups/7", "groups/7", "Lab"],
    ]);
  });

  it("looks for a copied item in its own library", () => {
    expect(mayHold("local", "users/12")).toBe(true);
    expect(mayHold("users/12", "local")).toBe(true);
    expect(mayHold("groups/7", "groups/7")).toBe(true);
    expect(mayHold("local", "groups/7")).toBe(false);
    expect(mayHold("users/12", "groups/7")).toBe(false);
  });
});
