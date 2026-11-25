import { Send, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import App, { type Status } from "@/App";
import {
  BUTTON,
  HEADER_BUTTON,
  messageOf,
  PRIMARY_BUTTON,
} from "@scholarkit/editor/components/Dialog";
import { PublishDialog } from "@/components/PublishDialog";
import { ShareDialog } from "@/components/ShareDialog";
import { HereNow } from "@/components/HereNow";
import { usePresence } from "@/lib/presence";
import {
  browserSaveFile,
  browserTransport,
  Server,
  type Account,
  type ServerProject,
} from "@/lib/server";
import { serverStore } from "@/lib/server-store";
import { templatePages } from "@/templates";
import { Mark } from "./Mark";
import { AccountMenu } from "./AccountMenu";
import { AppLoading, HomeMark } from "@scholarkit/editor/components/AppShell";
import { webAddresses } from "@/lib/web-address";
import { BLANK, StartTemplates } from "./StartTemplates";
import {
  START_INPUT,
  StartFooter,
  StartPage,
} from "@scholarkit/editor/components/StartPage";
import { t } from "@scholarkit/i18n";
import { rich } from "@scholarkit/i18n/react";
import { saveBeforeSwitch } from "@/lib/languages";

const server = new Server(browserTransport);

/** The account's usage for the account menu. */
const loadUsage = () => server.usage();

/** The app's addresses: a new project at /cursive/projects, one project at /cursive/projects/<id>. */
const ADDRESS = webAddresses(import.meta.env.BASE_URL);

const subscribeToAddress = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
};

function go(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const openUrl = (url: string) => void window.open(url, "_blank", "noopener");

/** The avatar at the end of the header, as in the desktop app, without its syncing: here the account holds every project. */
const accountMenu = (account: Account) => (
  <AccountMenu
    account={account}
    loadUsage={loadUsage}
    external={false}
    onManage={() => window.location.assign("/account")}
    onUpgrade={() => window.location.assign("/account#plan")}
    onSignOut={async () => {
      await server.signOut();
      window.location.assign("/sign-in");
    }}
  />
);

/** Writes pages to a new project and waits until the server has them. */
async function fill(id: string, pages: Record<string, string>) {
  const store = serverStore(server, id);
  try {
    await store.load();
    const saved = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error(t("The template's pages couldn't be saved. Try again."))),
        15_000,
      );
      store.onSaved(() => {
        if (!store.saved()) return;
        clearTimeout(timer);
        resolve();
      });
    });
    for (const [path, source] of Object.entries(pages)) {
      await store.writePage(path, source);
    }
    await saved;
  } finally {
    store.close();
  }
}

/** A new project, made in the account. The Scholarkit home lists the projects. */
function NewProject({ account }: { account: Account }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = t("New project · Cursive");
  }, []);

  const create = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const project = await server.createProject(name.trim(), "online");
      if (start !== BLANK) await fill(project.id, templatePages(start));
      go(ADDRESS.of(project.id));
    } catch (error) {
      setProblem(messageOf(error));
      setBusy(false);
    }
  };

  return (
    <StartPage
      mark={<Mark className="size-11" />}
      title={t("New Cursive project")}
      corner={
        <HomeMark href="/" label={t("Scholarkit home")}>
          <Mark className="size-[22px]" />
        </HomeMark>
      }
      account={accountMenu(account)}
      below={rich("Your projects are on <0>the Scholarkit home</0>.", [
        (text) => (
          <a
            href="/"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            {text}
          </a>
        ),
      ])}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // An empty name has nothing to create: point at the field.
          if (name.trim() === "") nameInput.current?.focus();
          else void create();
        }}
      >
        <input
          ref={nameInput}
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("Project name")}
          aria-label={t("Project name")}
          maxLength={120}
          className={START_INPUT}
        />
        <StartTemplates value={start} onChange={setStart} disabled={busy} />
        {problem && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {problem}
          </p>
        )}
        <StartFooter
          create={
            <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
              {t("Create")}
            </button>
          }
        />
      </form>
    </StartPage>
  );
}

// A store closes a moment after its screen goes, so a screen that
// comes straight back (as React does in development) keeps it.
const closing = new WeakMap<object, ReturnType<typeof setTimeout>>();

