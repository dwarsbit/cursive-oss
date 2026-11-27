import { invoke } from "@tauri-apps/api/core";
import { Send, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import App, { type Status } from "@/App";
import { AccountDialog, type AccountAsk } from "@/components/AccountDialog";
import { AccountMenu } from "@/components/AccountMenu";
import { desktopTurn } from "@/lib/assistant/transport";
import { Mark } from "@/components/Mark";
import { AppLoading } from "@scholarkit/editor/components/AppShell";
import { HEADER_BUTTON } from "@scholarkit/editor/components/Dialog";
import { ProjectPicker } from "@/components/ProjectPicker";
import { PublishDialog } from "@/components/PublishDialog";
import { ShareDialog } from "@/components/ShareDialog";
import { desktopStore } from "@/lib/desktop-store";
import { liveFolder, type LiveFolder } from "@/lib/live-folder";
import { usePresence } from "@/lib/presence";
import { connectTo, type Presence } from "@scholarkit/editor/lib/sync";
import {
  folderSync,
  type FolderSync,
  type Link,
  type SyncState,
} from "@scholarkit/editor/lib/link-sync";
import { hasWindowButtons } from "@scholarkit/editor/lib/platform";
import { forgetFolder, loadFolder, saveFolder } from "@/lib/prefs";
import { updater } from "@/lib/updates";
import type { ProjectStore } from "@/lib/project";
import {
  desktopSaveFile,
  desktopTransport,
  Server,
  ServerError,
  type Account,
  type ServerProject,
} from "@/lib/server";
import { t } from "@scholarkit/i18n";
import { saveBeforeSwitch } from "@/lib/languages";
import { setPaperSearch, setWorkLookup } from "@scholarkit/editor/references/lookup";

const server = new Server(desktopTransport);

/** The account's usage for the account menu. */
const loadUsage = () => server.usage();

/** The assistant on our model, through the account: the desktop app asks from Rust. */
const ASSISTANT = { turn: desktopTurn, usage: loadUsage };

/** Opens a page of the account on the Scholarkit server, in the browser. */
const openAccountPage = (path: string) =>
  void invoke<string>("account_server")
    .then((url) => invoke("open_in_browser", { url: `${url}${path}` }))
    .catch(() => {});

const fail = (error: unknown): never => {
  throw new Error(typeof error === "string" ? error : String(error));
};

/** The folder's own name: the last part of its path. */
const folderName = (dir: string) =>
  dir
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() || "Notes";

/** A name a folder can have: a project's name without the marks a file system refuses. */
const asFolderName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "") || "Notes";

const STATUS: Record<Exclude<SyncState["kind"], "error">, Status> = {
  syncing: { text: t("Saved. Syncing…") },
  synced: { text: t("Saved and synced") },
  offline: { text: t("Saved. Not synced: the server can't be reached"), warn: true },
  "signed-out": { text: t("Saved. Sign in to sync"), warn: true },
  gone: {
    text: t("Saved. Not synced: this project is no longer in your account"),
    warn: true,
  },
};

/** An open folder: its store, and its sync when it is linked and signed in. */
interface Session {
  id: number;
  dir: string;
  store: ProjectStore & { flush: () => Promise<void> };
  appStore: ProjectStore;
  projectId: string | null;
  /** The project in the account, with your role in it; null when unknown. */
  info: ServerProject | null;
  sync: FolderSync | null;
  /** A shared project's live connection: see live-folder.ts. */
  live: LiveFolder | null;
  /** Connects live when the project is shared with others and isn't live yet. */
  goLive(): Promise<void>;
  /** Stops syncing and keeps where the project's document is. */
  close(): void;
}

let sessions = 0;

/** How often a window that comes back asks again whether the project became shared. */
const ASK_SHARED_EVERY = 30_000;

/** The sync service's address on the account's server: wss: for https:. */
const syncAddress = async () =>
  `${(await invoke<string>("account_server")).replace(/^http/, "ws")}/api/sync`;

