import { Face } from "./Face";
import type { Peer } from "@/lib/presence";
import { t } from "@scholarkit/i18n";

/** "Thesis/Pilot study plan.md" as "Pilot study plan". */
const pageName = (path: string) =>
  path
    .slice(path.lastIndexOf("/") + 1)
    .replace(/\.md$/i, "")
    .trim();

/** The faces of the others who have the project open, with the page each one is on. */
export function HereNow({ peers, me }: { peers: Peer[]; me: string }) {
  // One face per person, however many windows they have open; you don't see yourself.
  const people = new Map<string, Peer>();
  for (const peer of peers) {
    if (peer.user.id !== me && !people.has(peer.user.id))
      people.set(peer.user.id, peer);
  }
  if (people.size === 0) return null;
  const shown = [...people.values()].slice(0, 4);
  const more = people.size - shown.length;
  const names = [...people.values()].map((peer) => peer.user.name).join(", ");
  return (
    <span
      className="mr-1 flex items-center -space-x-1"
      aria-label={t("Here now: {names}", { names })}
    >
      {shown.map((peer) => (
        <span
          key={peer.user.id}
          title={
            peer.page ? `${peer.user.name} · ${pageName(peer.page)}` : peer.user.name
          }
          className="rounded-full ring-2 ring-background"
        >
          <Face userId={peer.user.id} name={peer.user.name} />
        </span>
      ))}
      {more > 0 && (
        <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-semibold ring-2 ring-background">
          +{more}
        </span>
      )}
    </span>
  );
}
