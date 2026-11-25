import { invoke } from "@tauri-apps/api/core";
import { Cloud, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { dragWindow, formatOpened } from "@scholarkit/editor/lib/platform";
import { templatePages } from "@/templates";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  BUTTON,
  Dialog,
  messageOf,
  PRIMARY_BUTTON,
} from "@scholarkit/editor/components/Dialog";
import { Mark } from "./Mark";
import { BLANK, StartTemplates } from "./StartTemplates";
import {
  START_INPUT,
  START_LINK,
  StartFooter,
  StartPage,
  StartSection,
} from "@scholarkit/editor/components/StartPage";
import { t } from "@scholarkit/i18n";

interface Recent {
  name: string;
  path: string;
  openedAt: number;
}

const fail = (error: unknown): never => {
  throw new Error(typeof error === "string" ? error : messageOf(error));
};

/**
 * The desktop app without an open project: make a project in the
 * Cursive folder, or open one you had open before, a folder, or a
 * project from your account.
 */
export function ProjectPicker({
  onOpen,
  onOpenFromAccount,
  account,
}: {
  /** Opens a project's folder. Rejects with why not. */
  onOpen: (dir: string) => Promise<void>;
  onOpenFromAccount: () => void;
  /** The account menu, or Sign in, at the top right. */
  account?: React.ReactNode;
}) {
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [root, setRoot] = useState("");
  const [name, setName] = useState("");
  const [start, setStart] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Recent | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<Recent | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  const refresh = () =>
    invoke<{ root: string; recent: Recent[] }>("projects_list").then(
      (projects) => {
        setRoot(projects.root);
        setRecent(projects.recent);
      },
      (error: unknown) => {
        setRecent([]);
        setProblem(messageOf(error));
      },
    );

  useEffect(() => {
    document.title = "Cursive";
    void refresh();
  }, []);

  /** Runs something and says why when it didn't work. */
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  /** A project with the template's pages, or one empty page. */
  const create = () =>
    run(async () => {
      const dir = await invoke<string>("projects_create", {
        name,
        unique: false,
      }).catch(fail);
      const pages = start === BLANK ? { "Untitled.md": "" } : templatePages(start);
      for (const [path, source] of Object.entries(pages)) {
        await invoke("project_write_page", { dir, path, source }).catch(fail);
      }
      await onOpen(dir);
    });

  const openFolder = () =>
    run(async () => {
      // The app shows the dialog itself: only a folder picked there joins the list of projects.
      const picked = await invoke<Recent | null>("projects_pick");
      if (picked) await onOpen(picked.path);
    });

  const rename = () =>
    run(async () => {
      if (!renaming) return;
      await invoke("projects_rename", { dir: renaming.path, name: newName }).catch(
        fail,
      );
      setRenaming(null);
      await refresh();
    });

  const trash = (project: Recent) =>
    run(async () => {
      await invoke("projects_trash", { dir: project.path }).catch(fail);
      await refresh();
    });

  return (
    <>
      <StartPage
        mark={<Mark className="size-11" />}
        title={t("New Cursive project")}
        onDrag={dragWindow}
        account={account}
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
          {root && (
            <p className="mt-2 truncate text-xs text-muted-foreground" title={root}>
              {t("New projects are folders in {root}.", { root })}
            </p>
          )}
          {problem && !renaming && (
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
          >
            <button
              type="button"
              className={START_LINK}
              disabled={busy}
              onClick={() => void openFolder()}
            >
              <FolderOpen aria-hidden />
              {t("Open folder…")}
            </button>
            <button
              type="button"
              className={START_LINK}
              title={t(
                "Open a project from your Scholarkit account, made in your browser or on another computer",
              )}
              onClick={onOpenFromAccount}
            >
              <Cloud aria-hidden />
              {t("Open from your account…")}
            </button>
          </StartFooter>
        </form>

        <StartSection title={t("Recent")}>
          {recent === null ? (
            <p className="px-1.5 py-1.5 text-sm text-muted-foreground" role="status">
              {t("Loading…")}
            </p>
          ) : recent.length === 0 ? (
            <p className="px-1.5 py-1.5 text-sm text-muted-foreground">
              {t("No projects yet. Create one above or open a folder.")}
            </p>
          ) : (
            <ul className="-mx-1 space-y-0.5">
              {recent.map((project) => (
                <li
                  key={project.path}
                  className="group relative flex items-center rounded-md hover:bg-muted"
                >
                  <button
                    type="button"
                    title={project.path}
                    disabled={busy}
                    onClick={() => void run(() => onOpen(project.path))}
                    className="flex min-w-0 flex-1 items-baseline gap-3 px-2.5 py-1.5 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {project.name}
                    </span>
                    <span className="flex-none text-2xs text-muted-foreground group-focus-within:invisible group-hover:invisible">
                      {formatOpened(project.openedAt)}
                    </span>
                  </button>
                  {/* Over the date on hover, so the row keeps its height. */}
                  <div className="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label={t("Rename {name}", { name: project.name })}
                      title={t("Rename project")}
                      onClick={() => {
                        setProblem(null);
                        setNewName(project.name);
                        setRenaming(project);
                      }}
                      className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={t("Move {name} to the trash", { name: project.name })}
                      title={t("Move project to the trash")}
                      onClick={() => setDeleting(project)}
                      className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </StartSection>
      </StartPage>

      {renaming && (
        <Dialog title={t("Rename project")} onClose={() => setRenaming(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (newName.trim() !== "") void rename();
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onFocus={(event) => event.target.select()}
              aria-label={t("Project name")}
              maxLength={120}
              className="mt-3 h-8 w-full rounded-md border bg-background px-2 text-[13px] outline-none focus:border-ring"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {t("The project's folder gets the same name.")}
            </p>
            {problem && (
              <p className="mt-2 text-xs text-destructive" role="alert">
                {problem}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={BUTTON}
                onClick={() => setRenaming(null)}
              >
                {t("Cancel")}
              </button>
              <button
                type="submit"
                className={PRIMARY_BUTTON}
                disabled={busy || newName.trim() === ""}
              >
                {t("Rename")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {deleting && (
        <ConfirmDialog
          title={t("Move “{name}” to the trash?", { name: deleting.name })}
          body={t(
            "The project's folder, with every page in it, moves to the trash on your computer. You can restore it from there until you empty the trash.",
          )}
          confirmLabel={t("Move to trash")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            void trash(deleting);
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
