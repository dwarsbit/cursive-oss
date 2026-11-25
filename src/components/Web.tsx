import { Send, Users } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
import { type Template, templatePages } from "@/templates";
import { Mark } from "./Mark";
import { AccountMenu } from "./AccountMenu";
import { AppLoading, HomeMark } from "@scholarkit/editor/components/AppShell";
import { webAddresses } from "@/lib/web-address";
import { TemplateDialog } from "./TemplateDialog";
import { t } from "@scholarkit/i18n";
import { saveBeforeSwitch } from "@/lib/languages";

const server = new Server(browserTransport);

/** The app's addresses: the list at /cursive/projects, one project at /cursive/projects/<id>. */
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
    external={false}
    onManage={() => window.location.assign("/account")}
    onSignOut={async () => {
      await server.signOut();
      window.location.assign("/sign-in");
    }}
  />
);

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

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

/** The account's Cursive projects, and a field to start a new one. */
function Projects({ account }: { account: Account }) {
  const [projects, setProjects] = useState<ServerProject[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [templates, setTemplates] = useState(false);

  useEffect(() => {
    document.title = t("Projects · Cursive");
    server
      .projects()
      .then(setProjects, (error: unknown) => setProblem(messageOf(error)));
  }, []);

  const create = async (template?: Template) => {
    setBusy(true);
    setProblem(null);
    try {
      const project = await server.createProject(
        name.trim() || template?.name || t("Notes"),
        "online",
      );
      if (template) await fill(project.id, templatePages(template.id));
      go(ADDRESS.of(project.id));
    } catch (error) {
      setProblem(messageOf(error));
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 py-10">
        <header className="flex items-center gap-1">
          <HomeMark href="/" label={t("Scholarkit home")}>
            <Mark className="size-[22px]" />
          </HomeMark>
          <h1 className="flex-1 text-sm font-semibold">{t("Cursive")}</h1>
          {accountMenu(account)}
        </header>

        <h2 className="mt-8 text-lg font-semibold">{t("Projects")}</h2>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("Name of a new project")}
            aria-label={t("Name of a new project")}
            maxLength={120}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-[13px] outline-none focus:border-ring"
          />
          <button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
            {t("New project")}
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={busy}
            onClick={() => {
              setProblem(null);
              setTemplates(true);
            }}
          >
            {t("From a template…")}
          </button>
        </form>

        {templates && (
          <TemplateDialog
            busy={busy}
            problem={problem}
            onPick={(template) => void create(template)}
            onClose={() => setTemplates(false)}
          />
        )}
        {problem && !templates && (
          <p className="mt-3 text-[13px] text-destructive" role="alert">
            {problem}
          </p>
        )}

        {!projects ? (
          !problem && (
            <p className="mt-6 text-[13px] text-muted-foreground" role="status">
              {t("Loading your projects…")}
            </p>
          )
        ) : projects.length === 0 ? (
          <p className="mt-6 text-[13px] text-muted-foreground">
            {t(
              "You have no projects yet. Start one here, or sync a folder from the desktop app.",
            )}
          </p>
        ) : (
          <ul className="mt-4 overflow-hidden rounded-[10px] bg-card shadow-[0_0_0_1px_var(--border)]">
            {projects.map((project) => (
              <li key={project.id} className="border-b last:border-b-0">
                <a
                  href={ADDRESS.of(project.id)}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                    event.preventDefault();
                    go(ADDRESS.of(project.id));
                  }}
                  className="flex h-9 items-center gap-3 px-3 text-[13px] hover:bg-muted"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {project.name}
                  </span>
                  <span className="flex-none text-xs text-muted-foreground">
                    {project.owner.id === account.id ? "" : `${project.owner.name} · `}
                    {day(project.updatedAt)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
          saveFile={browserSaveFile}
          onClose={() => setPublishing(false)}
        />
      )}
    </>
  );
}

/**
 * Cursive in the browser, on the Scholarkit server: the account's
 * projects at /cursive/projects, one project at /cursive/projects/<id>. Signed out, it
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
    <Projects account={account} />
  );
}
