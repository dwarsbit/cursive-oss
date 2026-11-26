import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveConnection } from "@scholarkit/collab";
import type { Presence } from "@scholarkit/editor/lib/sync";

/**
 * Who else has the project open in their browser: the page each one is
 * on, and their caret and selection in the view they have it open in.
 */

/** Which face of the page a window shows: the page itself, or its Markdown. */
export type PageView = "visual" | "markdown";

/** Someone else's window on the project. */
export interface Peer {
  clientId: number;
  user: { id: string; name: string };
  /** The page they have open; null on none. */
  page: string | null;
  /** The view their caret is in; positions in one view mean nothing in the other. */
  view: PageView;
  /** Their selection in that view of that page; null when unknown. */
  anchor: number | null;
  head: number | null;
}

/** What this window shares. */
export interface Here {
  page: string | null;
  view: PageView;
  anchor: number | null;
  head: number | null;
}

/** The project's presence as the app uses it: the others, and what you share. */
export interface ProjectPresence {
  peers: Peer[];
  /** Your account, whose other windows don't count as someone else. */
  me: string | null;
  connection: LiveConnection;
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
            view:
              state.view === "markdown" ? ("markdown" as const) : ("visual" as const),
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
  me: string | null = null,
): ProjectPresence {
  const [presence, setPresence] = useState<Presence | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connection, setConnection] = useState<LiveConnection>("connected");
  // What this window shares, kept until the connection is there.
  const here = useRef<Here>({ page: null, view: "visual", anchor: null, head: null });

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
    const read = () => {
      setPeers(readPeers(presence));
      setConnection(presence.connected?.() === false ? "connecting" : "connected");
    };
    read();
    return presence.onChange(read);
  }, [presence]);

  const share = useCallback(
    (next: Here) => {
      const last = here.current;
      if (
        last.page === next.page &&
        last.view === next.view &&
        last.anchor === next.anchor &&
        last.head === next.head
      )
        return;
      here.current = next;
      presence?.set({ ...next });
    },
    [presence],
  );

  return { peers, me, connection, share };
}
