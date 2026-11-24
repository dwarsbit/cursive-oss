import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("../lib/platform", () => ({ isDesktop: true }));

import {
  checkZoteroKey,
  KEPT_KEY,
  listZoteroGroups,
  type ZoteroSource,
} from "./zotero";

const cloud = (apiKey: string): ZoteroSource => ({
  id: "z1",
  kind: "cloud",
  enabled: true,
  label: "",
  userId: "42",
  apiKey,
});

afterEach(() => {
  vi.unstubAllGlobals();
  invoke.mockReset();
});

describe("Zotero cloud in the desktop app", () => {
  it("asks zotero.org through the app when the key is kept", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    invoke.mockResolvedValue({
      status: 200,
      body: JSON.stringify([{ id: 7, data: { name: "Lab" } }]),
    });
    expect(await listZoteroGroups(cloud(KEPT_KEY))).toEqual([{ id: "7", name: "Lab" }]);
    expect(invoke).toHaveBeenCalledWith("zotero_cloud_fetch", {
      id: "z1",
      path: "users/42/groups",
      query: "format=json&limit=100",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("words a refused kept key like a refused typed one", async () => {
    invoke.mockResolvedValue({ status: 403, body: "Forbidden" });
    await expect(listZoteroGroups(cloud(KEPT_KEY))).rejects.toThrow(
      /turned the key down/,
    );
  });

  it("checks a kept key through the app, and a typed one directly", async () => {
    invoke.mockResolvedValue({ status: 200, body: '{"userID":42,"username":"ada"}' });
    expect(await checkZoteroKey(KEPT_KEY, "z1")).toEqual({
      userId: "42",
      username: "ada",
    });
    expect(invoke).toHaveBeenCalledWith("zotero_cloud_fetch", {
      id: "z1",
      path: "keys/current",
      query: "",
    });

    const fetch = vi.fn(async () => Response.json({ userID: 5, username: "" }));
    vi.stubGlobal("fetch", fetch);
    expect(await checkZoteroKey(" typed ")).toEqual({ userId: "5", username: "" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.zotero.org/keys/current");
    expect((init.headers as Record<string, string>)["Zotero-API-Key"]).toBe("typed");
  });
});
