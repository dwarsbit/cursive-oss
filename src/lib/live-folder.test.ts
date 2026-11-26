import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  encodeDoc,
  newDoc,
  readPages,
  removeFromDoc,
  writeAsset,
  writeDocPage,
} from "@scholarkit/editor/lib/project-doc";
import type { Connect, Presence } from "@scholarkit/editor/lib/sync";
import { liveFolder } from "./live-folder";

function disk() {
  const pages: Record<string, string> = {};
  return {
    pages,
    writePage: vi.fn(
      async (path: string, source: string) => void (pages[path] = source),
    ),
    remove: vi.fn(async (path: string) => void delete pages[path]),
  };
}

/** The state a sync run leaves: the project as the server has it. */
function serverState(pages: Record<string, string>) {
  const doc = newDoc();
  for (const [path, source] of Object.entries(pages)) writeDocPage(doc, path, source);
  return { doc, state: encodeDoc(doc) };
}

/** Brings what `from` has into `to`, as the connection would. */
const pass = (from: Y.Doc, to: Y.Doc) =>
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)));

describe("liveFolder", () => {
  it("starts from a run's state with the edits made since it began", () => {
    const folder = disk();
    const live = liveFolder(folder, true);
    const { state } = serverState({ "a.md": "A\n" });

    live.begin();
    live.edit({ kind: "write", path: "a.md", source: "A, typed during the run\n" });
    live.edit({ kind: "write", path: "b.md", source: "B\n" });
    expect(live.forRun()).toBeNull();
    live.adopt(state);

    expect(readPages(live.doc()!)).toEqual({
      "a.md": "A, typed during the run\n",
      "b.md": "B\n",
    });
    // The folder has your own edits already.
    expect(folder.writePage).not.toHaveBeenCalled();
    // From now on, runs use the document.
    expect(live.forRun()).toBe(live.doc());
  });

  it("waits for a run that started after it began", () => {
    const live = liveFolder(disk(), true);
    const { state } = serverState({ "a.md": "A\n" });
    // A run that started before: its folder read may miss edits.
    live.forRun();
    live.begin();
    live.adopt(state);
    expect(live.doc()).toBeNull();
    live.forRun();
    live.adopt(state);
    expect(live.doc()).not.toBeNull();
  });

  it("writes the others' changes into the folder and tells the app, not your own", () => {
    const folder = disk();
    const live = liveFolder(folder, true);
    const server = serverState({ "a.md": "A\n", "gone.md": "Soon gone\n" });
    live.begin();
    live.forRun();
    live.adopt(server.state);
    const changes = vi.fn();
    live.onChanges(changes);

    live.edit({ kind: "write", path: "a.md", source: "A, mine\n" });
    expect(changes).not.toHaveBeenCalled();
    expect(folder.writePage).not.toHaveBeenCalled();

    pass(live.doc()!, server.doc);
    server.doc.transact(() => {
      writeDocPage(server.doc, "a.md", "A, mine, and theirs\n");
      writeDocPage(server.doc, "c.md", "C\n");
      removeFromDoc(server.doc, "gone.md");
    });
    pass(server.doc, live.doc()!);

    expect(folder.pages).toEqual({ "a.md": "A, mine, and theirs\n", "c.md": "C\n" });
    expect(folder.remove).toHaveBeenCalledWith("gone.md");
    expect(changes).toHaveBeenCalledTimes(1);
    expect(changes.mock.calls[0]![0]).toEqual(
      expect.arrayContaining([
        { path: "a.md", base: "A, mine\n", text: "A, mine, and theirs\n" },
        { path: "c.md", base: null, text: "C\n" },
        { path: "gone.md", base: "Soon gone\n", text: null },
      ]),
    );
  });

  it("asks for a run when the others change a file", () => {
    const live = liveFolder(disk(), true);
    const server = serverState({ "a.md": "A\n" });
    live.begin();
    live.forRun();
    live.adopt(server.state);
    const files = vi.fn();
    live.onFiles(files);
    writeAsset(server.doc, "figure.png", {
      hash: "f".repeat(64),
      size: 3,
      type: "image/png",
    });
    pass(server.doc, live.doc()!);
    expect(files).toHaveBeenCalledTimes(1);
  });

  it("keeps a project you can only read out of the document", () => {
    const live = liveFolder(disk(), false);
    live.begin();
    live.edit({ kind: "write", path: "a.md", source: "Mine\n" });
    live.forRun();
    live.adopt(serverState({ "a.md": "Theirs\n" }).state);
    live.edit({ kind: "write", path: "a.md", source: "Mine again\n" });
    expect(readPages(live.doc()!)).toEqual({ "a.md": "Theirs\n" });
  });

  it("hands over who is here, and says when the server lets go", async () => {
    const live = liveFolder(disk(), true);
    live.begin();
    live.forRun();
    live.adopt(serverState({}).state);
    const presence = { set: () => {}, others: () => [], onChange: () => () => {} };
    let lose = () => {};
    const close = vi.fn();
    const connect: Connect = async () => ({
      unsynced: () => 0,
      onUnsynced: () => {},
      onLost: (listener) => (lose = listener),
      presence: presence satisfies Presence,
      close,
    });
    const handed = vi.fn();
    const lost = vi.fn();
    live.withPresence(handed);
    live.onLost(lost);
    await live.connect("p1", connect);
    expect(live.connected()).toBe(true);
    expect(handed).toHaveBeenCalledWith(presence);
    lose();
    expect(live.connected()).toBe(false);
    expect(lost).toHaveBeenCalledTimes(1);
    live.close();
    expect(live.state()).not.toBeNull();
  });
});
