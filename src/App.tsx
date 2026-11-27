import { History, PanelLeft, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Mark } from "@/components/Mark";
import { AppLoading } from "@scholarkit/editor/components/AppShell";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { Editor, type EditorChange } from "@scholarkit/editor/components/Editor";
import { mergeMarkdown, type RemoteCaret } from "@scholarkit/editor/editor/collab";
import { Faces, colorFor, liveStatus, onePerPerson } from "@scholarkit/collab";
import type { RemoteCursor } from "@scholarkit/collab/codemirror";
import { MarkdownEditor } from "@scholarkit/editor/components/MarkdownEditor";
import { PageProperties } from "@scholarkit/editor/components/PageProperties";
import { clampWidth, Sidebar, type DropPlace } from "@/components/Sidebar";
import { HEADER_BUTTON } from "@scholarkit/editor/components/Dialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Backlinks } from "@scholarkit/editor/components/PageLinks";
import { FindBar, SearchDialog } from "@/components/Search";
import { HistoryDialog } from "@/components/HistoryDialog";
import type { PageSnapshot } from "@/lib/page-history";
import { ExportDialog } from "@/export/ExportDialog";
import { ReferencesProvider } from "@scholarkit/editor/references/context";
import { STYLE_KEY, styleOfProperties } from "@scholarkit/editor/references/styles";
import { setTextProperty } from "@scholarkit/editor/lib/properties";
import {
  addToFence,
  toBibliographyFence,
  writeBibliography,
  type Reference,
} from "@scholarkit/editor/references/reference";
import { cn } from "@scholarkit/editor/lib/cn";
import type { ProjectPresence } from "@/lib/presence";
import {
  plainText,
  readPage,
  writePage,
  type Page,
} from "@scholarkit/editor/lib/page-file";
import {
  countWords,
  loadClosedFolders,
  loadMode,
  loadOpenPage,
  loadSidebarWidth,
  saveClosedFolders,
  saveSidebarWidth,
  saveMode,
  saveOpenPage,
  type Mode,
} from "@/lib/prefs";
import type { PageChange } from "@scholarkit/editor/lib/project-doc";
import {
  ancestorsOf,
  applyChanges,
  baseName,
  buildTree,
  countPages,
  fileNameFor,
  freeFilePath,
  freePath,
  orderPages,
  parentOf,
  removeFrom,
  renameIn,
  type Project,
  type ProjectStore,
  type TreeNode,
} from "@/lib/project";
import { dragWindow } from "@scholarkit/editor/lib/platform";
import {
  backlinks,
  linkIndex,
  linkablePages,
  rebaseLinks,
  retargetLinks,
} from "@scholarkit/editor/lib/links";
import { WorkspaceProvider, type Workspace } from "@scholarkit/editor/lib/workspace";
import { openFind } from "@scholarkit/editor/lib/find";
import {
  emptySlide,
  isPresentation,
  NEW_PRESENTATION,
  readDeck,
  slideTitle,
  writeDeck,
} from "@/slides/deck";
import { Presenter } from "@/slides/Presenter";
import { SlideStage } from "@/slides/SlideStage";
import { useDeck } from "@/slides/use-deck";
import { formatNumber, t, tn } from "@scholarkit/i18n";
import type { SendTurn } from "@scholarkit/assistant";
import type { Usage } from "@scholarkit/editor/lib/account";
import { addReference } from "@scholarkit/editor/components/CiteMenu";
import {
  foundWork,
  lookUp,
  paperDetails,
  paperSearch,
  type FoundPaper,
} from "@scholarkit/editor/references/lookup";
import { pageReferences } from "@scholarkit/editor/references/reference";
import {
  AskAssistantButton,
  AssistantDock,
  AssistantFloatingLayer,
  AssistantMenuLayer,
  sourceInfo,
  type AssistantProps,
  type ReadSelection,
} from "@/components/Assistant";
import {
  CursiveChat,
  useChat,
  type ChatHost,
  type Selection,
} from "@/lib/assistant/chat";
import {
  assistantSnapshot,
  ownReady,
  saveAssistant,
  sourceOf,
  subscribeAssistant,
} from "@/lib/assistant/providers";
import { ownTurn } from "@/lib/assistant/transport";
import { replaceIn } from "@/lib/assistant/tools";

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: "visual", label: t("Visual"), hint: t("The page as blocks") },
  { id: "markdown", label: t("Markdown"), hint: t("The page as its Markdown file") },
];

/** What deleting a page or folder does, said before it happens. */
function deleteQuestion(node: TreeNode, place: ProjectStore["place"]): string {
  const pages = countPages(node);
  if (place === "disk")
    return node.kind === "page"
      ? t("The page is moved to the trash on your computer.")
      : pages === 0
        ? t("The folder is moved to the trash on your computer.")
        : tn(
            pages,
            "The folder and the page in it are moved to the trash on your computer.",
            "The folder and the {count} pages in it are moved to the trash on your computer.",
          );
  return node.kind === "page"
    ? t("The page is removed from this project. You can't undo this.")
    : pages === 0
      ? t("The folder is removed from this project. You can't undo this.")
      : tn(
          pages,
          "The folder and the page in it are removed from this project. You can't undo this.",
          "The folder and the {count} pages in it are removed from this project. You can't undo this.",
        );
}

/** What the status bar says when everything is saved. */
/** "Thesis/Pilot study plan.md" as "Pilot study plan", for the faces' names. */
const pageName = (path: string) =>
  path
    .slice(path.lastIndexOf("/") + 1)
    .replace(/\.md$/i, "")
    .trim();

