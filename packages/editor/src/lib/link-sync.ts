import * as Y from "yjs";
import { ServerError, type AccountServer } from "./account";
import { MAX_FILE_BYTES } from "./file-types";
import {
  applyAssets,
  applyPages,
  decodeDoc,
  diffPages,
  encodeDoc,
  newDoc,
  readAssets,
  readPages,
  type AssetRef,
  type PageChange,
} from "./project-doc";

/** The two calls of the account's server a run makes. */
export type SyncServer = Pick<AccountServer, "documentSync" | "documentUpdate">;

/**
 * Syncs a project folder with its project in the account, the way the
 * Polemic editor syncs a linked folder: in runs over HTTP, each one
 * sending what changed in the folder and bringing what changed
 * elsewhere. The folder stays the project; nothing has to stay
 * connected, and a run that fails changes nothing.
 *
 * Between runs the link keeps a copy of the project's document. A run
 * compares the folder with that copy to see what changed here, so two
 * people's changes to the same page come together instead of one
 * replacing the other.
 *
 * Used by the desktop apps of Cursive and Binder.
 */

/** The folder, as a run reads and changes it. */
export interface Folder {
  /** Writes every page still waiting to be saved, then reads all pages. */
  read(): Promise<Record<string, string>>;
  write(path: string, source: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** The folder's other files, such as images, with the hash of their bytes. */
  files?(): Promise<Record<string, AssetRef>>;
  /** Called when a run changed a file, so the window shows it anew. */
  changedFile?(path: string): void;
}

/** How a run moves the bytes of files between the folder and the account. */
export interface FileTransfer {
  /** The hashes of the files the server has the bytes of. */
  stored(): Promise<Set<string>>;
  /**
   * Sends a file of the folder to the server. "full" when the account
   * has no room left for it, "too-large" when the server takes no file
   * this large: the file then stays in the folder only.
   */
  upload(path: string, ref: AssetRef): Promise<void | Held["reason"]>;
  /** Writes a file from the server into the folder. */
  download(path: string, ref: AssetRef): Promise<void>;
}

export interface Link {
  projectId: string;
  /** The document as of the last run (`encodeDoc`). Empty before the first. */
  state: string;
}

/** A file that stays in the folder only, and why. */
export interface Held {
  path: string;
  hash: string;
  /** "full": the account has no room left; "too-large": the account takes no file this large. */
  reason: "full" | "too-large";
}

export interface RunResult {
  /** The link after the run, to keep for the next one. */
  link: Link;
  /** What the run changed in the folder. */
  changes: PageChange[];
  /** Whether the folder had changes the server took. */
  sent: boolean;
  /** The files the run wrote into the folder or deleted from it. */
  files: string[];
  /** The folder's files that the account doesn't have: they stay in the folder only. */
  held: Held[];
}

/** An update that holds nothing is two bytes long. */
const isEmpty = (update: Uint8Array) => update.length <= 2;

/**
 * One run. `writable` is false for a project you can read but not change.
 *
 * With `live`, the project's document as a live connection keeps it, pages
 * already go both ways as they are typed: the run then moves files only,
 * and brings in over HTTP what the connection may have missed. The pages
 * it brings change `live`, whose owner writes them into the folder.
 */
export async function syncRun(
  server: SyncServer,
  folder: Folder,
  link: Link,
  writable: boolean,
  transfer?: FileTransfer,
  /** Files by their hash that an earlier run couldn't send: not tried again. */
  hold: ReadonlyMap<string, Held["reason"]> = new Map(),
  live: Y.Doc | null = null,
): Promise<RunResult> {
  const doc = live ?? (link.state ? decodeDoc(link.state) : new Y.Doc());
  // Ask first: when the server can't be reached, nothing has happened yet.
  const theirs = await server.documentSync(link.projectId, Y.encodeStateVector(doc));

  const before = live ? readPages(doc) : await folder.read();
  const local = transfer && folder.files ? await folder.files() : null;
  // Files the account doesn't take stay in the folder only.
  const held = new Map<string, Held["reason"]>();
  if (local) {
    for (const [path, ref] of Object.entries(local)) {
      if (ref.size > MAX_FILE_BYTES) held.set(path, "too-large");
    }
  }
  // A project you can only read takes nothing from the folder.
  if (writable) {
    if (!live) applyPages(doc, before);
    if (transfer && local) {
      // The bytes go first, so every file the document names can be fetched.
      const known = readAssets(doc);
      const changed = Object.entries(local).filter(
        ([path, ref]) => !held.has(path) && known[path]?.hash !== ref.hash,
      );
      if (changed.length) {
        const stored = await transfer.stored();
        const sent = new Map<string, Held["reason"] | null>();
        for (const [path, ref] of changed) {
          if (stored.has(ref.hash)) continue;
          if (!sent.has(ref.hash)) {
            sent.set(
              ref.hash,
              hold.get(ref.hash) ?? ((await transfer.upload(path, ref)) || null),
            );
          }
          const reason = sent.get(ref.hash);
          if (reason) held.set(path, reason);
        }
      }
      // A file held back keeps what the document had for it, if anything.
      const applied: Record<string, AssetRef> = {};
      for (const [path, ref] of Object.entries(local)) {
        if (!held.has(path)) applied[path] = ref;
        else if (known[path]) applied[path] = known[path];
      }
      applyAssets(doc, applied);
    }
  }
  Y.applyUpdate(doc, theirs.update);
  if (writable && doc.getMap("meta").get("layout") === undefined) {
    doc.getMap("meta").set("layout", newDoc().getMap("meta").get("layout"));
  }

  const after = readPages(doc);
  const changes = live ? [] : diffPages(before, after);
  for (const change of changes) {
    if (change.text === null) await folder.remove(change.path);
    else await folder.write(change.path, change.text);
  }

  // Files: what changed elsewhere comes into the folder, except over a
  // file held back here, which is newer than the account's.
  const files: string[] = [];
  if (transfer && local) {
    const filesAfter = readAssets(doc);
    for (const [path, ref] of Object.entries(filesAfter)) {
      if (held.has(path) || local[path]?.hash === ref.hash) continue;
      await transfer.download(path, ref);
      files.push(path);
    }
    for (const path of Object.keys(local)) {
      if (held.has(path) || path in filesAfter || path in after) continue;
      await folder.remove(path);
      files.push(path);
    }
    files.forEach((path) => folder.changedFile?.(path));
  }

  const mine = Y.encodeStateAsUpdate(doc, theirs.stateVector);
  const sent = writable && !isEmpty(mine);
  if (sent) await server.documentUpdate(link.projectId, mine);

  return {
    link: { projectId: link.projectId, state: encodeDoc(doc) },
    changes,
    sent,
    files,
    held: [...held]
      .map(([path, reason]) => ({ path, hash: local![path].hash, reason }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export type SyncState =
  /** A run is under way. */
  | { kind: "syncing" }
  /** Synced, but for the files listed, which stay in the folder only. */
  | { kind: "synced"; held: Held[] }
  /** The server can't be reached; the next run tries again. */
  | { kind: "offline" }
  /** The account is signed out, here or on the server. */
  | { kind: "signed-out" }
  /** The project is gone from the account, or no longer shared. */
  | { kind: "gone" }
  | { kind: "error"; message: string };

export interface FolderSync {
  /** A run now; runs never overlap, and one asked for during a run follows it. */
  run(): Promise<void>;
  /** A run soon: called when a page was saved. */
  touch(): void;
  onChanges(listener: (changes: PageChange[]) => void): () => void;
  /** Tells of files a run changed in the folder, with every file the folder has. */
  onFiles(listener: (files: string[]) => void): () => void;
  onState(listener: (state: SyncState) => void): () => void;
  state(): SyncState;
  stop(): void;
}

const AFTER_SAVE = 2_000;
const EVERY = 15_000;
/** How long a file the account didn't take waits before it is tried again. */
const RETRY_HELD = 10 * 60_000;

/** Keeps a folder in sync: on opening, after saves, and every little while. */
export function folderSync(options: {
  server: SyncServer;
  folder: Folder;
  link: Link;
  writable: boolean;
  /** Moves the bytes of images and other files; without it, only pages sync. */
  transfer?: FileTransfer;
  /** Keeps the link for the next time the folder is opened. */
  saveLink: (link: Link) => Promise<void>;
  /** The project's document while a live connection keeps it in step (see syncRun), else null. */
  live?: () => Y.Doc | null;
  /** Called right after each run that worked, before the next one can start. */
  afterRun?: (link: Link) => void;
}): FolderSync {
  let link = options.link;
  // The live document of the last run, until a run finds the connection gone.
  let lastLive: Y.Doc | null = null;
  let state: SyncState = { kind: "syncing" };
  let running: Promise<void> | null = null;
  let again = false;
  let stopped = false;
  let soon: ReturnType<typeof setTimeout> | undefined;
  // Files the account didn't take, by hash, until they are tried again.
  let hold = new Map<string, Held["reason"]>();
  let heldSince = 0;
  const changeListeners = new Set<(changes: PageChange[]) => void>();
  const fileListeners = new Set<(files: string[]) => void>();
  const stateListeners = new Set<(state: SyncState) => void>();

  const setState = (next: SyncState) => {
    state = next;
    stateListeners.forEach((listener) => listener(next));
  };

  const once = async () => {
    setState({ kind: "syncing" });
    if (hold.size > 0 && Date.now() - heldSince > RETRY_HELD) hold = new Map();
    const live = options.live?.() ?? null;
    // Without the connection, runs go on from its document: it has what was typed live.
    if (!live && lastLive)
      link = { projectId: link.projectId, state: encodeDoc(lastLive) };
    lastLive = live;
    try {
      const result = await syncRun(
        options.server,
        options.folder,
        link,
        options.writable,
        options.transfer,
        hold,
        live,
      );
      link = result.link;
      options.afterRun?.(link);
      const next = new Map(result.held.map((file) => [file.hash, file.reason]));
      if (next.size > 0 && hold.size === 0) heldSince = Date.now();
      hold = next;
      await options.saveLink(link);
      if (result.changes.length > 0) {
        changeListeners.forEach((listener) => listener(result.changes));
      }
      if (result.files.length > 0) {
        const files = await options.folder.files?.().catch(() => null);
        if (files)
          fileListeners.forEach((listener) => listener(Object.keys(files).sort()));
      }
      setState({ kind: "synced", held: result.held });
    } catch (error) {
      if (error instanceof ServerError && error.status === 0)
        setState({ kind: "offline" });
      else if (error instanceof ServerError && error.status === 401) {
        setState({ kind: "signed-out" });
      } else if (error instanceof ServerError && [403, 404].includes(error.status)) {
        setState({ kind: "gone" });
      } else {
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  const run = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await once();
      } while (again && !stopped);
      running = null;
    })();
    return running;
  };

  const timer = setInterval(() => void run(), EVERY);

  return {
    run,
    touch: () => {
      clearTimeout(soon);
      soon = setTimeout(() => void run(), AFTER_SAVE);
    },
    onChanges: (listener) => {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    onFiles: (listener) => {
      fileListeners.add(listener);
      return () => fileListeners.delete(listener);
    },
    onState: (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    state: () => state,
    stop: () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(soon);
    },
  };
}
