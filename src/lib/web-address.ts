/**
 * Cursive's addresses in the browser, under where the app is served ("/cursive/"): the list of
 * projects at /cursive/projects and one project at /cursive/projects/<id>.
 */
export function webAddresses(base: string) {
  /** The list of projects. */
  const list = `${base}projects`;

  /** One project. */
  const of = (id: string) => `${list}/${encodeURIComponent(id)}`;

  /** The project in an address, or null: on the list and anywhere else. */
  function idIn(path: string): string | null {
    if (!path.startsWith(`${list}/`)) return null;
    try {
      return (
        decodeURIComponent(path.slice(list.length + 1).split("/")[0] ?? "") || null
      );
    } catch {
      return null;
    }
  }

  /**
   * The address to show in place of this one, or null when it is right. An address from before
   * the move, /cursive/<id>, becomes the project's new one, so old links keep working. Anything
   * else that names no project is the list.
   */
  function better(path: string): string | null {
    if (path === list || idIn(path) !== null) return null;
    const old = path.startsWith(base)
      ? path.slice(base.length).replace(/\/+$/, "")
      : "";
    return old !== "projects" && /^[A-Za-z0-9_-]+$/.test(old) ? of(old) : list;
  }

  return { list, of, idIn, better };
}
