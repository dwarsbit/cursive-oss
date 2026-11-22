import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BUTTON,
  Dialog,
  messageOf,
  PRIMARY_BUTTON,
  QUIET_BUTTON,
} from "@scholarkit/editor/components/Dialog";
import { cn } from "@scholarkit/editor/lib/cn";
import { isDesktop } from "@/lib/desktop-store";
import {
  loadExportFormat,
  loadExportPaper,
  saveExportFormat,
  saveExportPaper,
} from "@/lib/prefs";
import type { Project } from "@/lib/project";
import {
  buildJob,
  countSlides,
  defaultPaper,
  fileName,
  FORMATS,
  isFormat,
  isPaper,
  PAPERS,
  sheetOf,
  type ExportJob,
  type Format,
  type Paper,
  type Scope,
} from "./job";
import { pdfPageStyle, savePdf } from "./pdf";
import { PrintView } from "./PrintView";
import { revealExport, saveExport, type ExportFile } from "./save";
import { t } from "@scholarkit/i18n";

/** Opens the system's print window, where the reader saves the PDF. */
const print = (): Promise<void> =>
  isDesktop
    ? invoke<void>("print_window")
    : new Promise((resolve) => {
        window.print();
        resolve();
      });

const HINTS: Record<Format, string> = {
  pdf: t("Pages as they print, with references and numbered figures."),
  pptx: t(
    "One slide for each slide, with text you can edit and the speaker notes in PowerPoint’s notes.",
  ),
  docx: t(
    "Text you can edit, with headings, lists, tables, images, footnotes and the reference list.",
  ),
  html: t("One file that opens in any browser, with the images inside it."),
};

const plural = (count: number, one: string, many: string) =>
  count === 1 ? `1 ${one}` : `${count} ${many}`;

/** The file an export makes, from the pages it drew. */
async function makeFile(
  format: Format,
  root: HTMLElement,
  job: ExportJob,
): Promise<ExportFile> {
  const name = fileName(job.name);
  if (format === "docx") {
    const { makeDocx } = await import("./docx");
    return { name, extension: "docx", bytes: await makeDocx(root, job) };
  }
  if (format === "html") {
    const { makeHtml } = await import("./html");
    return {
      name,
      extension: "html",
      bytes: new TextEncoder().encode(await makeHtml(root, job)),
    };
  }
  const { makePptx } = await import("./pptx");
  const files = await makePptx(root, job);
  if (files.length === 1) {
    return { name: fileName(files[0].name), extension: "pptx", bytes: files[0].bytes };
  }
  // Several presentations: one .pptx each, in a .zip.
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const taken = new Set<string>();
  for (const file of files) {
    let entry = `${fileName(file.name)}.pptx`;
    for (let n = 2; taken.has(entry.toLowerCase()); n++) {
      entry = `${fileName(file.name)} ${n}.pptx`;
    }
    taken.add(entry.toLowerCase());
    zip.file(entry, file.bytes);
  }
  return {
    name,
    extension: "zip",
    bytes: await zip.generateAsync({ type: "uint8array" }),
  };
}

type Phase = "choose" | "preparing" | "making" | "open" | "saved";

/** A PDF goes to a file, or to the print window for paper. */
type PdfMode = "save" | "print";

/** A row of buttons that pick one of a few, like a segmented control. */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="mt-1.5 inline-flex gap-0.5 rounded-[7px] bg-muted p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "inline-flex h-6 items-center rounded-[5px] px-2.5 text-xs font-medium",
            value === option.id
              ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0_0_0/8%),0_0_0_1px_var(--border)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Exports the open page, or the whole project, as PDF, PowerPoint, Word
 * or HTML. The pages are drawn out of sight, as the PDF prints them. The
 * PDF is saved as a file (see pdf.ts), or goes to the system's print
 * window for paper; the other formats are made from those pages and saved
 * as a file.
 */
