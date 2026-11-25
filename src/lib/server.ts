import { invoke } from "@tauri-apps/api/core";
import { toBase64 } from "@scholarkit/editor/lib/project-doc";
import {
  AccountServer,
  ServerError,
  type Answer,
  type SaveFile,
  type Transport,
} from "@scholarkit/editor/lib/account";
import { t } from "@scholarkit/i18n";

export {
  browserSaveFile,
  browserTransport,
  ServerError,
  type Account,
  type Invite,
  type Member,
  type People,
  type SaveFile,
  type ServerProject,
  type ShareRole,
  type Transport,
} from "@scholarkit/editor/lib/account";

export interface Site {
  slug: string;
  url: string;
  pages: number;
  publishedAt: string;
  /** The site's look: a SiteTheme. A server from before themes leaves it out. */
  theme?: string;
}

export interface SiteState {
  site: Site | null;
  suggestedSlug: string;
  /** The owner's username, or the one the first publish gives them. A server from before usernames leaves it out. */
  username?: string;
  /** Whether the owner has the username yet: false until their first publish. */
  usernameSaved?: boolean;
  /** What the owner's site addresses start with: <sites host>/@<username>/. */
  baseUrl: string;
  /** The page that lists the owner's sites. */
  ownerPageUrl?: string;
}

/** What a learner handed in for an assignment of a published tutorial. */
export interface Submission {
  page: string;
  pageTitle: string;
  assignment: string;
  title: string;
  text: string;
  /** A file handed in with the text. */
  file: { name: string; size: number; contentType: string } | null;
  /** What the assignment gives on the published site now; null when the site no longer has it. */
  points: number | null;
  rubric: Criterion[];
  grade: Grade | null;
  submittedAt: string;
}

export interface Criterion {
  criterion: string;
  points: number;
}

/** The author's grade for handed-in work. */
export interface Grade {
  score: number;
  /** The points per criterion of the rubric; empty without one. */
  criteria: number[];
  feedback: string;
  gradedAt: string;
}

/** Which handed-in work: the page of the site and the assignment on it. */
export interface WorkRef {
  page: string;
  assignment: string;
}

/** A reader who signed in to the published tutorial. */
export interface Learner {
  id: string;
  name: string;
  email: string;
  pagesDone: number;
  points: number;
  lastActiveAt: string;
  submissions: Submission[];
}

export interface Learners {
  /** The published site's pages, and the points its quizzes and assignments give. */
  pages: number;
  points: number;
  learners: Learner[];
}

/** The desktop app's transport: the Rust side adds the account's token. */
export const desktopTransport: Transport = async (method, path, body) => {
  try {
    return await invoke<Answer>("server_request", {
      method,
      path,
      json: body && "json" in body ? JSON.stringify(body.json) : null,
      bytes: body && "bytes" in body ? toBase64(body.bytes) : null,
    });
  } catch (error) {
    throw new ServerError(
      0,
      "offline",
      typeof error === "string" ? error : String(error),
    );
  }
};

/**
 * The Scholarkit server, as Cursive uses it: the account, the account's
 * Cursive projects and a project's document (the shared AccountServer),
 * and a project's published site and its learners.
 *
 * In the browser Cursive runs on the server's own origin and the
 * session cookie signs requests in. The desktop app signs in through
 * the browser once and keeps a token in the system's credential store;
 * its requests go through the Rust side (`src-tauri/src/account.rs`),
 * so the token never reaches the window.
 */
export class Server extends AccountServer {
  constructor(send: Transport) {
    super(send, "cursive", t("Sign in to your Scholarkit account first."));
  }

  site(id: string): Promise<SiteState> {
    return this.call("GET", `/api/projects/${encodeURIComponent(id)}/site`);
  }

  /** Publishes the project's pages as the server has them now. */
  publish(id: string, slug?: string, theme?: string): Promise<Site> {
    return this.call("POST", `/api/projects/${encodeURIComponent(id)}/site`, {
      json: { ...(slug ? { slug } : {}), ...(theme ? { theme } : {}) },
    });
  }

  unpublish(id: string): Promise<void> {
    return this.call("DELETE", `/api/projects/${encodeURIComponent(id)}/site`);
  }

  /** Who signed in to the project's published tutorial, with their progress and work. */
  learners(id: string): Promise<Learners> {
    return this.call("GET", `/api/projects/${encodeURIComponent(id)}/learners`);
  }

  /** Grades a learner's work: points per criterion of the rubric, or one score. */
  grade(
    id: string,
    learnerId: string,
    work: WorkRef,
    grade: { score?: number; criteria?: number[]; feedback: string },
  ): Promise<Grade> {
    return this.call("PUT", `${learnerPath(id, learnerId)}/grade`, {
      json: { ...work, ...grade },
    });
  }

  clearGrade(id: string, learnerId: string, work: WorkRef): Promise<void> {
    return this.call(
      "DELETE",
      `${learnerPath(id, learnerId)}/grade?${workQuery(work)}`,
    );
  }
}

const learnerPath = (id: string, learnerId: string) =>
  `/api/projects/${encodeURIComponent(id)}/learners/${encodeURIComponent(learnerId)}`;

const workQuery = (work: WorkRef) =>
  `page=${encodeURIComponent(work.page)}&assignment=${encodeURIComponent(work.assignment)}`;

/** The API path of the file a learner handed in with their work. */
export const handedInFilePath = (id: string, learnerId: string, work: WorkRef) =>
  `${learnerPath(id, learnerId)}/file?${workQuery(work)}`;

/** On the desktop the Rust side gets the file and asks where to save it. */
export const desktopSaveFile: SaveFile = async (path, name) => {
  try {
    await invoke<boolean>("server_download", { path, name });
  } catch (error) {
    throw new ServerError(
      0,
      "download",
      typeof error === "string" ? error : String(error),
    );
  }
};
