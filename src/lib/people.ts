/**
 * How people show up in a shared project: a color of their own, which
 * their face, their cursor and their selection use, and their initials.
 */

/** Deep enough for white initials on top, and apart from each other. */
const COLORS = ["#623E64", "#0F5B62", "#9A4A1C", "#3B4A7A", "#4A5E2C", "#8A5A12"];

/** The same color for the same person, in every window. */
export function colorFor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length]!;
}

/** "AB" for Anna Berg, "A" for Anna. Titles such as "Prof." don't count. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word && !word.endsWith("."));
  if (words.length === 0) return "?";
  const first = words[0]![0]!;
  const last = words.length > 1 ? words[words.length - 1]![0]! : "";
  return (first + last).toUpperCase();
}
