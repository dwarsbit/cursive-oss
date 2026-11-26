import { useEffect, useState } from "react";
import {
  BUTTON,
  Dialog,
  messageOf,
  PRIMARY_BUTTON,
  QUIET_BUTTON,
} from "@scholarkit/editor/components/Dialog";
import { LearnersDialog } from "./LearnersDialog";
import { cn } from "@scholarkit/editor/lib/cn";
import type { SaveFile, Server, SiteState } from "@/lib/server";
import {
  SITE_THEMES,
  siteThemeOf,
  type SiteTheme,
  type SiteThemeInfo,
} from "@/lib/site-themes";
import { t, tn } from "@scholarkit/i18n";

/** An address as people say it: without the scheme. */
const shortUrl = (url: string) => url.replace(/^https?:\/\//, "");

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** A theme in the picker: a small sample of its colors and type, then its name. */
/**
 * A theme in the picker: a small sample of its colors and type, then its name. A theme the
 * owner's plan doesn't give is locked, with a Plus badge, or Current when the site still has it.
 */
function ThemeOption({
  theme,
  checked,
  locked,
  current,
  onPick,
}: {
  theme: SiteThemeInfo;
  checked: boolean;
  locked: boolean;
  /** The published site has this theme. */
  current: boolean;
  onPick: () => void;
}) {
  return (
    <label
      className={cn(
        "relative flex flex-col gap-1.5 rounded-md border p-1.5 has-[:focus-visible]:border-ring",
        locked ? "cursor-default" : "cursor-pointer",
        checked ? "border-tint-edge bg-tint-soft" : !locked && "hover:bg-muted",
      )}
    >
      <input
        type="radio"
        name="site-theme"
        className="sr-only"
        checked={checked}
        disabled={locked}
        onChange={onPick}
      />
      {locked && (
        <span
          className={cn(
            "absolute top-2.5 right-2.5 rounded-sm border bg-background px-1 text-[10px] leading-4 font-semibold",
            current ? "text-foreground" : "border-tint-edge text-tint-foreground",
          )}
        >
          {current ? t("Current") : "Plus"}
        </span>
      )}
      <span
        aria-hidden="true"
        className={cn(
          "flex h-12 flex-col justify-between rounded-sm border p-1.5",
          locked && "opacity-45",
        )}
        style={{ background: theme.ground, color: theme.ink }}
      >
        <span
          className="text-[13px] leading-none"
          style={{ fontFamily: theme.font, fontWeight: theme.weight }}
        >
          {t("Aa")}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="h-1.5 w-6"
            style={{
              background: theme.accent,
              borderRadius: theme.radius,
              outline: theme.outline ? `1px solid ${theme.outline}` : undefined,
            }}
          />
          <span
            className="h-px flex-1"
            style={{ background: theme.ink, opacity: 0.35 }}
          />
        </span>
      </span>
      <span className={cn("px-0.5", locked && "opacity-45")}>
        <span className="block text-xs font-medium">{theme.name}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">
          {theme.hint}
        </span>
      </span>
    </label>
  );
}

function PlansLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="font-medium text-foreground underline underline-offset-2"
      onClick={onClick}
    >
      {t("See plans")}
    </button>
  );
}

/**
 * Publishes the project as a site, and takes it down again. The server
 * makes the site from the pages it has, so `prepare` first sends what
 * the desktop app still has to send.
 */
