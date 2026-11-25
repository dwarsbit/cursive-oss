import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * The page an app shows with no project open, the same in Binder and Cursive
 * and drawn alike in Polemic: the app's icon and "New …" over one card with
 * the name, the app's own choices and Create. In the browser the card is all
 * there is, as the Scholarkit home lists the projects; the desktop app adds
 * its recent projects to the card.
 */
export function StartPage({
  mark,
  title,
  corner,
  account,
  onDrag,
  children,
  below,
}: {
  /** The app's icon, large, over the title. */
  mark: ReactNode;
  /** Such as "New binder". */
  title: string;
  /** Top left: the small app icon that goes to the Scholarkit home, in the browser. */
  corner?: ReactNode;
  /** Top right: the account menu, or Sign in. */
  account?: ReactNode;
  /** In the desktop app: drags the window by the strip along the top. */
  onDrag?: (event: React.PointerEvent) => void;
  children: ReactNode;
  /** A line under the card, such as where the projects are. */
  below?: ReactNode;
}) {
  return (
    <div className="relative flex h-full flex-col items-center overflow-y-auto px-4 pt-[max(3.5rem,9vh)] pb-16">
      {onDrag && (
        <div className="absolute inset-x-0 top-0 h-11" onPointerDown={onDrag} />
      )}
      {corner && <div className="absolute top-2.5 left-3">{corner}</div>}
      {account && <div className="absolute top-2 right-3">{account}</div>}
      <h1 className="mb-5 flex flex-none flex-col items-center gap-2.5 text-[17px] font-semibold">
        {mark}
        {title}
      </h1>
      <div className="w-full max-w-[480px] flex-none rounded-xl bg-card p-5 shadow-[var(--pop-shadow)]">
        {children}
      </div>
      {below && (
        <p className="mt-3.5 flex-none text-center text-xs text-muted-foreground">
          {below}
        </p>
      )}
    </div>
  );
}

/** The name field at the top of the card. */
export const START_INPUT =
  "h-9 w-full min-w-0 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring";

/** A quiet action at the foot of the card, such as Open folder…, with its icon. */
export const START_LINK =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-1 text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50 [&_svg]:size-3.5";

/** The foot of the card: the app's other ways in on the left, Create on the right. */
export function StartFooter({
  children,
  create,
}: {
  children?: ReactNode;
  create: ReactNode;
}) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        {children}
      </div>
      {create}
    </div>
  );
}

/** What a tile's small drawing shows. */
export type TileLook = "blank" | "page" | "slides";

export interface TemplateTile {
  id: string;
  name: string;
  look: TileLook;
  /** What it starts with, on hover. */
  hint?: string;
}

/** A small drawing of a page, a deck or nothing, for a tile. */
function TilePreview({ look }: { look: TileLook }) {
  const line = "absolute h-[3px] rounded-full bg-foreground/12";
  return (
    <span
      aria-hidden
      className="relative block h-11 overflow-hidden rounded-[5px] bg-muted group-aria-checked:bg-primary/8"
    >
      {look === "page" && (
        <>
          <span
            className={cn(line, "top-2 right-8 left-2.5 h-[5px] bg-foreground/20")}
          />
          <span className={cn(line, "top-[18px] right-2.5 left-2.5")} />
          <span className={cn(line, "top-[25px] right-5 left-2.5")} />
          <span className={cn(line, "top-8 right-7 left-2.5")} />
        </>
      )}
      {look === "slides" && (
        <>
          <span
            className={cn(line, "top-[15px] right-4 left-4 h-[5px] bg-foreground/20")}
          />
          <span className={cn(line, "top-[25px] right-6 left-6")} />
        </>
      )}
    </span>
  );
}

const TILE =
  "group flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-1.5 pb-2 text-left text-xs font-medium outline-none hover:border-foreground/20 focus-visible:border-ring aria-checked:border-primary aria-checked:shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_14%,transparent)] disabled:opacity-50";

/**
 * The templates a new project can start from, as tiles in rows of three: one
 * is picked at a time. `more`, when there are more templates than tiles, is a
 * last tile that shows them all.
 */
export function TemplateTiles({
  label,
  tiles,
  value,
  onChange,
  disabled,
  more,
}: {
  label: string;
  tiles: TemplateTile[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  more?: { label: string; onClick: () => void; icon?: ReactNode };
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      {tiles.map((tile) => (
        <button
          key={tile.id}
          type="button"
          role="radio"
          aria-checked={value === tile.id}
          title={tile.hint}
          disabled={disabled}
          onClick={() => onChange(tile.id)}
          className={TILE}
        >
          <TilePreview look={tile.look} />
          <span className="truncate px-0.5">{tile.name}</span>
        </button>
      ))}
      {more && (
        <button
          type="button"
          disabled={disabled}
          onClick={more.onClick}
          className="flex min-h-[78px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed p-1.5 text-xs text-muted-foreground hover:border-foreground/25 hover:text-foreground disabled:opacity-50 [&_svg]:size-3.5"
        >
          {more.icon}
          {more.label}
        </button>
      )}
    </div>
  );
}

/** The heading over the desktop app's recent projects, in the card. */
export function StartSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-5">
      <h2 className="mb-1.5 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