const SAVED: Record<ProjectStore["place"], string> = {
  disk: t("Saved"),
  browser: t("Saved in this browser"),
  account: t("Saved to your account"),
};

/** What the app says about saving and syncing, when it has more to say than "Saved". */
export interface Status {
  text: string;
  /** Something needs attention: shown with the warning dot. */
  warn?: boolean;
}

/** The first page of a tree, top to bottom. */
function firstPage(nodes: TreeNode[]): string | null {
  for (const node of nodes) {
    const path = node.kind === "page" ? node.path : firstPage(node.children);
    if (path) return path;
  }
  return null;
}

export default function App({
  store,
  firstOpen,
  onSwitchProject,
  switchLabel = t("All projects"),
  homeHref,
  onRenameProject,
  actions,
  status,
  presence,
  assistant,
}: {
  store: ProjectStore;
  /** The page a new visitor sees first. */
  firstOpen?: string;
  /** Opens another project, where the app can. */
  onSwitchProject?: () => void;
  switchLabel?: string;
  /** Where the app's icon goes, where the app has a page for it: the Scholarkit home in the browser. */
  homeHref?: string;
  /** Gives the project another name, where the app can. Rejects with why not. */
  onRenameProject?: (name: string) => Promise<void>;
  /**
   * Buttons at the end of the header: the account, publishing. A
   * function puts the assistant's Ask button among them, next to the
   * account; otherwise it goes before them.
   */
  actions?: React.ReactNode | ((ask: React.ReactNode) => React.ReactNode);
  status?: Status;
  /** Who else has the project open, where the project lives in the account. */
  presence?: ProjectPresence;
  /** The assistant on our model, and the month's use of it: there with an account. */
  assistant?: { turn: SendTurn; usage: () => Promise<Usage | null> };
}) {
  const [project, setProject] = useState<Project | null>(null);
  // The project as of the last change, also before the screen shows it:
  // changes from elsewhere can arrive several at a time.
  const fresh = useRef<Project | null>(null);
  const commit = (next: Project) => {
    fresh.current = next;
    setProject(next);
  };
  const [active, setActive] = useState<string | null>(null);
  // Counts the changes to the project's files, so images show their new bytes.
  const [filesVersion, setFilesVersion] = useState(0);
  // The open page's title and path as links last knew them.
  const linked = useRef<{ path: string; title: string } | null>(null);
  // Counts the times a page or a mode was opened: each one starts a fresh editor.
  const [opened, setOpened] = useState(0);
  // Counts the changes to the open page from elsewhere: the editor brings each one in.
  const [remote, setRemote] = useState(0);
  const pageEditor = useRef<TiptapEditor | null>(null);
  const [mode, setMode] = useState(loadMode);
  const [closed, setClosed] = useState(() => new Set(loadClosedFolders()));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TreeNode | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [settings, setSettings] = useState(false);
  // The find bar of the open page, and the search of the project.
  const [finding, setFinding] = useState<{ text: string; replace: boolean } | null>(
    null,
  );
  const [searching, setSearching] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // The slide a presentation opens at: the one picked in the sidebar.
  const [startSlide, setStartSlide] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clampWidth(loadSidebarWidth()),
  );
  const focusEditor = useRef<(() => void) | null>(null);
  const focusEditorEnd = useRef<(() => void) | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  // Changes from elsewhere that arrived before the project was loaded.
  const early = useRef<PageChange[]>([]);

  useEffect(() => {
    let current = true;
    store.load().then(
      (loaded) => {
        if (!current) return;
        const { project: latest } = applyChanges(loaded, early.current);
        early.current = [];
        const wanted = [loadOpenPage(), firstOpen].find(
          (path) => path && path in latest.pages,
        );
        commit(latest);
        setActive(wanted ?? firstPage(buildTree(latest)));
      },
      (error: unknown) =>
        current && setProblem(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      current = false;
    };
  }, [store, firstOpen]);

  /** Runs a change in the store and says so when it fails. */
  const persist = (work: Promise<void>) =>
    work.then(
      () => setProblem(null),
      (error: unknown) =>
        setProblem(error instanceof Error ? error.message : String(error)),
    );

  // Pages changed elsewhere, on another computer, in another window or
  // by someone you share the project with, come into the open project.
  // The open page's editor brings the change in and keeps your caret; a
  // presentation starts afresh.
  const takeChanges = useRef<(changes: PageChange[]) => void>(() => {});
  useEffect(() => {
    takeChanges.current = (changes) => {
      const project = fresh.current;
      if (!project) {
        early.current.push(...changes);
        return;
      }
      const { project: next, writes } = applyChanges(project, changes);
      commit(next);
      for (const [path, file] of writes) void persist(store.writePage(path, file));
      if (active && active in next.pages) {
        const now = next.pages[active]!;
        if (now === project.pages[active]) return;
        if (mode === "visual" && isPresentation(readPage(now))) {
          setOpened((n) => n + 1);
          return;
        }
        // Right away, so a key pressed before the next render builds on it.
        if (mode === "visual" && pageEditor.current) {
          mergeMarkdown(pageEditor.current, readPage(now).markdown);
        }
        setRemote((n) => n + 1);
        return;
      }
      // The open page is gone: it was moved when its text is new on another path.
      const moved = active
        ? changes.find(
            (change) => change.base === null && change.text === project.pages[active],
          )
        : undefined;
      const path = moved?.path ?? firstPage(buildTree(next));
      setActive(path);
      setOpened((n) => n + 1);
      if (path) saveOpenPage(path);
    };
  });
  useEffect(
    () => store.subscribe?.((changes) => takeChanges.current(changes)),
    [store],
  );
  useEffect(
    () =>
      store.onFiles?.((files) => {
        if (fresh.current) commit({ ...fresh.current, files });
        setFilesVersion((n) => n + 1);
      }),
    [store],
  );

  // Links name the open page by its title as it was when the page was opened.
  useEffect(() => {
    const source = active ? fresh.current?.pages[active] : undefined;
    if (!active || source === undefined || linked.current?.path === active) return;
    linked.current = { path: active, title: readPage(source).title.trim() };
  }, [active]);

  // Where you are, for the others: the open page, and your caret in the view you have it in.
  const share = presence?.share;
  const view = mode === "visual" ? "visual" : "markdown";
  useEffect(() => {
    share?.({ page: active, view, anchor: null, head: null });
  }, [share, active, view]);
  const shareSelection = ({ anchor, head }: { anchor: number; head: number }) =>
    share?.({ page: active, view: "visual", anchor, head });
  const shareSourceSelection = ({ anchor, head }: { anchor: number; head: number }) =>
    share?.({ page: active, view: "markdown", anchor, head });
  const peers = presence?.peers;
  const me = presence?.me ?? null;
  // The others on this page in the same view as you; your own other windows don't count.
  const here = useMemo(
    () =>
      (peers ?? []).filter(
        (peer) =>
          peer.user.id !== me &&
          peer.page === active &&
          peer.view === view &&
          peer.anchor !== null &&
          peer.head !== null,
      ),
    [peers, me, active, view],
  );
  const others = useMemo<RemoteCaret[]>(
    () =>
      here.map((peer) => ({
        id: String(peer.clientId),
        name: peer.user.name,
        color: colorFor(peer.user.id),
        anchor: peer.anchor!,
        head: peer.head!,
      })),
    [here],
  );
  const sourceOthers = useMemo<RemoteCursor[]>(
    () =>
      here.map((peer) => ({
        id: peer.clientId,
        name: peer.user.name,
        color: colorFor(peer.user.id),
        anchor: peer.anchor!,
        head: peer.head!,
      })),
    [here],
  );
  // Everyone else in the project, once each, and what the status line says about them.
  const people = useMemo(
    () =>
      onePerPerson(
        (peers ?? []).map((peer) => ({
          id: peer.user.id,
          name: peer.user.name,
          where: peer.page,
        })),
        me,
      ),
    [peers, me],
  );
  const live = presence
    ? liveStatus({
        names: people.map((person) => person.name),
        connection: presence.connection,
      })
    : null;

  const tree = useMemo(() => (project ? buildTree(project) : []), [project]);
  // The presentations, each with what its slides are called.
  const decks = useMemo(() => {
    const found = new Map<string, string[]>();
    for (const [path, file] of Object.entries(project?.pages ?? {})) {
      const page = readPage(file);
      if (isPresentation(page)) {
        found.set(path, readDeck(page.markdown).map(slideTitle));
      }
    }
    return found;
  }, [project]);
  const source = project && active ? (project.pages[active] ?? null) : null;
  const page = useMemo(() => (source === null ? null : readPage(source)), [source]);
  const words = useMemo(
    () => (page ? countWords(plainText(page.markdown)) : 0),
    [page],
  );

  /**
   * Changes the open page. A function gets the page as it is now, so a
   * change that arrives while the project changes elsewhere (a page
   * moved in the sidebar) builds on the latest file.
   */
  const update = (change: Page | ((current: Page) => Page)) => {
    const latest = fresh.current;
    const source = latest && active ? latest.pages[active] : undefined;
    if (!latest || !active || source === undefined) return;
    const file = writePage(
      typeof change === "function" ? change(readPage(source)) : change,
    );
    if (file === source) return;
    commit({ ...latest, pages: { ...latest.pages, [active]: file } });
    void persist(store.writePage(active, file));
  };

  /**
   * Names the open page's file after its title, once the title is
   * typed. Returns the project as it is after that.
   */
  const syncFileName = (): Project | null => {
    if (!project || !active || !page?.title.trim()) return retitleLinks(project);
    const wanted = freePath(
      project,
      parentOf(active),
      fileNameFor(page.title),
      ".md",
      active,
    );
    if (wanted === active) return retitleLinks(project);
    const renamed = renameIn(project, active, wanted);
    commit(renamed);
    setActive(wanted);
    saveOpenPage(wanted);
    void persist(store.rename(active, wanted));
    return retitleLinks(renamed, wanted);
  };

  /**
   * After the open page got another title or path: links in other pages
   * that named it the old way name it the new way. Returns the project
   * with those pages changed.
   */
  const retitleLinks = (current: Project | null, path = active): Project | null => {
    const known = linked.current;
    if (!current || !path || !known || !(path in current.pages)) return current;
    const title = readPage(current.pages[path]).title.trim();
    linked.current = { path, title };
    // A new page had no title that links could name.
    if (!known.title || (known.path === path && known.title === title)) return current;
    // The pages as they were before: the page under its old path and title.
    const before = { ...current.pages };
    delete before[path];
    before[known.path] = writePage({
      ...readPage(current.pages[path]),
      title: known.title,
    });
    return relink(current, before, known.path, path);
  };

  /** Writes the pages whose links to a page that moved or got a new title must change. */
  const relink = (
    current: Project,
    before: Record<string, string>,
    from: string,
    to: string,
  ): Project => {
    const writes = retargetLinks(before, current.pages, from, to);
    if (!writes.length) return current;
    const next = {
      ...current,
      pages: { ...current.pages, ...Object.fromEntries(writes) },
    };
    commit(next);
    for (const [file, text] of writes) void persist(store.writePage(file, text));
    return next;
  };

  /** Gives the open page another citation style: APA, the default, needs no line. */
  const setStyle = (id: string) =>
    update((current) => ({
      ...current,
      properties: setTextProperty(
        current.properties,
        STYLE_KEY,
        id === "apa" ? null : id,
      ),
    }));

  /** Puts the open page back as a snapshot has it; the page as it is now is kept first. */
  const restoreSnapshot = async (snapshot: PageSnapshot) => {
    const history = store.history;
    if (!active || !history) return;
    if (history.restore) {
      // The store puts it back; the change arrives like one from elsewhere.
      await history.restore(active, snapshot);
      return;
    }
    await history.keep?.(active, snapshot.source);
    const latest = fresh.current;
    if (!latest || !(active in latest.pages)) return;
    commit({ ...latest, pages: { ...latest.pages, [active]: snapshot.source } });
    setOpened((n) => n + 1);
    await store.writePage(active, snapshot.source);
  };

  const open = (path: string, slide = 0) => {
    if (path !== active) {
      syncFileName();
      setStartSlide(slide);
      setActive(path);
      setOpened((n) => n + 1);
      saveOpenPage(path);
    }
    setNavOpen(false);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    syncFileName();
    setMode(next);
    setOpened((n) => n + 1);
    saveMode(next);
  };

  // Cmd/Ctrl + / switches between the two modes. It is caught on the
  // way down, before an editor reads the keys as its own shortcut.
  const toggleMode = useRef(() => {});
  useEffect(() => {
    toggleMode.current = () => switchMode(mode === "visual" ? "markdown" : "visual");
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        toggleMode.current();
      }
      // Cmd/Ctrl + P exports: printing the window itself shows the app, not the page.
      if (
        event.key.toLowerCase() === "p" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        setExporting(true);
      }
      // Cmd/Ctrl + F finds in the page, with Shift it searches the project.
      if (
        event.key.toLowerCase() === "f" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        const selected = window.getSelection()?.toString().trim() ?? "";
        const text = selected.includes("\n") ? "" : selected;
        if (event.shiftKey) setSearching(text);
        else openFind(text || undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // The find bar opens on request: from the keys, or from the search.
  useEffect(() => {
    const show = (event: Event) => {
      const { text, replace } = (
        event as CustomEvent<{ text?: string; replace?: boolean }>
      ).detail;
      setFinding((current) => ({
        text: text ?? current?.text ?? "",
        replace: Boolean(replace) || Boolean(current?.replace),
      }));
    };
    window.addEventListener("cursive:find", show);
    return () => window.removeEventListener("cursive:find", show);
  }, []);

  // The citation menu asks for the settings when Zotero isn't set up.
  useEffect(() => {
    const show = () => setSettings(true);
    window.addEventListener("cursive:settings", show);
    return () => window.removeEventListener("cursive:settings", show);
  }, []);

  const setFolderOpen = (path: string, isOpen: boolean) => {
    const next = new Set(closed);
    if (isOpen) next.delete(path);
    else next.add(path);
    setClosed(next);
    saveClosedFolders([...next]);
  };

  const newPage = (folder: string, file = "", title = "") => {
    const current = syncFileName();
    if (!current) return;
    const path = freePath(
      current,
      folder,
      title ? fileNameFor(title) : t("Untitled"),
      ".md",
    );
    commit({ ...current, pages: { ...current.pages, [path]: file } });
    setActive(path);
    setOpened((n) => n + 1);
    setMode("visual");
    saveOpenPage(path);
    if (folder) setFolderOpen(folder, true);
    setNavOpen(false);
    setStartSlide(0);
    void persist(store.writePage(path, file));
    // A page's title is typed on the page, a presentation's in the sidebar.
    if (file === NEW_PRESENTATION) setRenaming(path);
    else if (title) requestAnimationFrame(() => focusEditor.current?.());
    else requestAnimationFrame(() => titleInput.current?.focus());
  };

  /** Adds files to the project's attachments folder. Gives their paths, in the same order. */
  const addFiles = async (files: File[]): Promise<string[]> => {
    if (!store.writeFile) return [];
    const paths: string[] = [];
    for (const file of files) {
      const current = fresh.current;
      if (!current) break;
      // A pasted picture has no name of its own.
      const stamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " ")
        .replace(/:/g, ".");
      const name = /^image\.\w+$/i.test(file.name)
        ? `Pasted image ${stamp}${file.name.slice(file.name.lastIndexOf("."))}`
        : file.name || `File ${stamp}`;
      const path = freeFilePath(current, name);
      try {
        await store.writeFile(path, file);
      } catch (error) {
        setProblem(error instanceof Error ? error.message : String(error));
        continue;
      }
      const latest = fresh.current ?? current;
      commit({ ...latest, files: [...(latest.files ?? []), path].sort() });
      paths.push(path);
    }
    if (paths.length) {
      setFilesVersion((n) => n + 1);
      setProblem(null);
    }
    return paths;
  };

  const newFolder = () => {
    if (!project) return;
    const path = freePath(project, "", t("New folder"), "");
    commit({ ...project, folders: [...project.folders, path] });
    setRenaming(path);
    void persist(store.createFolder(path));
  };

  const renameFolder = (path: string, name: string) => {
    if (!project) return;
    const wanted = freePath(project, parentOf(path), fileNameFor(name), "", path);
    if (wanted === path) return;
    let renamed = renameIn(project, path, wanted);
    commit(renamed);
    for (const page of Object.keys(project.pages)) {
      if (page.startsWith(`${path}/`)) {
        renamed = relink(
          renamed,
          project.pages,
          page,
          wanted + page.slice(path.length),
        );
      }
    }
    if (linked.current?.path.startsWith(`${path}/`)) {
      linked.current = {
        ...linked.current,
        path: wanted + linked.current.path.slice(path.length),
      };
    }
    if (active?.startsWith(`${path}/`)) {
      const moved = wanted + active.slice(path.length);
      setActive(moved);
      saveOpenPage(moved);
    }
    void persist(store.rename(path, wanted));
  };

  /** Gives a page the title typed in the sidebar, and its file the name that goes with it. */
  const renamePage = (path: string, title: string) => {
    const file = project?.pages[path];
    if (!project || file === undefined) return;
    const page = readPage(file);
    if (title.trim() === page.title.trim()) return;
    const next = writePage({ ...page, title: title.trim() });
    const titled = { ...project, pages: { ...project.pages, [path]: next } };
    void persist(store.writePage(path, next));
    const wanted = title.trim()
      ? freePath(titled, parentOf(path), fileNameFor(title), ".md", path)
      : path;
    const renamed = wanted === path ? titled : renameIn(titled, path, wanted);
    commit(renamed);
    if (wanted !== path) void persist(store.rename(path, wanted));
    relink(renamed, project.pages, path, wanted);
    if (path === active) linked.current = { path: wanted, title: title.trim() };
    if (path !== active) return;
    setOpened((n) => n + 1);
    if (wanted !== path) {
      setActive(wanted);
      saveOpenPage(wanted);
    }
  };

  /**
   * Moves a page before or after another page, or to the end of a
   * folder. Its folder's pages get their places in their `order`
   * properties; a page that changes folder moves its file.
   */
  const movePage = (path: string, target: string, place: DropPlace) => {
    // The sidebar calls this when a drag ends, so it reads the latest project.
    const project = fresh.current;
    if (!project || !(path in project.pages) || path === target) return;
    const folder = place === "into" ? target : parentOf(target);
    const inFolder = (nodes: TreeNode[], dir: string): TreeNode[] => {
      if (!dir) return nodes;
      for (const node of nodes) {
        if (node.kind !== "folder") continue;
        if (node.path === dir) return node.children;
        if (dir.startsWith(`${node.path}/`)) return inFolder(node.children, dir);
      }
      return [];
    };
    const siblings = inFolder(buildTree(project), folder)
      .filter((node) => node.kind === "page" && node.path !== path)
      .map((node) => node.path);
    let next = project;
    let moved = path;
    if (parentOf(path) !== folder) {
      moved = freePath(project, folder, baseName(path).replace(/\.md$/i, ""), ".md");
      next = renameIn(project, path, moved);
      void persist(store.rename(path, moved));
      // Its images and links point where they did before.
      const page = readPage(next.pages[moved]);
      const markdown = rebaseLinks(page.markdown, parentOf(path), folder);
      if (markdown !== page.markdown) {
        const file = writePage({ ...page, markdown });
        next = { ...next, pages: { ...next.pages, [moved]: file } };
        void persist(store.writePage(moved, file));
      }
      next = relink(next, project.pages, path, moved);
      if (linked.current?.path === path)
        linked.current = { ...linked.current, path: moved };
      if (folder) setFolderOpen(folder, true);
      if (active === path) {
        setActive(moved);
        saveOpenPage(moved);
      }
    }
    const at = place === "into" ? siblings.length : siblings.indexOf(target);
    siblings.splice(place === "after" ? at + 1 : at, 0, moved);
    const writes = orderPages(next, siblings);
    commit({ ...next, pages: { ...next.pages, ...Object.fromEntries(writes) } });
    for (const [file, text] of writes) void persist(store.writePage(file, text));
  };

  const renameProject =
    onRenameProject &&
    (async (name: string) => {
      syncFileName();
      await onRenameProject(name);
      if (fresh.current) commit({ ...fresh.current, name });
    });

  const remove = (node: TreeNode) => {
    if (!project) return;
    const next = removeFrom(project, node.path);
    commit(next);
    if (active && !(active in next.pages)) {
      setStartSlide(0);
      setActive(firstPage(buildTree(next)));
      setOpened((n) => n + 1);
    }
    void persist(store.remove(node.path));
  };

  const deck = useDeck(page, active, update, startSlide);
  const isDeck = deck !== null;
  const latestUpdate = useRef(update);
  useEffect(() => {
    latestUpdate.current = update;
  });
  /**
   * A presentation keeps its references on one slide: a citation on
   * another slide adds its work there, or to a new last slide.
   */
  const addElsewhere = useMemo(
    () =>
      isDeck
        ? (ref: Reference) =>
            latestUpdate.current((current) => {
              const added = addToFence(current.markdown, ref);
              if (added !== null) return { ...current, markdown: added };
              const slides = readDeck(current.markdown);
              const last = {
                ...emptySlide(),
                body: toBibliographyFence(writeBibliography([ref])),
              };
              return { ...current, markdown: writeDeck([...slides, last]) };
            })
        : undefined,
    [isDeck],
  );
  const title = page?.title.trim() ?? "";
  useEffect(() => {
    document.title = title ? `${title} · Cursive` : "Cursive";
  }, [title]);

  const pages = project?.pages;
  const files = project?.files;
  const pageList = useMemo(
    () => linkablePages({ name: "", folders: [], pages: pages ?? {} }),
    [pages],
  );
  const index = useMemo(() => linkIndex(pages ?? {}), [pages]);
  const linkedFrom = useMemo(
    () => (pages && active && !isDeck ? backlinks(pages, active) : []),
    [pages, active, isDeck],
  );
  const fileSet = useMemo(() => new Set(files ?? []), [files]);
  const latestActions = useRef({ open, newPage, addFiles });
  useEffect(() => {
    latestActions.current = { open, newPage, addFiles };
  });
  const fileUrl = useMemo(
    () => (path: string) => store.fileUrl?.(path) ?? Promise.resolve(null),
    [store],
  );
  const workspace = useMemo<Workspace>(
    () => ({
      pages: pageList,
      index,
      active,
      openPage: (path) => latestActions.current.open(path),
      createPage: (title) =>
        latestActions.current.newPage(
          active ? parentOf(active) : "",
          writePage({ title, properties: "", markdown: "" }),
          title,
        ),
      files: fileSet,
      filesVersion,
      fileUrl,
      openFile: (path) => {
        void store
          .openFile?.(path)
          .catch((error: unknown) =>
            setProblem(error instanceof Error ? error.message : String(error)),
          );
      },
      addFiles: (added) => latestActions.current.addFiles(added),
      canAddFiles: Boolean(store.writeFile),
    }),
    [pageList, index, active, fileSet, filesVersion, fileUrl, store],
  );

  // ---------- the assistant ----------
  const assistantSettings = useSyncExternalStore(subscribeAssistant, assistantSnapshot);
  const signedIn = Boolean(assistant);
  const ours = sourceOf(assistantSettings, signedIn) === "scholarkit";
  const [chat] = useState(
    () => new CursiveChat({ papers: signedIn, lookUp: signedIn }),
  );
  const chatState = useChat(chat);

  /** Changes a page's Markdown, also the one open now, as a change from elsewhere would. */
  const changePage = (path: string, change: (markdown: string) => string) => {
    const latest = fresh.current;
    const source = latest?.pages[path];
    if (!latest || source === undefined) throw new Error(t("The page is gone."));
    const page = readPage(source);
    const markdown = change(page.markdown);
    const file = writePage({ ...page, markdown });
    if (file === source) return;
    commit({ ...latest, pages: { ...latest.pages, [path]: file } });
    void persist(store.writePage(path, file));
    if (path !== active) return;
    if (mode === "visual" && pageEditor.current && !isDeck)
      mergeMarkdown(pageEditor.current, markdown);
    setRemote((n) => n + 1);
  };

  /** Cites a paper in the open page: after the selection the question was about, or at the caret. */
  const citePaper = async (paper: FoundPaper, selection: Selection | null) => {
    const editor = pageEditor.current;
    if (mode !== "visual" || isDeck || !editor || editor.isDestroyed)
      throw new Error(t("Open the page in Visual to cite in it."));
    const refs = pageReferences(page?.markdown ?? "");
    const details = await paperDetails(paper);
    const doi = details.doi.toLowerCase();
    const ref =
      (doi && refs.find((other) => other.doi.toLowerCase() === doi)) ||
      foundWork(
        details,
        refs.map((other) => other.key),
      );
    const size = editor.state.doc.content.size;
    let at = Math.min(
      selection && selection.path === active ? selection.to : editor.state.selection.to,
      size - 1,
    );
    const doc = editor.state.doc;
    // Before the full stop that ends the claim, as citations go.
    if (at > 1 && /[.,;:!?]/.test(doc.textBetween(at - 1, at))) at -= 1;
    const before = at > 1 ? doc.textBetween(at - 1, at) : " ";
    editor
      .chain()
      .insertContentAt(at, [
        ...(/\s/.test(before) ? [] : [{ type: "text", text: " " }]),
        { type: "citation", attrs: { items: [{ key: ref.key, locator: "" }] } },
      ])
      .run();
    addReference(editor, ref);
  };

  const host: ChatHost = {
    pages: () => fresh.current?.pages ?? {},
    searchPapers: (q) => {
      const search = paperSearch();
      if (!search)
        throw new Error(t("Sign in to your Scholarkit account to find papers."));
      return search.search(q);
    },
    lookUp: (kind, id) => lookUp({ kind, id }, []),
    send: () =>
      ours
        ? (assistant?.turn ?? null)
        : ownReady(assistantSettings)
          ? ownTurn(assistantSettings)
          : null,
    ours: () => ours,
    openPage: () =>
      active && page
        ? { path: active, title: page.title.trim() || t("Untitled") }
        : null,
    applyEdit: async (card) =>
      changePage(card.path, (markdown) =>
        markdown === card.before ? card.after : replaceIn(markdown, card.replacements),
      ),
    fixReference: async (card) =>
      changePage(card.path, (markdown) => {
        const fixed = addToFence(markdown, card.fixed);
        if (fixed === null) throw new Error(t("This page has no reference list."));
        return fixed;
      }),
    cite: citePaper,
    usage: assistant?.usage,
  };
  // The tools reach the project as it is now.
  useEffect(() => {
    chat.setHost(host);
  });

  /** The selection in the open page, with where the Ask menu goes; null without one. */
  const readSelection: ReadSelection = () => {
    const editor = pageEditor.current;
    if (!active || mode !== "visual" || isDeck || !editor || editor.isDestroyed)
      return null;
    const { from, to, empty } = editor.state.selection;
    if (empty) return null;
    const text = editor.state.doc.textBetween(from, to, "\n").trim();
    if (text.length < 2) return null;
    const end = editor.view.coordsAtPos(to);
    return {
      selection: { path: active, text, from, to },
      anchor: { left: end.left, top: end.bottom + 8 },
    };
  };
  const askAbout = () => {
    const selected = readSelection();
    if (selected) chat.openMenu(selected.selection, selected.anchor);
  };

  const docked = assistantSettings.layout === "docked";
  const assistantProps: AssistantProps = {
    chat,
    openPage: active && page ? { path: active, title: page.title.trim() } : null,
    source: sourceInfo(
      assistantSettings,
      signedIn,
      chatState.usage,
      ownReady(assistantSettings),
    ),
    onOpenQuote: (card) => {
      if (card.path !== active) open(card.path);
      requestAnimationFrame(() => openFind(card.quote));
    },
    onSettings: () => setSettings(true),
    onLayout: (layout) => saveAssistant({ ...assistantSettings, layout }),
  };
  const askButton = (
    <AskAssistantButton chat={chat} docked={docked} readSelection={readSelection} />
  );

  if (!project) {
    return (
      <AppLoading
        mark={<Mark className="size-[22px]" />}
        failed={Boolean(problem)}
        status={
          problem
            ? t("This project can't be opened: {problem}", { problem })
            : t("Opening your project…")
        }
      >
        {problem && onSwitchProject && (
          <button
            type="button"
            onClick={onSwitchProject}
            className="h-8 rounded-md border bg-background px-3 text-[13px] font-medium hover:bg-muted"
          >
            {switchLabel}
          </button>
        )}
      </AppLoading>
    );
  }

  const shell = (
    <div
      className={cn(
        "app",
        navOpen && "nav-open",
        docked && chatState.dockShown && "has-dock",
      )}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <Sidebar
        projectName={project.name}
        onRenameProject={renameProject}
        decks={decks}
        slide={deck?.index}
        onOpenSlide={(path, index) => {
          if (path === active) deck?.select(index);
          open(path, index);
        }}
        onNewSlide={deck?.add}
        onDeleteSlide={deck?.remove}
        onMoveSlide={deck?.move}
        onNewPresentation={(folder) => newPage(folder, NEW_PRESENTATION)}
        onMovePage={movePage}
        width={sidebarWidth}
        onResize={(width) => {
          setSidebarWidth(width);
          saveSidebarWidth(width);
        }}
        tree={tree}
        active={active}
        closed={closed}
        renaming={renaming}
        onOpen={open}
        onToggle={(path) => setFolderOpen(path, closed.has(path))}
        onNewPage={newPage}
        onNewFolder={newFolder}
        onRename={setRenaming}
        onRenamed={(node, name) =>
          node.kind === "folder"
            ? renameFolder(node.path, name)
            : renamePage(node.path, name)
        }
        onDelete={setDeleting}
        onSwitchProject={onSwitchProject}
        switchLabel={switchLabel}
        homeHref={homeHref}
        onSearch={() => setSearching("")}
        onSettings={() => {
          setNavOpen(false);
          setSettings(true);
        }}
      />
      <div className="scrim" onClick={() => setNavOpen(false)} />

      <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] bg-card shadow-[0_1px_2px_oklch(14.5%_0.008_326/5%),0_0_0_1px_var(--border)]">
        <header
          className="flex h-11 flex-none items-center gap-2 px-3 text-xs"
          onPointerDown={dragWindow}
        >
          <button
            type="button"
            className="menu-button"
            aria-label={t("Show the sidebar")}
            onClick={() => setNavOpen(true)}
          >
            <PanelLeft className="size-4" aria-hidden />
          </button>
          <nav
            aria-label={t("Breadcrumb")}
            className="flex min-w-0 flex-1 items-center gap-1.5"
          >
            {active &&
              ancestorsOf(active).map((folder) => (
                <span key={folder} className="crumb-folder contents">
                  <span className="truncate text-muted-foreground">
                    {baseName(folder)}
                  </span>
                  <span className="text-muted-foreground/60">/</span>
                </span>
              ))}
            <span className="truncate">{page ? title || t("Untitled") : ""}</span>
          </nav>
          {page && (
            <div
              role="group"
              aria-label={t("Editor mode")}
              className="inline-flex flex-none gap-0.5 rounded-[7px] bg-muted p-0.5"
            >
              {MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={mode === item.id}
                  title={t("{hint} (Cmd/Ctrl + /)", { hint: item.hint })}
                  onClick={() => switchMode(item.id)}
                  className={cn(
                    "h-6 rounded-[5px] px-2.5 text-xs font-medium",
                    mode === item.id
                      ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0_0_0/8%),0_0_0_1px_var(--border)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          {deck && (
            <button
              type="button"
              onClick={() => deck.present(true)}
              className="inline-flex h-7 flex-none items-center gap-1.5 rounded-md border border-primary-edge bg-primary-fill px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary-fill/85"
            >
              <Play className="size-3.5" aria-hidden />
              <span className="present-label">{t("Present")}</span>
            </button>
          )}
          {page && store.history && (
            <button
              type="button"
              className="inline-flex size-6 flex-none items-center justify-center rounded-[5px] text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("History")}
              title={t("History")}
              onClick={() => setShowHistory(true)}
            >
              <History className="size-3.5" aria-hidden />
            </button>
          )}
          {page && (
            <button
              type="button"
              className={HEADER_BUTTON}
              title={t("Export (Cmd/Ctrl + P)")}
              onClick={() => setExporting(true)}
            >
              {t("Export")}
            </button>
          )}
          <Faces
            people={people}
            here={active}
            nameOf={pageName}
            onOpen={(person) => person.where && open(person.where)}
          />
          {typeof actions === "function" ? (
            actions(askButton)
          ) : (
            <>
              {askButton}
              {actions}
            </>
          )}
        </header>

        {finding && page && (
          <FindBar
            text={finding.text}
            replacing={finding.replace}
            onClose={() => setFinding(null)}
          />
        )}
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          id="page-scroll"
          // A click under the last block puts the caret on the last line.
          onMouseDown={(event) => {
            const target = event.target as HTMLElement;
            if (event.button !== 0 || mode !== "visual" || deck) return;
            if (target !== event.currentTarget && !target.classList.contains("page"))
              return;
            const doc = event.currentTarget.querySelector(".doc");
            if (!doc || event.clientY < doc.getBoundingClientRect().bottom) return;
            event.preventDefault();
            focusEditorEnd.current?.();
          }}
        >
          {!page ? (
            <div className="grid h-full place-items-center">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {t("This project is empty.")}
                </p>
                <button
                  type="button"
                  onClick={() => newPage("")}
                  className="mt-3 h-8 rounded-md border border-primary-edge bg-primary-fill px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary-fill/85"
                >
                  {t("Add note")}
                </button>
              </div>
            </div>
          ) : deck && mode === "visual" ? (
            <SlideStage deck={deck} opened={opened} />
          ) : mode === "visual" ? (
            <article className="page" key={opened}>
              <input
                ref={titleInput}
                className="page-title"
                value={page.title}
                placeholder={t("Untitled")}
                aria-label={t("Page title")}
                onChange={(event) => {
                  const title = event.target.value;
                  update((current) => ({ ...current, title }));
                }}
                onBlur={() => void syncFileName()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "ArrowDown") {
                    event.preventDefault();
                    focusEditor.current?.();
                  }
                }}
              />
              <PageProperties
                raw={page.properties}
                onChange={(properties) =>
                  update((current) => ({ ...current, properties }))
                }
              />
              <Editor
                markdown={page.markdown}
                onChange={(change: EditorChange) =>
                  update((current) => ({ ...current, markdown: change.markdown }))
                }
                focusRef={focusEditor}
                focusEndRef={focusEditorEnd}
                editorRef={pageEditor}
                remote={remote}
                others={others}
                onSelection={presence ? shareSelection : undefined}
                onAsk={askAbout}
              />
              <Backlinks links={linkedFrom} />
            </article>
          ) : (
            <MarkdownEditor
              key={opened}
              source={source ?? ""}
              onChange={(file) => update(readPage(file))}
              remote={remote}
              others={sourceOthers}
              onSelection={presence ? shareSourceSelection : undefined}
            />
          )}
        </div>

        <footer className="flex h-7 flex-none items-center gap-3.5 border-t px-3.5 text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
          <span className="inline-flex min-w-0 items-center gap-1.5" role="status">
            <span
              aria-hidden
              className={`size-1.5 flex-none rounded-full ${problem || status?.warn || live?.tone === "warn" ? "bg-warning" : "bg-success"}`}
            />
            <span className="truncate">
              {problem
                ? t("Not saved. {problem}", { problem })
                : status?.warn
                  ? status.text
                  : (live?.text ?? status?.text ?? SAVED[store.place])}
            </span>
          </span>
          {active && <span className="path truncate font-mono">{active}</span>}
          <span className="flex-1" />
          {deck && (
            <span>
              {t("Slide {number} of {total}", {
                number: deck.index + 1,
                total: deck.slides.length,
              })}
            </span>
          )}
          {page && !deck && (
            <span>
              {tn(words, "{count} word", "{count} words", {
                count: formatNumber(words),
              })}
            </span>
          )}
        </footer>
        {!docked && <AssistantFloatingLayer {...assistantProps} />}
      </main>
      {docked && <AssistantDock {...assistantProps} papers={signedIn} />}
      <AssistantMenuLayer
        chat={chat}
        docked={docked}
        papers={signedIn}
        lookUp={signedIn}
        onAsked={() => {
          const editor = pageEditor.current;
          if (editor && !editor.isDestroyed)
            editor.commands.setTextSelection(editor.state.selection.to);
        }}
      />

      {deck?.presenting && <Presenter deck={deck} />}
      {exporting && (
        <ExportDialog
          project={project}
          active={active}
          presentation={deck !== null}
          onClose={() => setExporting(false)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t("Delete “{label}”?", { label: deleting.label })}
          body={deleteQuestion(deleting, store.place)}
          confirmLabel={t("Delete")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            remove(deleting);
            setDeleting(null);
          }}
        />
      )}
      {settings && (
        <SettingsDialog account={signedIn} onClose={() => setSettings(false)} />
      )}
      {showHistory && active && source !== null && store.history && (
        <HistoryDialog
          title={page?.title.trim() || t("Untitled")}
          path={active}
          source={source}
          history={store.history}
          hourly={store.place === "account"}
          onRestore={restoreSnapshot}
          onClose={() => setShowHistory(false)}
        />
      )}
      {searching !== null && (
        <SearchDialog
          pages={project.pages}
          initial={searching}
          onClose={() => setSearching(null)}
          onOpen={(path, query) => {
            setSearching(null);
            if (path !== active) open(path);
            // The page opens first, then the find bar marks the query in it.
            requestAnimationFrame(() => openFind(query));
          }}
        />
      )}
    </div>
  );

  return (
    <WorkspaceProvider value={workspace}>
      <ReferencesProvider
        markdown={page?.markdown ?? ""}
        style={page ? styleOfProperties(page.properties).id : undefined}
        setStyle={setStyle}
        page={active}
        live
        addElsewhere={addElsewhere}
      >
        {shell}
      </ReferencesProvider>
    </WorkspaceProvider>
  );
}