export function PublishDialog({
  server,
  projectId,
  prepare,
  openUrl,
  openAccount,
  openPlans,
  saveFile,
  onClose,
}: {
  server: Server;
  projectId: string;
  prepare?: () => Promise<void>;
  openUrl: (url: string) => void;
  /** Opens the account page, where the username is changed. */
  openAccount: () => void;
  /** Opens the plans on the account page. */
  openPlans: () => void;
  saveFile: SaveFile;
  onClose: () => void;
}) {
  const [state, setState] = useState<SiteState | null>(null);
  const [slug, setSlug] = useState("");
  const [theme, setTheme] = useState<SiteTheme>("default");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [learners, setLearners] = useState(false);

  useEffect(() => {
    let current = true;
    server.site(projectId).then(
      (loaded) => {
        if (!current) return;
        setState(loaded);
        setSlug(loaded.site?.slug ?? loaded.suggestedSlug);
        // A theme kept from an earlier plan can't be picked again: the next publish gives the default one.
        const kept = siteThemeOf(loaded.site?.theme);
        setTheme(!loaded.themes || loaded.themes.includes(kept) ? kept : "default");
      },
      (error: unknown) => current && setProblem(messageOf(error)),
    );
    return () => {
      current = false;
    };
  }, [server, projectId]);

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

  const publish = () =>
    run(async () => {
      await prepare?.();
      const site = await server.publish(projectId, slug.trim().toLowerCase(), theme);
      // The first publish saves the username the dialog proposed.
      setState((known) => known && { ...known, site, usernameSaved: true });
      setSlug(site.slug);
    });

  const unpublish = () =>
    run(async () => {
      await server.unpublish(projectId);
      setState((known) => known && { ...known, site: null });
    });

  const site = state?.site ?? null;
  const allowed = (id: SiteTheme) => !state?.themes || state.themes.includes(id);
  const siteTheme = site ? siteThemeOf(site.theme) : null;
  const keptName =
    siteTheme && !allowed(siteTheme)
      ? SITE_THEMES.find((option) => option.id === siteTheme)?.name
      : undefined;

  if (learners) {
    return (
      <LearnersDialog
        server={server}
        projectId={projectId}
        saveFile={saveFile}
        onClose={() => setLearners(false)}
      />
    );
  }

  return (
    <Dialog title={t("Publish this project")} onClose={onClose}>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        {t(
          "Your pages become a site that anyone with the address can read. Publish again to bring the site up to date. Pages with a quiz or an assignment make it a tutorial: readers check their answers and track their progress.",
        )}
      </p>

      {state && (
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void publish();
          }}
        >
          <label htmlFor="site-slug" className="text-xs font-medium">
            {t("Address")}
          </label>
          <div className="mt-1 flex h-8 items-center rounded-md border bg-background text-[13px] focus-within:border-ring">
            <span className="truncate pl-2 text-muted-foreground">{state.baseUrl}</span>
            <input
              id="site-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              spellCheck={false}
              autoCapitalize="none"
              className="h-full min-w-24 flex-1 bg-transparent pr-2 outline-none"
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("3 to 40 lowercase letters, digits and hyphens.")}
          </p>
          {state.username && (
            <p className="mt-1 text-xs text-muted-foreground">
              {state.usernameSaved
                ? t("Your sites are listed on {page}.", {
                    page: shortUrl(state.ownerPageUrl ?? state.baseUrl),
                  })
                : t(
                    "We made the username @{username} from your name. Your sites will be listed on {page}.",
                    {
                      username: state.username,
                      page: shortUrl(state.ownerPageUrl ?? state.baseUrl),
                    },
                  )}{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-2"
                onClick={openAccount}
              >
                {t("Change username")}
              </button>
            </p>
          )}

          <fieldset className="mt-3">
            <legend className="text-xs font-medium">{t("Theme")}</legend>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {SITE_THEMES.map((option) => (
                <ThemeOption
                  key={option.id}
                  theme={option}
                  checked={theme === option.id}
                  locked={!allowed(option.id)}
                  current={siteTheme === option.id}
                  onPick={() => setTheme(option.id)}
                />
              ))}
            </div>
            {keptName ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "The site keeps the {theme} theme until you publish again. On Free, publishing again gives it the Cursive theme.",
                  { theme: keptName },
                )}{" "}
                <PlansLink onClick={openPlans} />
              </p>
            ) : (
              site &&
              siteTheme !== theme && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("Publish again to give the site this theme.")}
                </p>
              )
            )}
            {!keptName && SITE_THEMES.some((option) => !allowed(option.id)) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Plus and Pro have every theme.")} <PlansLink onClick={openPlans} />
              </p>
            )}
          </fieldset>
        </form>
      )}

      {site && (
        <p className="mt-3 text-[13px]">
          <button
            type="button"
            className="font-medium text-primary underline underline-offset-2"
            onClick={() => openUrl(site.url)}
          >
            {shortUrl(site.url)}
          </button>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {tn(
              site.pages,
              "Published {day} · {count} page",
              "Published {day} · {count} pages",
              {
                day: day(site.publishedAt),
              },
            )}
          </span>
        </p>
      )}

      {!state && !problem && (
        <p className="mt-3 text-[13px] text-muted-foreground" role="status">
          {t("Loading…")}
        </p>
      )}
      {problem && (
        <p className="mt-3 text-[13px] text-destructive" role="alert">
          {problem}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        {site && (
          <button
            type="button"
            className={QUIET_BUTTON}
            disabled={busy}
            onClick={() => void unpublish()}
          >
            {t("Unpublish")}
          </button>
        )}
        {site && (
          <button
            type="button"
            className={QUIET_BUTTON}
            title={t(
              "Readers who signed in to your tutorial, and the work they handed in",
            )}
            onClick={() => setLearners(true)}
          >
            {t("Learners")}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className={BUTTON} onClick={onClose}>
          {t("Close")}
        </button>
        <button
          type="button"
          className={cn(PRIMARY_BUTTON, "shrink-0 whitespace-nowrap")}
          disabled={busy || !state || slug.trim() === ""}
          onClick={() => void publish()}
        >
          {busy ? t("Working…") : site ? t("Publish again") : t("Publish")}
        </button>
      </div>
    </Dialog>
  );
}
