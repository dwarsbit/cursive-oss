import { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";
import { t } from "@scholarkit/i18n";

/**
 * Keeping a project's document in step with the Scholarkit server while
 * it is open in the browser, as Cursive and Binder do.
 */

/** The SHA-256 of some bytes, in lowercase hex. */
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Who else has the project open, and where they are. Each window shares
 * its own state; the server adds whose it is (`user`).
 */
export interface Presence {
  /** This window's state, for the others to see. */
  set(state: Record<string, unknown>): void;
  /** The other windows' states, each with the window's id and its user. */
  others(): Array<{
    clientId: number;
    user: { id: string; name: string } | null;
    state: Record<string, unknown>;
  }>;
  /** Called when someone comes, goes or moves. Returns a function that stops it. */
  onChange(listener: () => void): () => void;
}

/** How the project's document reaches the server. Tests connect their own. */
export interface Connection {
  /** How many changes the server doesn't have yet. */
  unsynced(): number;
  onUnsynced(listener: () => void): void;
  /** Called when the server lets the connection in again, maybe with other access. */
  onAuthenticated?(listener: () => void): void;
  /** Who else has the project open; none when the connection can't tell. */
  presence?: Presence;
  close(): void;
}

export type Connect = (id: string, doc: Y.Doc) => Promise<Connection>;

/** The server's sync address: the page's own host, signed in by the session cookie. */
export const connectToServer: Connect = (id, doc) =>
  new Promise((resolve, reject) => {
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const listeners = new Set<() => void>();
    const authenticated = new Set<() => void>();
    const timer = setTimeout(() => {
      provider.destroy();
      reject(
        new Error(
          t("Could not load the project. Check your connection and try again."),
        ),
      );
    }, 30_000);
    const provider = new HocuspocusProvider({
      url: `${scheme}://${window.location.host}/api/sync`,
      name: id,
      // The session cookie signs the connection in.
      token: "",
      document: doc,
      onSynced: () => {
        clearTimeout(timer);
        resolve({
          unsynced: () => provider.unsyncedChanges,
          onUnsynced: (listener) => listeners.add(listener),
          onAuthenticated: (listener) => authenticated.add(listener),
          presence: provider.awareness ? presenceOf(provider.awareness) : undefined,
          close: () => provider.destroy(),
        });
      },
      onUnsyncedChanges: () => listeners.forEach((listener) => listener()),
      onAuthenticated: () => authenticated.forEach((listener) => listener()),
      onAuthenticationFailed: () => {
        clearTimeout(timer);
        provider.destroy();
        reject(new Error(t("This project doesn't exist or isn't shared with you.")));
      },
    });
  });

type Awareness = NonNullable<HocuspocusProvider["awareness"]>;

/** The presence a connection's awareness carries, under the field "presence". */
function presenceOf(awareness: Awareness): Presence {
  return {
    set: (state) => awareness.setLocalStateField("presence", state),
    others: () =>
      [...awareness.getStates()].flatMap(([clientId, value]) => {
        if (clientId === awareness.clientID) return [];
        const state = value as { user?: unknown; presence?: unknown };
        const user = state.user as { id?: unknown; name?: unknown } | undefined;
        return [
          {
            clientId,
            user:
              user && typeof user.id === "string"
                ? { id: user.id, name: typeof user.name === "string" ? user.name : "" }
                : null,
            state:
              state.presence && typeof state.presence === "object"
                ? (state.presence as Record<string, unknown>)
                : {},
          },
        ];
      }),
    onChange: (listener) => {
      awareness.on("change", listener);
      return () => awareness.off("change", listener);
    },
  };
}
