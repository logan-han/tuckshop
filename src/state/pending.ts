import type { PendingBatch } from '../engine/orders';

/** Unanswered carts by owner, as App holds them. */
export type PendingByOwner = Record<string, PendingBatch>;

/**
 * Carts that got no answer are kept for the tab, not just in memory. The bag now survives a
 * reload, so without them a pull-to-refresh during "Placing…" would bring the parent straight
 * back to a Place button that sends the same orders under new keys, which Flexischools cannot
 * tell from new orders.
 */
const STORAGE_KEY = 'tuckshop.pending';
/** By then the history shows whatever went in, so fresh keys cannot place anything twice. */
const KEEP_FOR = 24 * 60 * 60 * 1000;

function isBatch(value: unknown): value is PendingBatch {
  const batch = value as PendingBatch | null;
  return (
    !!batch &&
    typeof batch.owner === 'string' &&
    !!batch.dates &&
    typeof batch.dates === 'object' &&
    Object.values(batch.dates).every(
      (entry) =>
        !!entry &&
        typeof entry.cartKey === 'string' &&
        typeof entry.requestId === 'string' &&
        Array.isArray(entry.had) &&
        entry.had.every((key) => typeof key === 'string'),
    )
  );
}

export function loadPending(now: number): PendingByOwner {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const saved = JSON.parse(raw) as { savedAt?: unknown; batches?: unknown } | null;
    if (!saved || typeof saved.savedAt !== 'number' || now - saved.savedAt > KEEP_FOR) return {};
    const batches = saved.batches as Record<string, unknown> | null;
    if (!batches || typeof batches !== 'object') return {};
    return Object.fromEntries(
      Object.entries(batches).filter(
        (entry): entry is [string, PendingBatch] =>
          isBatch(entry[1]) && entry[1].owner === entry[0],
      ),
    );
  } catch {
    return {};
  }
}

export function savePending(pending: PendingByOwner, now: number): void {
  try {
    if (Object.keys(pending).length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ savedAt: now, batches: pending }),
      );
    }
  } catch {
    // Storage unavailable; the carts are still held in memory for as long as the page lives.
  }
}
