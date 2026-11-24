import { describe, expect, it } from "vitest";
import { webAddresses } from "./web-address";

const at = webAddresses("/cursive/");

describe("webAddresses", () => {
  it("puts the list and each project under /cursive/projects", () => {
    expect(at.list).toBe("/cursive/projects");
    expect(at.of("AbC_123-x")).toBe("/cursive/projects/AbC_123-x");
  });

  it("reads the project from an address", () => {
    expect(at.idIn("/cursive/projects/AbC_123-x")).toBe("AbC_123-x");
    expect(at.idIn("/cursive/projects/AbC_123-x/")).toBe("AbC_123-x");
    expect(at.idIn("/cursive/projects/a%20b")).toBe("a b");
  });

  it("finds none on the list or outside the app", () => {
    expect(at.idIn("/cursive/projects")).toBeNull();
    expect(at.idIn("/cursive/projects/")).toBeNull();
    expect(at.idIn("/cursive/")).toBeNull();
    // The address from before the move: the server redirects it, the app doesn't open it.
    expect(at.idIn("/cursive/AbC_123-x")).toBeNull();
    expect(at.idIn("/cursive/projects/%E0%A4%A")).toBeNull();
  });

  it("leaves a right address alone", () => {
    expect(at.better("/cursive/projects")).toBeNull();
    expect(at.better("/cursive/projects/AbC_123-x")).toBeNull();
  });

  it("sends an address from before the move to the new one", () => {
    expect(at.better("/cursive/AbC_123-x")).toBe("/cursive/projects/AbC_123-x");
    expect(at.better("/cursive/AbC_123-x/")).toBe("/cursive/projects/AbC_123-x");
  });

  it("sends everything else to the list", () => {
    expect(at.better("/cursive/")).toBe("/cursive/projects");
    expect(at.better("/cursive")).toBe("/cursive/projects");
    expect(at.better("/cursive/projects/")).toBe("/cursive/projects");
    expect(at.better("/cursive/some/where")).toBe("/cursive/projects");
    expect(at.better("/cursive/favicon.svg")).toBe("/cursive/projects");
  });
});
