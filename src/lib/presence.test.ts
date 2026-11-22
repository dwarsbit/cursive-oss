import { describe, expect, it } from "vitest";
import type { Presence } from "@scholarkit/editor/lib/sync";
import { readPeers } from "./presence";

describe("readPeers", () => {
  it("reads the page and caret of each window, and skips windows without a user", () => {
    const presence: Presence = {
      set: () => {},
      onChange: () => () => {},
      others: () => [
        {
          clientId: 1,
          user: { id: "u1", name: "Sara Okafor" },
          state: { page: "Thesis/Plan.md", anchor: 4, head: 9 },
        },
        { clientId: 2, user: { id: "u2", name: "Anna Berg" }, state: { anchor: -1 } },
        { clientId: 3, user: null, state: { page: "Plan.md" } },
      ],
    };
    expect(readPeers(presence)).toEqual([
      {
        clientId: 1,
        user: { id: "u1", name: "Sara Okafor" },
        page: "Thesis/Plan.md",
        anchor: 4,
        head: 9,
      },
      {
        clientId: 2,
        user: { id: "u2", name: "Anna Berg" },
        page: null,
        anchor: null,
        head: null,
      },
    ]);
  });
});
