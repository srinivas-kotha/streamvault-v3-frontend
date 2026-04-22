/**
 * useSortedChannels — derive a sorted channel list for the Live page (Task 4.4)
 *
 * Supports three sort modes:
 *  - "number":   numeric compare on `channel.num` (natural TV channel order).
 *  - "name":     `localeCompare` on `channel.name` (A–Z, locale-aware).
 *  - "category": `localeCompare` on the resolved category NAME (D7a — never
 *                the UUID `categoryId`, which gives meaningless ordering).
 *
 * Categories are passed in as an optional `{id, name}[]` list (Task 4.1
 * `fetchCategories`). Channels whose `categoryId` doesn't map to a category
 * fall back to the raw `categoryId` string so they still cluster together
 * rather than mixing with unrelated channels.
 *
 * The hook is pure (no side effects) and memoised on the input refs so the
 * sorted array identity is stable across re-renders when inputs don't change.
 */
import { useMemo } from "react";
import type { Channel } from "../../api/schemas";

export type ChannelSortKey = "number" | "name" | "category";

export interface Category {
  id: string;
  name: string;
}

export function useSortedChannels(
  channels: Channel[],
  sortBy: ChannelSortKey,
  categories: Category[] = [],
): Channel[] {
  return useMemo(() => {
    if (channels.length === 0) return channels;

    // Build ID→name lookup once per render for category sort.
    const nameById = new Map<string, string>();
    for (const c of categories) nameById.set(c.id, c.name);

    const resolveCategoryName = (channel: Channel): string =>
      nameById.get(channel.categoryId) ?? channel.categoryId;

    // Copy before sort — never mutate the input (React state).
    const out = [...channels];

    switch (sortBy) {
      case "number":
        out.sort((a, b) => (a.num ?? 0) - (b.num ?? 0));
        break;
      case "name":
        out.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "category":
        // D7a: sort by resolved category NAME, not UUID string.
        // Secondary sort by channel number so grouped channels stay in
        // human-predictable order within a category.
        out.sort((a, b) => {
          const diff = resolveCategoryName(a).localeCompare(
            resolveCategoryName(b),
          );
          return diff !== 0 ? diff : (a.num ?? 0) - (b.num ?? 0);
        });
        break;
    }

    return out;
  }, [channels, sortBy, categories]);
}
