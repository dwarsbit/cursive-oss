import { useCallback, useEffect, useRef, useState } from "react";
import type { Presence } from "@scholarkit/editor/lib/sync";

/**
 * Who else has the project open in their browser: the page each one is
 * on, and in the visual editor their caret and selection.
 */

/** Someone else's window on the project. */
export interface Peer {
  clientId: number;
  user: { id: string; name: string };
  /** The page they have open; null on none. */
  page: string | null;
  /** Their selection in the visual editor of that page; null in the Markdown view. */
  anchor: number | null;
  head: number | null;
}

/** What this window shares. */
export interface Here {
  page: string | null;
  anchor: number | null;
  head: number | null;
}

/** The project's presence as the app uses it: the others, and what you share. */
export interface ProjectPresence {
  peers: Peer[];
  share(here: Here): void;
}

const position = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;

/** The others as the connection has them, skipping windows that don't say whose they are. */
export function readPeers(presence: Presence): Peer[] {
  return presence.others().flatMap(({ clientId, user, state }) =>
    user
      ? [
          {
            clientId,
            user,
            page: typeof state.page === "string" ? state.page : null,
            anchor: position(state.anchor),
            head: position(state.head),
          },
        ]
      : [],
  );
}

/** Follows the project's presence once the store hands it over. */
export function usePresence(
  withPresence: (listener: (presence: Presence) => void) => void,
): ProjectPresence {
  const [presence, setPresence] = useState<Presence | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  // What this window shares, kept until the connection is there.
  const here = useRef<Here>({ page: null, anchor: null, head: null });

  useEffect(() => {
    let current = true;
    withPresence((found) => current && setPresence(found));
    return () => {
      current = false;
    };
  }, [withPresence]);

  useEffect(() => {
    if (!presence) return;
    presence.set({ ...here.current });
    const read = () => setPeers(readPeers(presence));
    read();
    return presence.onChange(read);
  }, [presence]);

  const share = useCallback(
    (next: Here) => {
      const last = here.current;
      if (
        last.page === next.page &&
        last.anchor === next.anchor &&
        last.head === next.head
      )
        return;
      here.current = next;
      presence?.set({ ...next });
    },
    [presence],
  );

  return { peers, share };
}
