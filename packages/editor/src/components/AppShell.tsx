import type { CSSProperties, ReactNode } from "react";
import { cn } from "../lib/cn";

/** A grey placeholder for something the loading screen doesn't have yet. */
function Bone({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "block animate-pulse rounded bg-muted motion-reduce:animate-none",
        className,
      )}
    />
  );
}

const SIDEBAR_ROWS = [72, 56, 84, 64, 76, 52];

/**
 * The loading screen Cursive and Binder share, and Polemic has in its own
 * layout: the app's layout comes first, with the app's icon, placeholders
 * where the sidebar, the header and the avatar go, and a spinner where the
 * project opens, so nothing jumps when it is there. It uses the apps' own
 * `.app` and `.sidebar` layout, so it is the same width and folds away on a
 * phone the same way.
 */
export function AppLoading({
  mark,
  name,
  status,
  failed = false,
  children,
}: {
  /** The app's icon, as at the top of its sidebar. */
  mark: ReactNode;
  /** The project's name, where it is known already. */
  name?: string;
  /** What is happening, such as "Opening your project…", or why it didn't work. */
  status: string;
  /** Whether opening failed: the spinner gives way to the status and `children`. */
  failed?: boolean;
  /** What to do next when it failed, such as a Try again button. */
  children?: ReactNode;
}) {
  return (
    <div className="app">
      <aside className="sidebar" aria-hidden>
        <div className="flex h-11 flex-none items-center gap-1 px-2 text-sm font-semibold">
          <span className="mr-1 grid size-[22px] flex-none place-items-center">
            {mark}
          </span>
          {name ? (
            <span className="min-w-0 flex-1 truncate">{name}</span>
          ) : (
            <Bone className="h-2.5 w-24" />
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-2 pt-3">
          {SIDEBAR_ROWS.map((width, index) => (
            <Bone key={index} className="h-2" style={{ width: `${width}%` }} />
          ))}
        </div>
        <div className="flex h-9 flex-none items-center gap-2 border-t px-2">
          <Bone className="size-3.5 rounded-full" />
          <Bone className="h-2 w-16" />
        </div>
      </aside>
      <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] bg-card shadow-[0_1px_2px_oklch(14.5%_0.008_326/5%),0_0_0_1px_var(--border)]">
        <div
          className="flex h-11 flex-none items-center justify-end gap-2 px-3"
          aria-hidden
        >
          <Bone className="h-7 w-20 rounded-md" />
          <Bone className="h-7 w-20 rounded-md" />
          <Bone className="ml-1 size-7 rounded-full" />
        </div>
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div className="flex flex-col items-center gap-3">
            {!failed && (
              <span
                aria-hidden
                className="size-5 animate-spin rounded-full border-2 border-muted border-t-primary-fill motion-reduce:animate-none"
              />
            )}
            <p
              className={cn(
                "text-sm",
                failed ? "text-foreground" : "text-muted-foreground",
              )}
              role={failed ? "alert" : "status"}
            >
              {status}
            </p>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

const HOME_MARK =
  "mr-1 grid size-[22px] flex-none place-items-center rounded-[6px] outline-none";

/**
 * The app's icon at the top left, the way back to the projects overview, as
 * in all three apps: a link where there is a page for it (the Scholarkit home
 * in the browser), a button where the app goes there itself (the desktop
 * app's project list), and only the icon where there is neither.
 */
export function HomeMark({
  children,
  href,
  onClick,
  label,
  className,
}: {
  className?: string;
  /** The app's icon. */
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Says where it goes, as the tooltip and to screen readers. */
  label: string;
}) {
  const link =
    "transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/50";
  if (href) {
    return (
      <a
        href={href}
        title={label}
        aria-label={label}
        className={cn(HOME_MARK, link, className)}
      >
        {children}
      </a>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={onClick}
        className={cn(HOME_MARK, link, className)}
      >
        {children}
      </button>
    );
  }
  return <span className={cn(HOME_MARK, className)}>{children}</span>;
}