async function openSession(dir: string, signedIn: boolean): Promise<Session> {
  const store = desktopStore(dir);
  const session: Session = {
    id: ++sessions,
    dir,
    store,
    appStore: store,
    projectId: null,
    info: null,
    sync: null,
    live: null,
    goLive: () => Promise.resolve(),
    close: () => void store.flush().catch(() => {}),
  };
  const link = await invoke<Link | null>("link_load", { dir }).catch(() => null);
  if (!link) return session;
  session.projectId = link.projectId;
  if (!signedIn) return session;

  // A project you can only read syncs one way. Unreachable, it is taken as yours.
  session.info = await server.project(link.projectId).catch(() => null);
  const writable = session.info?.writable ?? true;
  const projectId = link.projectId;
  const live = liveFolder(
    {
      writePage: (path, source) => store.writePage(path, source),
      remove: (path) => store.remove(path),
    },
    writable,
  );
  let closing = false;
  const sync = folderSync({
    server,
    folder: store.folder,
    link,
    writable,
    transfer: {
      stored: async () => new Set((await server.assets(projectId)).map((a) => a.hash)),
      upload: (path, ref) =>
        invoke<void>("link_upload_file", {
          dir,
          path,
          projectId,
          hash: ref.hash,
          contentType: ref.type,
        }),
      download: (path, ref) =>
        invoke<void>("link_download_file", { dir, path, projectId, hash: ref.hash }),
    },
    saveLink: (next) =>
      // Once the window closes, the live document is kept instead: it is newer.
      closing && live.doc()
        ? Promise.resolve()
        : invoke<void>("link_save", {
            dir,
            projectId: next.projectId,
            state: next.state,
          }),
    live: () => live.forRun(),
    afterRun: (next) => live.adopt(next.state),
  });
  session.sync = sync;
  session.live = live;
  live.onFiles(() => sync.touch());

  let trying: Promise<void> | null = null;
  session.goLive = () => {
    if (trying) return trying;
    if (live.connected() || closing) return Promise.resolve();
    trying = (async () => {
      await first;
      const ticket = await server.syncTicket(projectId);
      if (!ticket.shared) return;
      if (!live.doc()) {
        live.begin();
        await sync.run();
      }
      // The first ticket opens the connection; each reconnect asks for a new one.
      let fresh: string | null = ticket.ticket;
      await live.connect(
        projectId,
        connectTo(await syncAddress(), async () => {
          const ticket = fresh ?? (await server.syncTicket(projectId)).ticket;
          fresh = null;
          return ticket;
        }),
      );
    })()
      .catch(() => {})
      .finally(() => {
        trying = null;
      });
    return trying;
  };
  session.close = () => {
    closing = true;
    sync.stop();
    const state = live.state();
    live.close();
    void store.flush().catch(() => {});
    if (state) void invoke("link_save", { dir, projectId, state }).catch(() => {});
  };

  const first = sync.run();
  const touched = <T,>(work: Promise<T>) => {
    sync.touch();
    return work;
  };
  session.appStore = {
    ...store,
    // The folder is read after the first sync, or after a few seconds without one.
    load: async () => {
      await Promise.race([first, new Promise((done) => setTimeout(done, 5_000))]);
      return store.load();
    },
    subscribe: (listener) => {
      const runs = sync.onChanges(listener);
      const others = live.onChanges(listener);
      return () => {
        runs();
        others();
      };
    },
    onFiles: sync.onFiles,
    writePage: (path, source) => {
      live.edit({ kind: "write", path, source });
      return touched(store.writePage(path, source));
    },
    writeFile: (path, data) => touched(store.writeFile!(path, data)),
    rename: (from, to) => {
      live.edit({ kind: "rename", from, to });
      return touched(store.rename(from, to));
    },
    remove: (path) => {
      live.edit({ kind: "remove", path });
      return touched(store.remove(path));
    },
  };
  return session;
}

