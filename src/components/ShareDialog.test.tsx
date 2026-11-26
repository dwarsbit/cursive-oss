// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Account, People, Server, ServerProject } from "@/lib/server";
import { ShareDialog } from "./ShareDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const owner: Account = {
  id: "u-owner",
  name: "Leon Grient",
  email: "leon@example.com",
};
const sara: Account = { id: "u-sara", name: "Sara Okafor", email: "sara@example.edu" };

const project = (role: ServerProject["role"]): ServerProject => ({
  id: "p1",
  name: "Research notes",
  role,
  owner: { id: owner.id, name: owner.name },
  writable: role === "owner" || role === "editor",
  updatedAt: "2026-11-21T10:00:00.000Z",
});

/** A server that answers the sharing calls, and records them. */
function fakeServer(people: People) {
  let current = people;
  const server = {
    people: vi.fn(async () => current),
    invite: vi.fn(async (_id: string, email: string, role: string) => {
      const invite = {
        id: "i1",
        email,
        role,
        createdAt: "2026-11-21T10:00:00.000Z",
        expiresAt: "2026-12-05T10:00:00.000Z",
      };
      current = { ...current, invites: [invite as People["invites"][number]] };
      return invite;
    }),
    cancelInvite: vi.fn(async () => {}),
    setRole: vi.fn(async () => ({})),
    removeMember: vi.fn(async () => {}),
  };
  return server;
}

let root: Root | null = null;
let host: HTMLElement | null = null;

async function show(element: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
}

const text = () => host?.textContent ?? "";
const button = (label: string) =>
  [...host!.querySelectorAll("button")].find(
    (b) => b.textContent === label || b.getAttribute("aria-label") === label,
  )!;

/** Opens a dropdown by its label and picks an option by its text. */
const choose = async (label: string, option: string) => {
  await act(async () =>
    host!
      .querySelector<HTMLButtonElement>(`[role="combobox"][aria-label="${label}"]`)!
      .click(),
  );
  const pick = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (o) => o.textContent === option,
  )!;
  await act(async () => pick.click());
};

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("ShareDialog", () => {
  it("lets the owner invite someone to read, and change a member's role", async () => {
    const server = fakeServer({
      members: [
        {
          userId: sara.id,
          name: sara.name,
          email: sara.email,
          role: "editor",
          addedAt: "2026-11-20T10:00:00.000Z",
        },
      ],
      invites: [],
    });
    await show(
      <ShareDialog
        server={server as unknown as Server}
        project={project("owner")}
        me={owner}
        onLeft={() => {}}
        onClose={() => {}}
      />,
    );
    expect(text()).toContain("Leon Grient (you)");
    expect(text()).toContain("sara@example.edu");

    const email = host!.querySelector<HTMLInputElement>('input[type="email"]')!;
    await act(async () => {
      // React reads the value through the input's own setter.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        email,
        "Anna@Example.edu",
      );
      email.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await choose("Role of the person you invite", "Can read");
    await act(async () => button("Invite").click());
    expect(server.invite).toHaveBeenCalledWith("p1", "Anna@Example.edu", "viewer");
    expect(text()).toContain("Invite sent to anna@example.edu.");
    expect(text()).toContain("Invited · can read");

    await choose("Sara Okafor's role", "Can read");
    expect(server.setRole).toHaveBeenCalledWith("p1", sara.id, "viewer");

    await act(async () => button("Remove Sara Okafor").click());
    expect(server.removeMember).toHaveBeenCalledWith("p1", sara.id);
  });

  it("shows a member who is in the project, and lets them leave", async () => {
    const server = fakeServer({
      members: [
        {
          userId: sara.id,
          name: sara.name,
          role: "editor",
          addedAt: "2026-11-20T10:00:00.000Z",
        },
        {
          userId: "u-anna",
          name: "Anna Berg",
          role: "viewer",
          addedAt: "2026-11-20T11:00:00.000Z",
        },
      ],
      invites: [],
    });
    const onLeft = vi.fn();
    await show(
      <ShareDialog
        server={server as unknown as Server}
        project={project("editor")}
        me={sara}
        onLeft={onLeft}
        onClose={() => {}}
      />,
    );
    expect(text()).toContain("Leon Grient owns this project");
    expect(text()).toContain("You can edit it.");
    expect(text()).toContain("Anna Berg");
    expect(text()).toContain("Can read");
    expect(host!.querySelector('input[type="email"]')).toBeNull();
    expect(host!.querySelector('[role="combobox"]')).toBeNull();

    await act(async () => button("Leave project").click());
    expect(text()).toContain("Leave “Research notes”?");
    await act(async () => button("Leave project").click());
    expect(server.removeMember).toHaveBeenCalledWith("p1", sara.id);
    expect(onLeft).toHaveBeenCalled();
  });
});
