import { fromBase64, toBase64 } from "./project-doc";
import { t } from "@scholarkit/i18n";

/**
 * The Scholarkit server, as the apps use it: the account, the account's
 * projects of one app, a project's document, its files and its history.
 * Cursive and Binder each extend it with what only they ask for.
 *
 * In the browser an app runs on the server's own origin and the session
 * cookie signs requests in. A desktop app sends them through its own
 * transport, which adds the account's token.
 */
export interface Account {
  id: string;
  name: string;
  email: string;
}

/** The app a project belongs to on the server. */
export type ProjectApp = "polemic" | "cursive" | "binder";

export interface ServerProject {
  id: string;
  name: string;
  role: "owner" | "editor" | "commenter" | "viewer";
  owner: { id: string; name: string };
  writable: boolean;
  updatedAt: string;
}

/** What someone invited can do: Polemic's projects use commenter, Cursive's and Binder's viewer. */
export type ShareRole = "editor" | "commenter" | "viewer";

/** Someone the owner invited, who accepted. */
export interface Member {
  userId: string;
  name: string;
  /** Only the owner sees members' addresses. */
  email?: string;
  role: ShareRole;
  addedAt: string;
}

/** An invite that wasn't accepted yet. */
export interface Invite {
  id: string;
  email: string;
  role: ShareRole;
  createdAt: string;
  expiresAt: string;
}

/** Who is in a project besides its owner; invites only for the owner. */
export interface People {
  members: Member[];
  invites: Invite[];
}

/** An answer the server gave that isn't success, with its message for the reader. */
export class ServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Answer {
  status: number;
  body: string;
}

export type Body = { json: unknown } | { bytes: Uint8Array; type?: string } | undefined;

/** Sends one request to the server's API and returns its status and body. */
export type Transport = (method: string, path: string, body?: Body) => Promise<Answer>;

/** The browser's transport: same origin, signed in by the session cookie. */
export const browserTransport: Transport = async (method, path, body) => {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body
        ? {
            "content-type":
              "json" in body
                ? "application/json"
                : (body.type ?? "application/octet-stream"),
          }
        : undefined,
      body: body
        ? "json" in body
          ? JSON.stringify(body.json)
          : (body.bytes as BufferSource)
        : undefined,
    });
  } catch {
    throw new ServerError(
      0,
      "offline",
      t("The server can't be reached. Check your connection."),
    );
  }
  return { status: response.status, body: await response.text() };
};

export class AccountServer {
  constructor(
    protected readonly send: Transport,
    /** The app whose projects this client lists and makes. */
    readonly app: ProjectApp,
    /** What a request says when nobody is signed in. */
    private readonly signInFirst = t("Sign in to your account first."),
  ) {}

  protected async call<T>(method: string, path: string, body?: Body): Promise<T> {
    const answer = await this.send(method, path, body);
    let parsed: unknown = null;
    try {
      parsed = answer.body ? JSON.parse(answer.body) : null;
    } catch {
      // Not the API's JSON: a proxy's error page, for one.
    }
    if (answer.status >= 200 && answer.status < 300) return parsed as T;
    const error = parsed as { error?: string; code?: string; message?: string } | null;
    const fallback =
      answer.status === 401
        ? this.signInFirst
        : t("The server answered {status}.", { status: answer.status });
    throw new ServerError(
      answer.status,
      error?.error ?? error?.code ?? "error",
      typeof error?.message === "string" && error.message ? error.message : fallback,
    );
  }

  /** The signed-in account, or null when nobody is signed in. */
  async me(): Promise<Account | null> {
    try {
      return await this.call<Account>("GET", "/api/me");
    } catch (error) {
      if (error instanceof ServerError && error.status === 401) return null;
      throw error;
    }
  }

  /** Signs out the browser's session, on the Scholarkit server's own pages. */
  async signOut(): Promise<void> {
    await this.call("POST", "/api/auth/sign-out", { json: {} });
  }

  /** The account's projects of this app, newest first. */
  async projects(): Promise<ServerProject[]> {
    const list = await this.call<{ projects: ServerProject[] }>(
      "GET",
      `/api/projects?app=${this.app}`,
    );
    return list.projects;
  }

  project(id: string): Promise<ServerProject> {
    return this.call("GET", `/api/projects/${encodeURIComponent(id)}`);
  }

  /** A new project of this app: `linked` syncs with a folder, `online` lives on the server. */
  createProject(name: string, source: "linked" | "online"): Promise<ServerProject> {
    return this.call("POST", "/api/projects", {
      json: { name, source, app: this.app },
    });
  }

