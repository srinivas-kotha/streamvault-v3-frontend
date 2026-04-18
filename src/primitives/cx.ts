/**
 * cx — compose className strings safely (Task 1.5)
 *
 * Joins truthy string parts, splits multi-token strings, deduplicates tokens,
 * drops nullish/empty/false values. Exists so primitives can merge variant +
 * size + focus-ring + user className without collisions or stray whitespace.
 *
 * Usage:
 *   cx("btn", variant, size, className)
 *   // → "btn btn--primary btn--md my-class"
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  const seen = new Set<string>();
  for (const part of parts) {
    if (typeof part !== "string") continue;
    for (const tok of part.split(/\s+/)) {
      if (tok.length > 0) seen.add(tok);
    }
  }
  return Array.from(seen).join(" ");
}
