import { cn } from "@scholarkit/editor/lib/cn";
import { colorFor, initials } from "@/lib/people";

/** Someone's initials in their own color. */
export function Face({
  userId,
  name,
  className,
}: {
  userId: string;
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-6 flex-none place-items-center rounded-full text-[10px] font-semibold text-white",
        className,
      )}
      style={{ background: colorFor(userId) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
