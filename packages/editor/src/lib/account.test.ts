import { describe, expect, it } from "vitest";
import { AccountServer, ServerError, type Transport, type Usage } from "./account";

const usage: Usage = {
  plan: "free",
  storage: { usedBytes: 42_500, limitBytes: 100_000_000 },
  compile: { usedPercent: 1, resetsAt: "2026-11-26T00:00:00.000Z" },
  reviewLinks: { count: 1, limit: 1 },
};

const server = (status: number, body: unknown) => {
  const calls: string[] = [];
  const send: Transport = async (method, path) => {
    calls.push(`${method} ${path}`);
    return { status, body: JSON.stringify(body) };
  };
  return { client: new AccountServer(send, "cursive"), calls };
};

describe("AccountServer.usage", () => {
  it("asks for the account's usage", async () => {
    const { client, calls } = server(200, usage);
    expect(await client.usage()).toEqual(usage);
    expect(calls).toEqual(["GET /api/usage"]);
  });

  it("is null signed out, and from a server without plans", async () => {
    expect(await server(401, { error: "unauthorized" }).client.usage()).toBeNull();
    expect(await server(404, { error: "not_found" }).client.usage()).toBeNull();
  });

  it("passes on other errors", async () => {
    await expect(server(500, { error: "error" }).client.usage()).rejects.toBeInstanceOf(
      ServerError,
    );
  });
});
