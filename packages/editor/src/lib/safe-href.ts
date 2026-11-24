/** The link schemes a click may follow: web pages, mail, phone and Zotero items. */
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel", "zotero"]);

/**
 * A link's address when it is safe to follow, else "". Safe: a web, mail,
 * phone or Zotero link, or one without a scheme (a path or a #place). Any
 * other scheme, `javascript:` above all, could run code in the app, so a
 * link from someone else's text, a web page or the assistant never gets it.
 * Browsers skip spaces and control characters in a scheme
 * ("java\tscript:"), so those are dropped before it is read.
 */
export function safeHref(href: string | null | undefined): string {
  const value = (href ?? "").trim();
  // eslint-disable-next-line no-control-regex
  const bare = value.replace(/[\u0000- \u007f]/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(bare)?.[1];
  if (scheme === undefined) return value;
  return SAFE_SCHEMES.has(scheme.toLowerCase()) ? value : "";
}

/** Whether a link may be followed: see `safeHref`. */
export const isSafeHref = (href: string | null | undefined): boolean =>
  safeHref(href) !== "";