export function ExportDialog({
  project,
  active,
  presentation,
  onClose,
}: {
  project: Project;
  /** The open page's path. */
  active: string | null;
  /** The open page is a presentation. */
  presentation: boolean;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<Format>(() => {
    const saved = loadExportFormat();
    return isFormat(saved) ? saved : "pdf";
  });
  const [paper, setPaper] = useState<Paper>(() => {
    const saved = loadExportPaper();
    return isPaper(saved) ? saved : defaultPaper(navigator.language);
  });
  const [mode, setMode] = useState<PdfMode>("save");
  const [scope, setScope] = useState<Scope>(active ? "page" : "project");
  const [notes, setNotes] = useState(false);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [phase, setPhase] = useState<Phase>("choose");
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const pages = Object.keys(project.pages).length;
  const decks = useMemo(
    () => countSlides(project, active, scope),
    [project, active, scope],
  );
  const allDecks = useMemo(
    () => countSlides(project, active, "project"),
    [project, active],
  );
  const noSlides = format === "pptx" && decks === 0;
  const extension = FORMATS.find((entry) => entry.id === format)?.extension ?? format;

  // The PDF is named after what it holds: the print window suggests the window's title.
  const title = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (title.current !== null) document.title = title.current;
    },
    [],
  );

  // A print window that says when it closes ends the export.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (phase !== "open") return;
    const done = () => close.current();
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, [phase]);

  const pick = (next: Format) => {
    setFormat(next);
    saveExportFormat(next);
    setProblem(null);
  };

  const start = (pdfMode: PdfMode = "save") => {
    const next = buildJob(project, active, {
      scope,
      notes: decks > 0 && notes,
      format,
    });
    if (!next) return;
    setMode(pdfMode);
    setProblem(null);
    setJob(next);
    setPhase("preparing");
  };

  const fail = (error: unknown) => {
    setProblem(
      format !== "pdf"
        ? t("Cursive couldn’t make the file: {error}", {
            error: messageOf(error),
          })
        : mode === "print"
          ? t("The print window couldn’t be opened: {error}", {
              error: messageOf(error),
            })
          : messageOf(error),
    );
    setPhase("choose");
    setJob(null);
  };

  const ready = (root: HTMLElement) => {
    if (!job || phase !== "preparing") return;
    if (format === "pdf" && mode === "print") {
      title.current ??= document.title;
      document.title = job.name;
      setPhase("open");
      print().catch(fail);
      return;
    }
    setPhase("making");
    (format === "pdf"
      ? savePdf(root, job, sheetOf(job.format, paper))
      : makeFile(format, root, job).then(saveExport)
    )
      .then((name) => {
        setJob(null);
        if (name === null) {
          setPhase("choose");
          return;
        }
        setSaved(name);
        setPhase("saved");
      })
      .catch(fail);
  };

  const options: Array<{ id: Scope; label: string; count: string }> = [
    ...(active
      ? [
          {
            id: "page" as const,
            label: presentation ? t("This presentation") : t("This page"),
            count: "",
          },
        ]
      : []),
    {
      id: "project",
      label: t("The whole project"),
      count:
        format === "pptx"
          ? plural(allDecks, "presentation", "presentations")
          : plural(pages, "page", "pages"),
    },
  ];

  const preview = useMemo(
    () => buildJob(project, active, { scope, notes: decks > 0 && notes, format }),
    [project, active, scope, notes, decks, format],
  );
  const named = preview?.name ?? project.name;
  // Slides print at their own size; pages need a paper size when no print window asks for one.
  const onPaper = format === "pdf" && preview?.format === "paper";
  const target =
    format === "pptx" && decks > 1
      ? t("{file}, with a PowerPoint file for each presentation", {
          file: `${fileName(project.name)}.zip`,
        })
      : `${fileName(named)}.${extension}`;

  const busy = phase === "preparing" || phase === "making";

  return (
    <Dialog title={t("Export")} onClose={onClose}>
      <div className="dialog-wide">
        {phase === "choose" || busy ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) start();
            }}
          >
            <fieldset className="mt-3" disabled={busy}>
              <legend className="text-xs text-muted-foreground">{t("Format")}</legend>
              <Segmented
                label={t("Format")}
                options={FORMATS}
                value={format}
                onChange={pick}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">{HINTS[format]}</p>
            </fieldset>

            <fieldset className="mt-4" disabled={busy}>
              <legend className="text-xs text-muted-foreground">
                {t("What to export")}
              </legend>
              <div className="mt-1">
                {options.map((option) => (
                  <label
                    key={option.id}
                    className="flex h-7 items-center gap-2 text-[13px]"
                  >
                    <input
                      type="radio"
                      name="export-scope"
                      className="size-3.5 accent-[var(--tint)]"
                      checked={scope === option.id}
                      onChange={() => {
                        setScope(option.id);
                        setProblem(null);
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {option.count}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {onPaper && (
              <fieldset className="mt-4" disabled={busy}>
                <legend className="text-xs text-muted-foreground">
                  {t("Paper size")}
                </legend>
                <Segmented
                  label={t("Paper size")}
                  options={PAPERS}
                  value={paper}
                  onChange={(next) => {
                    setPaper(next);
                    saveExportPaper(next);
                  }}
                />
              </fieldset>
            )}

            {decks > 0 && format !== "pptx" && (
              <label className="mt-3 flex items-start gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="mt-0.5 size-3.5 accent-[var(--tint)]"
                  checked={notes}
                  disabled={busy}
                  onChange={(event) => setNotes(event.target.checked)}
                />
                <span>
                  {t("With speaker notes")}
                  <span className="block text-xs text-muted-foreground">
                    {format === "pdf" && scope === "page"
                      ? t(
                          "Without notes, each slide is one page. With notes, the slides go on paper with their notes under them.",
                        )
                      : t("The notes go under each slide.")}
                  </span>
                </span>
              </label>
            )}

            <p
              className={cn(
                "mt-3 min-h-4 text-xs",
                problem ? "text-destructive" : "text-muted-foreground",
              )}
              role={problem ? "alert" : "status"}
            >
              {problem ??
                (phase === "preparing"
                  ? t("Preparing the pages…")
                  : phase === "making"
                    ? t("Making the file…")
                    : noSlides
                      ? t("This page has no slides. PowerPoint takes a presentation.")
                      : target)}
            </p>

            <div className="mt-3 flex items-center gap-2">
              {format === "pdf" && (
                <button
                  type="button"
                  className={QUIET_BUTTON}
                  disabled={busy}
                  title={t("Print on paper, or save from the print window")}
                  onClick={() => start("print")}
                >
                  {t("Print…")}
                </button>
              )}
              <span className="flex-1" />
              <button type="button" className={QUIET_BUTTON} onClick={onClose}>
                {t("Cancel")}
              </button>
              <button
                type="submit"
                className={PRIMARY_BUTTON}
                disabled={busy || noSlides}
              >
                {isDesktop ? t("Save…") : t("Download")}
              </button>
            </div>
          </form>
        ) : phase === "open" ? (
          <>
            <p className="mt-3 text-[13px] text-muted-foreground" role="status">
              {t("Print the pages in the print window, or choose “Save as PDF” there.")}
            </p>
            <div className="mt-4 flex justify-end">
              <button type="button" className={BUTTON} onClick={onClose}>
                {t("Done")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-[13px]" role="status">
              {isDesktop
                ? t("Saved {file}.", { file: saved ?? "" })
                : t("Downloaded {file}.", { file: saved ?? "" })}
            </p>
            {problem && (
              <p className="mt-2 text-xs text-destructive" role="alert">
                {problem}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              {isDesktop && (
                <button
                  type="button"
                  className={QUIET_BUTTON}
                  onClick={() =>
                    revealExport().catch((error: unknown) =>
                      setProblem(messageOf(error)),
                    )
                  }
                >
                  {t("Show in folder")}
                </button>
              )}
              <button type="button" className={BUTTON} onClick={onClose}>
                {t("Done")}
              </button>
            </div>
          </>
        )}
      </div>
      {job && (
        <PrintView
          job={job}
          pageStyle={
            format === "pdf" && mode === "save"
              ? pdfPageStyle(sheetOf(job.format, paper))
              : undefined
          }
          onReady={ready}
        />
      )}
    </Dialog>
  );
}
