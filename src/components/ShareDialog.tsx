import { Mail, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  BUTTON,
  Dialog,
  messageOf,
  PRIMARY_BUTTON,
  QUIET_BUTTON,
} from "@scholarkit/editor/components/Dialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { Face } from "./Face";
import type { Account, People, Server, ServerProject, ShareRole } from "@/lib/server";
import { t } from "@scholarkit/i18n";

/** The roles a Cursive project has. Cursive has no comments, so no commenters. */
const ROLES = [
  { role: "editor", label: t("Can edit") },
  { role: "viewer", label: t("Can read") },
] as const satisfies ReadonlyArray<{ role: ShareRole; label: string }>;

const ROLE_LABELS: Record<ShareRole | "owner", string> = {
  owner: t("Owner"),
  editor: t("Can edit"),
  viewer: t("Can read"),
  commenter: t("Can read"),
};

const SELECT =
  "h-7 rounded-md border bg-background px-1.5 text-xs text-foreground outline-none focus:border-ring disabled:opacity-50";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function RoleSelect({
  value,
  label,
  disabled,
  className,
  onChange,
}: {
  value: ShareRole;
  label: string;
  disabled?: boolean;
  className?: string;
  onChange: (role: ShareRole) => void;
}) {
  return (
    <select
      className={`${SELECT} ${className ?? ""}`}
      value={value === "commenter" ? "viewer" : value}
      aria-label={label}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ShareRole)}
    >
      {ROLES.map(({ role, label }) => (
        <option key={role} value={role}>
          {label}
        </option>
      ))}
    </select>
  );
}