/**
 * The desktop app: a project is a folder on disk, by default one in
 * the Cursive folder in your home folder. Shows the project that was
 * open last, or the projects to pick from. Signed in to a Polemic
 * account, a project can sync with the account and be published.
 */
export function Desktop() {
  // DOIs, ISBNs, arXiv and PubMed IDs are looked up on the server, never at the source,
  // and so are papers by their title or authors.
  useEffect(() => {
    setWorkLookup((kind, id) => server.lookUpWork(kind, id));
    setPaperSearch(
      (q) => server.searchPapers(q),
      () => openAccountPage("/account#plan"),
    );
    return () => {
      setWorkLookup(null);
      setPaperSearch(null);
    };
  }, []);
  const [folder, setFolder] = useState(loadFolder);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // Counts the changes to the folder's link: each one opens the folder anew.
  const [linked, setLinked] = useState(0);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  // Whether the open project is connected live, with others to see.
  const [live, setLive] = useState(false);
  const withPresence = useCallback(
    (listener: (presence: Presence) => void) => session?.live?.withPresence(listener),
    [session],
  );
  const presence = usePresence(withPresence, account?.id ?? null);
  const [dialog, setDialog] = useState<
    { ask: AccountAsk; note?: string } | "publish" | "share" | null
  >(null);

  // The macOS window buttons sit over the app's top left corner, which
  // makes room for them. A full-screen window has none.
  useEffect(() => {
    if (!hasWindowButtons) return;
    const root = document.documentElement;
    root.classList.add("window-buttons");
    let live = true;
    let stop: (() => void) | undefined;
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow();
        const sync = () =>
          void appWindow.isFullscreen().then(
            (full) => live && root.classList.toggle("window-buttons", !full),
            () => {},
          );
        sync();
        const unlisten = await appWindow.onResized(sync);
        if (live) stop = unlisten;
        else unlisten();
      })
      .catch(() => {});
    return () => {
      live = false;
      stop?.();
    };
  }, []);

  // A switch to another interface language reloads the window: the open project is saved first.
  useEffect(() => {
    if (!session) return;
    return saveBeforeSwitch(() => session.store.flush());
  }, [session]);

  // A restart to install an update saves the open project first.
  useEffect(() => {
    if (!session || !updater) return;
    return updater.saveWith(() => session.store.flush());
  }, [session]);

  useEffect(() => {
    invoke<boolean>("account_signed_in").then(setSignedIn, () => setSignedIn(false));
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    server.me().then(
      (me) => {
        if (!current) return;
        if (me) setAccount(me);
        else setSignedIn(false);
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [signedIn]);

  useEffect(() => {
    if (!folder || signedIn === null) return;
    let current = true;
    let opened: Session | null = null;
    void openSession(folder, signedIn).then((next) => {
      if (!current) {
        next.close();
        return;
      }
      opened = next;
      setSession(next);
      setLive(false);
      setSyncState(next.sync?.state() ?? null);
      next.sync?.onState((state) => {
        if (!current) return;
        setSyncState(state);
        if (state.kind === "signed-out") setSignedIn(false);
      });
      // A project shared with others connects live once the first run is done.
      next.live?.withPresence(() => current && setLive(true));
      next.live?.onLost(() => current && setLive(false));
      void next.goLive();
    });
    return () => {
      current = false;
      opened?.close();
    };
  }, [folder, signedIn, linked]);

  // Pages still waiting to be written are written before the window
  // closes, and a window that comes back syncs, and connects live when
  // the project became shared or the connection was lost.
  useEffect(() => {
    if (!session) return;
    let asked = Date.now();
    const onHide = () => void session.store.flush().catch(() => {});
    const onFocus = () => {
      void session.sync?.run();
      if (Date.now() - asked < ASK_SHARED_EVERY) return;
      asked = Date.now();
      void session.goLive();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("blur", onHide);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("blur", onHide);
      window.removeEventListener("focus", onFocus);
    };
  }, [session]);

  /** Opens a folder as the project, and puts it at the top of the recent ones. */
  const openProject = useCallback(async (dir: string) => {
    const opened = await invoke<{ path: string }>("projects_opened", { dir }).catch(
      fail,
    );
    saveFolder(opened.path);
    setFolder(opened.path);
  }, []);

  // The project that was open last comes back, unless its folder is gone.
  useEffect(() => {
    const last = loadFolder();
    if (!last) return;
    invoke<{ path: string }>("projects_opened", { dir: last }).then(
      (opened) => {
        saveFolder(opened.path);
        setFolder(opened.path);
      },
      () => {
        forgetFolder();
        setFolder(null);
      },
    );
  }, []);

  const closeProject = () => {
    session?.close();
    forgetFolder();
    setFolder(null);
  };

  const renameProject = async (name: string) => {
    if (!folder || !session) return;
    await session.store.flush();
    const moved = await invoke<string>("projects_rename", { dir: folder, name }).catch(
      fail,
    );
    // The project in the account gets the name too, when it is yours to rename.
    if (session.projectId && signedIn) {
      await server.renameProject(session.projectId, name).catch(() => {});
    }
    saveFolder(moved);
    setFolder(moved);
  };

  const openUrl = useCallback(
    (url: string) => void invoke("open_in_browser", { url }).catch(() => {}),
    [],
  );

  const signIn = async (create: boolean) => {
    setAccount(await invoke<Account>("account_sign_in", { create }).catch(fail));
    setSignedIn(true);
  };

  const signOut = async () => {
    await invoke("account_sign_out").catch(fail);
    setAccount(null);
    setSignedIn(false);
  };

  const link = async () => {
    if (!folder) return;
    await session?.store.flush();
    const project = await server.createProject(folderName(folder), "linked");
    await invoke("link_save", { dir: folder, projectId: project.id, state: "" }).catch(
      fail,
    );
    setLinked((n) => n + 1);
  };

  const unlink = async () => {
    if (!folder) return;
    await invoke("link_remove", { dir: folder }).catch(fail);
    setLinked((n) => n + 1);
  };

  const openFromAccount = async (project: ServerProject) => {
    const dir = await invoke<string>("projects_create", {
      name: asFolderName(project.name),
      unique: true,
    }).catch(fail);
    await invoke("link_save", { dir, projectId: project.id, state: "" }).catch(fail);
    await openProject(dir);
    setLinked((n) => n + 1);
    setDialog(null);
  };

  const publish = () => {
    if (!signedIn) {
      setDialog({
        ask: "sync",
        note: t("Sign in to publish this project as a site."),
      });
    } else if (!session?.sync || !session.projectId) {
      setDialog({
        ask: "sync",
        note: t("To publish this project, sync it to your account first."),
      });
    } else setDialog("publish");
  };

  const share = () => {
    if (!signedIn) {
      setDialog({
        ask: "sync",
        note: t("Sign in to share this project with others."),
      });
    } else if (!session?.projectId || !session.info) {
      setDialog({
        ask: "sync",
        note: t("To share this project, sync it to your account first."),
      });
    } else setDialog("share");
  };

  /** You left a project someone shared: the folder stays, and no longer syncs. */
  const left = async () => {
    setDialog(null);
    await unlink();
  };

  const status = useMemo<Status | undefined>(() => {
    if (!session?.projectId) return undefined;
    if (!signedIn) return STATUS["signed-out"];
    if (!syncState) return undefined;
    return syncState.kind === "error"
      ? {
          text: t("Saved. Not synced: {message}", { message: syncState.message }),
          warn: true,
        }
      : STATUS[syncState.kind];
  }, [session, signedIn, syncState]);

  const accountDialog = dialog && dialog !== "publish" && dialog !== "share" && (
    <AccountDialog
      ask={dialog.ask}
      signedIn={signedIn === true}
      note={dialog.note}
      onSignIn={async (create) => {
        await signIn(create);
        // Signed in, and nothing left to ask: the project syncs already.
        if (dialog.ask === "sign-in" || (dialog.ask === "sync" && session?.projectId)) {
          setDialog(null);
        }
      }}
      onCancelSignIn={() => void invoke("account_cancel_sign_in")}
      onLink={async () => {
        await link();
        setDialog(null);
      }}
      listProjects={() => server.projects()}
      onOpenProject={openFromAccount}
      onClose={() => setDialog(null)}
    />
  );

  if (!folder) {
    return (
      <>
        <ProjectPicker
          onOpen={openProject}
          onOpenFromAccount={() => setDialog({ ask: "projects" })}
          account={
            signedIn ? (
              <AccountMenu
                account={account}
                loadUsage={loadUsage}
                onManage={() => openAccountPage("/account")}
                onUpgrade={() => openAccountPage("/account#plan")}
                onSignOut={signOut}
              />
            ) : signedIn === false ? (
              <button
                type="button"
                className={HEADER_BUTTON}
                onClick={() => setDialog({ ask: "sign-in" })}
              >
                {t("Sign in")}
              </button>
            ) : undefined
          }
        />
        {accountDialog}
      </>
    );
  }

  if (!session || session.dir !== folder) {
    return (
      <AppLoading
        mark={<Mark className="size-[22px]" />}
        status={t("Opening your project…")}
      />
    );
  }

  return (
    <>
      <App
        key={session.id}
        store={session.appStore}
        onSwitchProject={closeProject}
        onRenameProject={renameProject}
        status={status}
        presence={live ? presence : undefined}
        assistant={signedIn ? ASSISTANT : undefined}
        actions={(ask) => (
          <>
            <button type="button" className={HEADER_BUTTON} onClick={share}>
              <Users className="size-3.5" aria-hidden />
              {t("Share")}
            </button>
            {(!session.info || session.info.role === "owner") && (
              <button type="button" className={HEADER_BUTTON} onClick={publish}>
                <Send className="size-3.5" aria-hidden />
                {t("Publish")}
              </button>
            )}
            {ask}
            {signedIn ? (
              <AccountMenu
                account={account}
                loadUsage={loadUsage}
                linked={Boolean(session.projectId)}
                onLink={link}
                onUnlink={unlink}
                onManage={() => openAccountPage("/account")}
                onUpgrade={() => openAccountPage("/account#plan")}
                onSignOut={signOut}
              />
            ) : (
              <button
                type="button"
                className={HEADER_BUTTON}
                onClick={() => setDialog({ ask: "sign-in" })}
              >
                {t("Sign in")}
              </button>
            )}
          </>
        )}
      />
      {accountDialog}
      {dialog === "share" && session.info && account && (
        <ShareDialog
          server={server}
          project={session.info}
          me={account}
          onLeft={() => void left()}
          openPlans={() =>
            void invoke<string>("account_server").then((url) =>
              openUrl(`${url}/account#plan`),
            )
          }
          onClose={() => {
            setDialog(null);
            void session.goLive();
          }}
        />
      )}
      {dialog === "publish" && session.projectId && (
        <PublishDialog
          server={server}
          projectId={session.projectId}
          prepare={async () => {
            await session.sync?.run();
            const state = session.sync?.state();
            if (state && state.kind !== "synced") {
              throw new ServerError(
                0,
                "not_synced",
                t(
                  "The project couldn't be synced, so the site would be out of date. Try again when you're online.",
                ),
              );
            }
          }}
          openUrl={openUrl}
          openAccount={() =>
            void invoke<string>("account_server").then((url) =>
              openUrl(`${url}/account`),
            )
          }
          openPlans={() =>
            void invoke<string>("account_server").then((url) =>
              openUrl(`${url}/account#plan`),
            )
          }
          saveFile={desktopSaveFile}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
