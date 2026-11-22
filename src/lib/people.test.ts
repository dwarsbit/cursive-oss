import { describe, expect, it } from "vitest";
import { colorFor, initials } from "./people";

describe("people", () => {
  it("gives initials without titles", () => {
    expect(initials("Anna Berg")).toBe("AB");
    expect(initials("Prof. Anna van den Berg")).toBe("AB");
    expect(initials("anna")).toBe("A");
    expect(initials("  ")).toBe("?");
  });

  it("gives the same person the same color", () => {
    expect(colorFor("user-1")).toBe(colorFor("user-1"));
    expect(colorFor("user-1")).toMatch(/^#[0-9A-F]{6}$/);
  });
});
