/**
 * The interface languages Cursive ships: one catalog per language in
 * src/locales, loaded when it is picked. English is the source and needs
 * none. `pnpm i18n` brings the catalogs up to date with the code.
 */

import {
  availableLanguages,
  type Catalog,
  type CatalogLoaders,
  saveLanguage,
  SOURCE_LANGUAGE,
} from "@scholarkit/i18n";

const files = import.meta.glob<{ default: Catalog }>("../locales/*.json");

export const catalogs: CatalogLoaders = Object.fromEntries(
  Object.entries(files)
    .map(([path, load]) => [/([\w-]+)\.json$/.exec(path)?.[1] ?? "", load] as const)
    .filter(([code]) => code !== "" && code !== SOURCE_LANGUAGE),
);

/** The languages Settings offers: in development, the pseudo-language too. */
export const languageCodes = availableLanguages(catalogs, import.meta.env.DEV);

let save: (() => Promise<void>) | null = null;

/**
 * What to write before the window reloads, in another language or to load a new version: the
 * open project's changes.
 */
export function saveBeforeSwitch(next: () => Promise<void>): () => void {
  save = next;
  return () => {
    if (save === next) save = null;
  };
}

/**
 * Switches the interface language. Every message is translated as the app
 * loads, so the window reloads, once the open project is written.
 */
export async function switchLanguage(code: string): Promise<void> {
  await save?.();
  saveLanguage(code);
  window.location.reload();
}

/** Writes the open project's changes, before the page reloads to load a new version. */
export async function saveBeforeReload(): Promise<void> {
  await save?.();
}