function Person({
  userId,
  name,
  email,
  you,
  children,
}: {
  userId: string;
  name: string;
  email?: string;
  you?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2.5">
      <Face userId={userId} name={name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">
          {name}
          {you && (
            <span className="font-normal text-muted-foreground"> {t("(you)")}</span>
          )}
        </span>
        {email && (
          <span className="block truncate text-xs text-muted-foreground">{email}</span>
        )}
      </span>
      {children}
    </li>
  );
}

/**
 * Who works on a project in the account. Its owner invites people by
 * email to edit or read it, changes their role and removes them; anyone
 * else sees who is in it and can leave.
 */
export function ShareDialog({
  server,
  project,
  me,
  onLeft,
  onClose,
}: {
  server: Server;
  project: ServerProject;
  me: Account;
  /** After you left the project: it is no longer in your account. */
  onLeft: () => void;
  onClose: () => void;
}) {
  const owner = project.role === "owner";
  const [people, setPeople] = useState<People | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let current = true;
    server.people(project.id).then(
      (found) => current && setPeople(found),
      (error: unknown) => current && setProblem(messageOf(error)),
    );
    return () => {
      current = false;
    };
  }, [server, project.id]);

  /** Runs one change, then shows the people as the server has them now. */
  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setProblem(null);
    setNote(null);
    try {
      await action();
      setPeople(await server.people(project.id));
      return true;
    } catch (error) {
      setProblem(messageOf(error));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const invite = async () => {
    const to = email.trim();
    if (!to) return;
    if (await run("invite", () => server.invite(project.id, to, role))) {
      setEmail("");
      setNote(t("Invite sent to {email}.", { email: to.toLowerCase() }));
    }
  };

  const leave = async () => {
    setLeaving(false);
    setBusy("leave");
    setProblem(null);
    try {
      await server.removeMember(project.id, me.id);
      onLeft();
    } catch (error) {
      setProblem(messageOf(error));
      setBusy(null);
    }
  };

  const mine = people?.members.find((member) => member.userId === me.id);
  const others = people?.members.filter((member) => member.userId !== me.id) ?? [];

  if (leaving) {
    return (
      <ConfirmDialog
        title={t("Leave “{name}”?", { name: project.name })}
        body={t(
          "It goes from your account, and you stop seeing changes to it. To come back, ask {name} for a new invite.",
          { name: project.owner.name },
        )}
        confirmLabel={t("Leave project")}
        onConfirm={() => void leave()}
        onCancel={() => setLeaving(false)}
      />
    );
  }

  return (
    <Dialog title={t("Share “{name}”", { name: project.name })} onClose={onClose}>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        {owner
          ? t(
              "People you invite work on the project with you, in the browser or in the desktop app. What they add counts toward your storage.",
            )
          : project.role === "editor"
            ? t(
                "{owner} owns this project and decides who works on it. You can edit it.",
                {
                  owner: project.owner.name,
                },
              )
            : t(
                "{owner} owns this project and decides who works on it. You can read it.",
                {
                  owner: project.owner.name,
                },
              )}
      </p>

      {owner && (
        <form
          className="mt-3 flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void invite();
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("Email address")}
            aria-label={t("Email address")}
            autoComplete="off"
            spellCheck={false}
            maxLength={254}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-[13px] outline-none focus:border-ring"
          />
          <RoleSelect
            value={role}
            label={t("Role of the person you invite")}
            className="h-8"
            onChange={setRole}
          />
          <button
            type="submit"
            className={PRIMARY_BUTTON}
            disabled={busy !== null || email.trim() === ""}
          >
            {busy === "invite" ? t("Sending…") : t("Invite")}
          </button>
        </form>
      )}

      {problem && (
        <p className="mt-2 text-[13px] text-destructive" role="alert">
          {problem}
        </p>
      )}
      {note && (
        <p className="mt-2 text-[13px] text-muted-foreground" role="status">
          {note}
        </p>
      )}

      <h3 className="mt-4 text-xs font-medium">{t("People")}</h3>
      {!people ? (
        !problem && (
          <p className="mt-2 text-[13px] text-muted-foreground" role="status">
            {t("Loading…")}
          </p>
        )
      ) : (
        <ul className="mt-2 max-h-72 space-y-2.5 overflow-y-auto">
          <Person
            userId={project.owner.id}
            name={project.owner.name}
            email={owner ? me.email : undefined}
            you={owner}
          >
            <span className="text-xs text-muted-foreground">{t("Owner")}</span>
          </Person>
          {mine && (
            <Person userId={me.id} name={me.name} you>
              <span className="text-xs text-muted-foreground">
                {ROLE_LABELS[mine.role]}
              </span>
            </Person>
          )}
          {others.map((member) => (
            <Person
              key={member.userId}
              userId={member.userId}
              name={member.name}
              email={member.email}
            >
              {owner ? (
                <>
                  <RoleSelect
                    value={member.role}
                    label={t("{name}'s role", { name: member.name })}
                    disabled={busy !== null}
                    onChange={(next) =>
                      void run(`role:${member.userId}`, () =>
                        server.setRole(project.id, member.userId, next),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="grid size-7 flex-none place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    aria-label={t("Remove {name}", { name: member.name })}
                    title={t("Remove {name}", { name: member.name })}
                    disabled={busy !== null}
                    onClick={() =>
                      void run(`remove:${member.userId}`, () =>
                        server.removeMember(project.id, member.userId),
                      )
                    }
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {ROLE_LABELS[member.role]}
                </span>
              )}
            </Person>
          ))}
          {people.invites.map((open) => (
            <li key={open.id} className="flex items-center gap-2.5">
              <span className="grid size-6 flex-none place-items-center rounded-full border border-dashed text-muted-foreground">
                <Mail className="size-3" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{open.email}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {open.role === "editor"
                    ? t("Invited · can edit · expires {day}", {
                        day: day(open.expiresAt),
                      })
                    : t("Invited · can read · expires {day}", {
                        day: day(open.expiresAt),
                      })}
                </span>
              </span>
              <button
                type="button"
                className={`${QUIET_BUTTON} h-7 px-2 text-xs`}
                disabled={busy !== null}
                onClick={() =>
                  void run(`cancel:${open.id}`, () =>
                    server.cancelInvite(project.id, open.id),
                  )
                }
              >
                {t("Cancel invite")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {owner &&
        people &&
        people.members.length === 0 &&
        people.invites.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Invite a co-author to edit, or a supervisor to read along.")}
          </p>
        )}

      <div className="mt-4 flex gap-2">
        {!owner && (
          <button
            type="button"
            className={QUIET_BUTTON}
            disabled={busy !== null}
            onClick={() => setLeaving(true)}
          >
            {busy === "leave" ? t("Leaving…") : t("Leave project")}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className={BUTTON} onClick={onClose}>
          {t("Close")}
        </button>
      </div>
    </Dialog>
  );
}
