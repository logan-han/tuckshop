import type { Selection } from '../engine/pricing';
import type { Bags } from '../engine/selections';

export type DraftStep = 'who' | 'when' | 'what' | 'check';

/**
 * A bag still being filled, kept for the tab: a pull-to-refresh, a tap on the logo or a phone
 * reloading the tab after a top-up in Flexischools would otherwise empty it.
 */
export interface Draft {
  /** Whose bag it is: batchOwner(student, service). */
  owner: string;
  bags: Bags;
  step: DraftStep;
  savedAt: number;
}

const STORAGE_KEY = 'tuckshop.draft';
const STEPS: readonly string[] = ['who', 'when', 'what', 'check'];
/** A bag left overnight is more likely forgotten than wanted. */
const KEEP_FOR = 24 * 60 * 60 * 1000;

function isSelection(value: unknown): value is Selection {
  const s = value as Selection | null;
  return (
    !!s &&
    typeof s.item?.itemKey === 'string' &&
    typeof s.item.itemPrice === 'number' &&
    Array.isArray(s.item.optionSets) &&
    typeof s.quantity === 'number' &&
    Array.isArray(s.options) &&
    Array.isArray(s.questions)
  );
}

function isBagMap(value: unknown): value is Record<string, Selection[]> {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.values(value).every((list) => Array.isArray(list) && list.every(isSelection))
  );
}

export function holdsFood(bags: Bags): boolean {
  return [...Object.values(bags.byDay), ...Object.values(bags.byDate)].some(
    (list) => list.length > 0,
  );
}

/** The saved draft, unless there is none, it is from an older version of the app, or it is stale. */
export function loadDraft(now: number): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Draft> | null;
    if (
      !saved ||
      typeof saved.owner !== 'string' ||
      typeof saved.step !== 'string' ||
      !STEPS.includes(saved.step) ||
      typeof saved.savedAt !== 'number' ||
      now - saved.savedAt > KEEP_FOR ||
      !isBagMap(saved.bags?.byDay) ||
      !isBagMap(saved.bags?.byDate)
    ) {
      return null;
    }
    return saved as Draft;
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable or full; the bag just does not survive a reload.
  }
}

export function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was kept, then.
  }
}