  renameProject(id: string, name: string): Promise<ServerProject> {
    return this.call("PATCH", `/api/projects/${encodeURIComponent(id)}`, {
      json: { name },
    });
  }

  deleteProject(id: string): Promise<void> {
    return this.call("DELETE", `/api/projects/${encodeURIComponent(id)}`);
  }

  /** Who is in the project, and for its owner the open invites. */
  people(id: string): Promise<People> {
    return this.call("GET", `/api/projects/${encodeURIComponent(id)}/members`);
  }

  /** Emails an invite (owner only). Inviting an address again sends a new link. */
  invite(id: string, email: string, role: ShareRole): Promise<Invite> {
    return this.call("POST", `/api/projects/${encodeURIComponent(id)}/invites`, {
      json: { email, role },
    });
  }

  cancelInvite(id: string, inviteId: string): Promise<void> {
    return this.call(
      "DELETE",
      `/api/projects/${encodeURIComponent(id)}/invites/${encodeURIComponent(inviteId)}`,
    );
  }

  /** Gives a member another role (owner only). */
  setRole(id: string, userId: string, role: ShareRole): Promise<Member> {
    return this.call("PATCH", memberPath(id, userId), { json: { role } });
  }

  /** The owner removes a member, or a member removes themselves: they leave. */
  removeMember(id: string, userId: string): Promise<void> {
    return this.call("DELETE", memberPath(id, userId));
  }

  /** What the server's document has that a copy with this state vector lacks. */
  async documentSync(
    id: string,
    stateVector: Uint8Array,
  ): Promise<{ update: Uint8Array; stateVector: Uint8Array }> {
    const answer = await this.call<{ update: string; stateVector: string }>(
      "POST",
      `/api/projects/${encodeURIComponent(id)}/document/sync`,
      { json: { stateVector: toBase64(stateVector) } },
    );
    return {
      update: fromBase64(answer.update),
      stateVector: fromBase64(answer.stateVector),
    };
  }

  documentUpdate(id: string, update: Uint8Array): Promise<void> {
    return this.call(
      "POST",
      `/api/projects/${encodeURIComponent(id)}/document/update`,
      {
        bytes: update,
      },
    );
  }

  /** The files whose bytes the server keeps for the project. */
  async assets(
    id: string,
  ): Promise<Array<{ hash: string; size: number; contentType: string }>> {
    const list = await this.call<{
      assets: Array<{ hash: string; size: number; contentType: string }>;
    }>("GET", `/api/projects/${encodeURIComponent(id)}/assets`);
    return list.assets;
  }

  /** Keeps a file's bytes for the project, by their SHA-256. */
  uploadAsset(
    id: string,
    hash: string,
    bytes: Uint8Array,
    type: string,
  ): Promise<void> {
    return this.call(
      "PUT",
      `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(hash)}`,
      { bytes, type },
    );
  }

  /** Snapshots of the project, newest first: the server takes one each hour it changes. */
  async history(
    id: string,
  ): Promise<Array<{ id: string; kind: string; createdAt: string }>> {
    const list = await this.call<{
      snapshots: Array<{ id: string; kind: string; createdAt: string }>;
    }>("GET", `/api/projects/${encodeURIComponent(id)}/history`);
    return list.snapshots;
  }

  /** The project's pages as one snapshot holds them. */
  async snapshot(id: string, snapshotId: string): Promise<Record<string, string>> {
    const found = await this.call<{ files: Array<{ path: string; text: string }> }>(
      "GET",
      `/api/projects/${encodeURIComponent(id)}/history/${encodeURIComponent(snapshotId)}`,
    );
    return Object.fromEntries(found.files.map((file) => [file.path, file.text]));
  }

  /** Puts pages back as a snapshot holds them; the server keeps the project as it is first. */
  restore(id: string, snapshotId: string, paths: string[]): Promise<void> {
    return this.call(
      "POST",
      `/api/projects/${encodeURIComponent(id)}/history/${encodeURIComponent(snapshotId)}/restore`,
      { json: { paths } },
    );
  }
}

const memberPath = (id: string, userId: string) =>
  `/api/projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`;

/** Saves a file from the server's API on this computer, under `name`. */
export type SaveFile = (path: string, name: string) => Promise<void>;

/** In the browser the session cookie gets the file; the browser saves it as a download. */
export const browserSaveFile: SaveFile = async (path, name) => {
  const link = document.createElement("a");
  link.href = path;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
};
