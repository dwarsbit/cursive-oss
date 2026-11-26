import { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";
import { t } from "@scholarkit/i18n";

/**
 * Keeping a project's document in step with the Scholarkit server while
 * it is open: in the browser, as Cursive and Binder do, and in Cursive's
 * desktop app for shared projects.
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
  /** Whether the live connection is up; while it isn't, your changes wait in this window. */
  connected?(): boolean;
  /** Called when someone comes, goes or moves, and when the connection drops or comes back. Returns a function that stops it. */
  onChange(listener: () => void): () => void;
}

/** How the project's document reaches the server. Tests connect their own. */
export interface Connection {
  /** How many changes the server doesn't have yet. */
  unsynced(): number;
  onUnsynced(listener: () => void): void;
  /** Called when the server lets the connection in again, maybe with other access. */
  onAuthenticated?(listener: () => void): void;
  /** Called when the server no longer lets the open connection in, as after you left the project. */
  onLost?(listener: () => void): void;
  /** Who else has the project open; none when the connection can't tell. */
  presence?: Presence;
  close(): void;
}

export type Connect = (id: string, doc: Y.Doc) => Promise<Connection>;

/**
 * A live connection to the sync service at `url` (ws: or wss:), signed in with what `token`
 * gives, asked anew on every connect and reconnect.
 */
export const connectTo =
  (url: string, token: () => Promise<string>): Connect =>
  (id, doc) =>
    new Promise((resolve, reject) => {
      const listeners = new Set<() => void>();
      const authenticated = new Set<() => void>();
      const lost = new Set<() => void>();
      let open = false;
      const timer = setTimeout(() => {
        provider.destroy();
        reject(
          new Error(
            t("Could not load the project. Check your connection and try again."),
          ),
        );
      }, 30_000);
      const provider = new HocuspocusProvider({
        url,
        name: id,
        token: () => token().catch(() => ""),
        document: doc,
        onSynced: () => {
          clearTimeout(timer);
          if (open) return;
          open = true;
          resolve({
            unsynced: () => provider.unsyncedChanges,
            onUnsynced: (listener) => listeners.add(listener),
            onAuthenticated: (listener) => authenticated.add(listener),
            onLost: (listener) => lost.add(listener),
            presence: provider.awareness ? presenceOf(provider) : undefined,
            close: () => provider.destroy(),
          });
        },
        onUnsyncedChanges: () => listeners.forEach((listener) => listener()),
        onAuthenticated: () => authenticated.forEach((listener) => listener()),
        onAuthenticationFailed: () => {
          clearTimeout(timer);
          provider.destroy();
          if (open) lost.forEach((listener) => listener());
          else
            reject(
              new Error(t("This project doesn't exist or isn't shared with you.")),
            );
        },
      });
    });

/** The server's sync address: the page's own host, signed in by the session cookie. */
export const connectToServer: Connect = (id, doc) => {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  // The session cookie signs the connection in.
  return connectTo(`${scheme}://${window.location.host}/api/sync`, async () => "")(
    id,
    doc,
  );
};

/** The presence a connection's awareness carries, under the field "presence". */
function presenceOf(provider: HocuspocusProvider): Presence {
  const awareness = provider.awareness!;
  let connected = true;
  provider.on("status", ({ status }: { status: string }) => {
    connected = status === "connected";
  });
  return {
    connected: () => connected,
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
      provider.on("status", listener);
      return () => {
        awareness.off("change", listener);
        provider.off("status", listener);
      };
    },
  };
}
