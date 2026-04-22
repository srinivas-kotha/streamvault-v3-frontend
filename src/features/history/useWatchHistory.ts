/**
 * useWatchHistory — watch history state hook (Phase 8).
 *
 * Loads the last 50 items from /api/history (with localStorage fallback)
 * on mount. Exposes `record()` for playback components to log progress.
 */
import { useState, useEffect, useCallback } from "react";
import { fetchHistory, recordHistory, removeHistoryItem } from "../../api/history";
import type { HistoryItem, RecordHistoryBody, ContentType } from "../../api/schemas";

export interface UseWatchHistoryReturn {
  history: HistoryItem[];
  loading: boolean;
  error: string | null;
  record: (contentId: number, body: RecordHistoryBody) => Promise<void>;
  remove: (contentId: number, contentType: ContentType) => void;
  reload: () => Promise<void>;
}

export function useWatchHistory(): UseWatchHistoryReturn {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchHistory();
      setHistory(items);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load watch history",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const record = useCallback(
    async (contentId: number, body: RecordHistoryBody): Promise<void> => {
      // Optimistic: update in-memory immediately.
      const now = new Date().toISOString();
      setHistory((prev) => {
        const filtered = prev.filter(
          (h) =>
            !(
              h.content_type === body.content_type && h.content_id === contentId
            ),
        );
        const updated: HistoryItem = {
          id: -Date.now(),
          content_type: body.content_type,
          content_id: contentId,
          content_name: body.content_name ?? null,
          content_icon: body.content_icon ?? null,
          progress_seconds: body.progress_seconds,
          duration_seconds: body.duration_seconds,
          watched_at: now,
        };
        return [updated, ...filtered].slice(0, 50);
      });

      await recordHistory(contentId, body);
    },
    [],
  );

  const remove = useCallback(
    (contentId: number, contentType: ContentType): void => {
      setHistory((prev) =>
        prev.filter(
          (h) =>
            !(h.content_type === contentType && h.content_id === contentId),
        ),
      );
      removeHistoryItem(contentId, contentType);
    },
    [],
  );

  return { history, loading, error, record, remove, reload };
}
