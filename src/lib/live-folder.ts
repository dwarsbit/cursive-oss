import * as Y from "yjs";
import {
  decodeDoc,
  diffPages,
  encodeDoc,
  readAssets,
  readPages,
  removeFromDoc,
  renameInDoc,
  writeDocPage,
  type PageChange,
} from "@scholarkit/editor/lib/project-doc";
import type { Connect, Connection, Presence } from "@scholarkit/editor/lib/sync";

/**
 * A shared project's folder, live: the desktop app keeps the project's
 * document open on the server, as the browser does, so what you type
 * reaches the others as you type it and theirs comes into the folder
 * and the open page as they type it.
 *
 * The document starts from a sync run that started after begin() (adopt),
 * with the edits made in the window since begin(): from then on the app's edits go into it as
 * they are made, and the runs move only files (see syncRun's `live`).
 * The folder stays the project: the others' changes are written into it.
 */

/** Where the others' changes go: the folder. */
export interface LiveDisk {
  writePage(path: string, source: string): Promise<void>;
  remove(path: string): Promise<void>;
}

/** An edit the app made to the project. */
export type LiveEdit =
  | { kind: "write"; path: string; source: string }
  | { kind: "rename"; from: string; to: string }
  | { kind: "remove"; path: string };

/** The transactions of this window, which the folder and the app have already. */
const LOCAL = "cursive-desktop";

function apply(doc: Y.Doc, edit: LiveEdit) {
  if (edit.kind === "write") writeDocPage(doc, edit.path, edit.source);
  else if (edit.kind === "rename") renameInDoc(doc, edit.from, edit.to);
  else removeFromDoc(doc, edit.path);
}

/** The files the document names, by their bytes, to tell when the others changed one. */
const filesKey = (doc: Y.Doc) =>
  JSON.stringify(
    Object.entries(readAssets(doc))
      .map(([path, ref]) => [path, ref.hash])
      .sort(),
  );

export type LiveFolder = ReturnType<typeof liveFolder>;

export function liveFolder(disk: LiveDisk, writable: boolean) {
  let doc: Y.Doc | null = null;
  // The app's edits since begin(), until the document takes them.
  let edits: LiveEdit[] | null = null;
  // Whether the run under way started after begin(): only its folder read misses no edit.
  let armed = false;
  let seen: Record<string, string> = {};
  let seenFiles = "";
  let connection: Connection | null = null;
  let closed = false;
  const changeListeners = new Set<(changes: PageChange[]) => void>();
  const fileListeners = new Set<() => void>();
  const presenceListeners = new Set<(presence: Presence) => void>();
  const lostListeners = new Set<() => void>();

  const onUpdate = (_update: Uint8Array, origin: unknown) => {
    const current = doc!;
    const pages = readPages(current);
    if (origin !== LOCAL) {
      // Someone else's change, live or from a run: into the folder, then the app.
      const changes = diffPages(seen, pages);
      for (const change of changes) {
        const written =
          change.text === null
            ? disk.remove(change.path)
            : disk.writePage(change.path, change.text);
        void written.catch(() => {});
      }
      if (changes.length > 0) changeListeners.forEach((listener) => listener(changes));
      const files = filesKey(current);
      if (files !== seenFiles) fileListeners.forEach((listener) => listener());
    }
    seen = pages;
    seenFiles = filesKey(current);
  };

  return {
    /** Starts keeping the app's edits for the document adopt() makes. */
    begin() {
      if (!doc && !edits && !closed) edits = [];
    },

    /** For a run that starts now: the document, null before there is one (folderSync's `live`). */
    forRun(): Y.Doc | null {
      armed = edits !== null;
      return doc;
    },

    /**
     * Makes the document from the state a run left, with the app's edits
     * since begin(). Called between runs, so none sees it half made.
     */
    adopt(state: string) {
      if (doc || !edits || !armed || closed) return;
      const next = state ? decodeDoc(state) : new Y.Doc();
      const kept = edits;
      if (writable)
        next.transact(() => kept.forEach((edit) => apply(next, edit)), LOCAL);
      edits = null;
      seen = readPages(next);
      seenFiles = filesKey(next);
      doc = next;
      next.on("update", onUpdate);
    },

    /** The project's document, once adopted. */
    doc: (): Y.Doc | null => doc,

    /** An edit the app made: into the document, or kept until there is one. */
    edit(edit: LiveEdit) {
      if (!writable || closed) return;
      if (doc) {
        const current = doc;
        current.transact(() => apply(current, edit), LOCAL);
      } else edits?.push(edit);
    },

    /** Opens the document's live connection; fails when the server can't be reached. */
    async connect(projectId: string, connect: Connect) {
      if (!doc || connection || closed) return;
      const opened = await connect(projectId, doc);
      if (closed) {
        opened.close();
        return;
      }
      connection = opened;
      opened.onLost?.(() => {
        if (connection !== opened) return;
        connection = null;
        lostListeners.forEach((listener) => listener());
      });
      const presence = opened.presence;
      if (presence) presenceListeners.forEach((listener) => listener(presence));
    },

    connected: () => connection !== null,

    /** Gives who else has the project open, once the connection is there. */
    withPresence(listener: (presence: Presence) => void) {
      presenceListeners.add(listener);
      if (connection?.presence) listener(connection.presence);
    },

    /** Pages the others changed, after they are written into the folder. */
    onChanges(listener: (changes: PageChange[]) => void) {
      changeListeners.add(listener);
      return () => void changeListeners.delete(listener);
    },

    /** The others added, changed or removed a file such as an image: a run brings its bytes. */
    onFiles(listener: () => void) {
      fileListeners.add(listener);
      return () => void fileListeners.delete(listener);
    },

    /** The server no longer lets the connection in, as after you left the project. */
    onLost(listener: () => void) {
      lostListeners.add(listener);
      return () => void lostListeners.delete(listener);
    },

    /** The document as the link keeps it (encodeDoc), or null before there is one. */
    state: () => (doc ? encodeDoc(doc) : null),

    close() {
      closed = true;
      connection?.close();
      connection = null;
      doc?.off("update", onUpdate);
    },
  };
}