/** One project of the account, open in the editor. */
function OpenProject({ id, account }: { id: string; account: Account }) {
  const store = useMemo(() => serverStore(server, id), [id]);
  const [info, setInfo] = useState<ServerProject | null>(null);
  const [saved, setSaved] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const presence = usePresence(store.withPresence);

  useEffect(() => {
    clearTimeout(closing.get(store));
    store.onSaved(() => setSaved(store.saved()));
    return () =>
      void closing.set(
        store,
        setTimeout(() => store.close(), 0),
      );
  }, [store]);

  // A switch to another interface language reloads the page once the changes are in.
  useEffect(
    () =>
      saveBeforeSwitch(
        () =>
          new Promise<void>((resolve) => {
            if (store.saved()) return resolve();
            store.onSaved(() => {
              if (store.saved()) resolve();
            });
          }),
      ),
    [store],
  );

  // The project's access, read again whenever the server lets this window in anew: after
  // the owner changed your role, the server drops the connection and it comes back.
  useEffect(() => {
    let current = true;
    const read = () =>
      server.project(id).then(
        (project) => current && setInfo(project),
        () => {},
      );
    void read();
    store.onAccess(() => void read());
    return () => {
      current = false;
    };
  }, [id, store]);

  // Leaving with changes still on their way asks first.
  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!store.saved()) event.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [store]);

  const status: Status | undefined =
    info && !info.writable
      ? { text: t("You can read this project. Your changes aren't saved"), warn: true }
      : saved
        ? undefined
        : { text: t("Saving…") };

  return (
    <>
      <App
        store={store}
        onSwitchProject={() => go(ADDRESS.list)}
        homeHref="/"
        onRenameProject={
          info?.role === "owner"
            ? async (name) => setInfo(await server.renameProject(id, name))
            : undefined
        }
        status={status}
        presence={presence}
        actions={
          info && (
            <>
              <HereNow peers={presence.peers} me={account.id} />
              <button
                type="button"
                className={HEADER_BUTTON}
                onClick={() => setSharing(true)}
              >
                <Users className="size-3.5" aria-hidden />
                {t("Share")}
              </button>
              {info.role === "owner" && (
                <button
                  type="button"
                  className={HEADER_BUTTON}
                  onClick={() => setPublishing(true)}
                >
                  <Send className="size-3.5" aria-hidden />
                  {t("Publish")}
                </button>
              )}
              {accountMenu(account)}
            </>
          )
        }
      />
      {sharing && info && (
        <ShareDialog
          server={server}
          project={info}
          me={account}
          onLeft={() => go(ADDRESS.list)}
          onClose={() => setSharing(false)}
        />
      )}
      {publishing && (
        <PublishDialog
          server={server}
          projectId={id}
          openUrl={openUrl}
          openAccount={() => openUrl("/account")}
          saveFile={browserSaveFile}
          onClose={() => setPublishing(false)}
        />
      )}
    </>
  );
}

/**
 * Cursive in the browser, on the Scholarkit server: a new project at
 * /cursive/projects, one project at /cursive/projects/<id>. Signed out, it
 * goes to the server's sign-in page and comes back.
 */
export function Web() {
  const path = useSyncExternalStore(subscribeToAddress, () => window.location.pathname);

  // One address for the list, and old links (/cursive/<id>) land on the project's new address.
  useEffect(() => {
    const better = ADDRESS.better(path);
    if (better === null) return;
    window.history.replaceState(
      null,
      "",
      better + window.location.search + window.location.hash,
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [path]);
  const [account, setAccount] = useState<Account | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    server.me().then(
      (me) => {
        if (me) setAccount(me);
        else {
          const back = window.location.pathname + window.location.search;
          window.location.assign(`/sign-in?next=${encodeURIComponent(back)}`);
        }
      },
      (error: unknown) => setProblem(messageOf(error)),
    );
  }, []);

  if (!account) {
    const retry = problem && (
      <button type="button" className={BUTTON} onClick={() => window.location.reload()}>
        {t("Try again")}
      </button>
    );
    // A project opens into its layout; the list has none to show yet.
    if (ADDRESS.idIn(path)) {
      return (
        <AppLoading
          mark={<Mark className="size-[22px]" />}
          failed={Boolean(problem)}
          status={problem ?? t("Opening Cursive…")}
        >
          {retry}
        </AppLoading>
      );
    }
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground" role="status">
            {problem ?? t("Opening Cursive…")}
          </p>
          {retry}
        </div>
      </div>
    );
  }

  const id = ADDRESS.idIn(path);
  return id ? (
    <OpenProject key={id} id={id} account={account} />
  ) : (
    <NewProject account={account} />
  );
}
