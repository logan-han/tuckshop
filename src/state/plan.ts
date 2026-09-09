import { listDates, presetsFor, TERM_PRESETS, type ExcludedDate } from '../engine/schedule';

export interface Plan {
  weekdays: number[];
  /** A TERM_PRESETS id, or "custom". */
  presetId: string;
  from: string;
  to: string;
  excluded: ExcludedDate[];
}

const STORAGE_KEY = 'tuckshop.plan';

/** The current or next term for this school, falling back to the last one we know. */
export function currentPreset(today: string, schoolName?: string | null) {
  const presets = presetsFor(schoolName);
  return presets.find((p) => p.to >= today) ?? presets[presets.length - 1];
}

export function defaultPlan(today: string, schoolName?: string | null): Plan {
  const preset = currentPreset(today, schoolName);
  return {
    weekdays: [],
    presetId: preset.id,
    from: preset.from,
    to: preset.to,
    excluded: preset.excluded,
  };
}

export function applyPreset(plan: Plan, presetId: string): Plan {
  const preset = TERM_PRESETS.find((p) => p.id === presetId);
  if (!preset) return { ...plan, presetId: 'custom' };
  return { ...plan, presetId, from: preset.from, to: preset.to, excluded: preset.excluded };
}

/**
 * Keeps a plan pointed at a term the student's school actually has. A custom range is left
 * alone; a preset from another school becomes this school's current term.
 */
export function retargetPlan(plan: Plan, today: string, schoolName?: string | null): Plan {
  if (plan.presetId === 'custom') return plan;
  if (presetsFor(schoolName).some((p) => p.id === plan.presetId)) return plan;
  return applyPreset(plan, currentPreset(today, schoolName).id);
}

/** Takes a date out of the plan; a date already skipped is left as it is. */
export function skipDate(plan: Plan, date: string, reason = 'Skipped'): Plan {
  if (plan.excluded.some((e) => e.date === date)) return plan;
  const excluded = [...plan.excluded, { date, reason }].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return { ...plan, excluded };
}

export function loadPlan(today: string, schoolName?: string | null): Plan {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPlan(today, schoolName);
    const saved = JSON.parse(raw) as Partial<Plan>;
    const base = defaultPlan(today, schoolName);
    const plan: Plan = {
      weekdays: Array.isArray(saved.weekdays) ? saved.weekdays : base.weekdays,
      presetId: typeof saved.presetId === 'string' ? saved.presetId : base.presetId,
      from: typeof saved.from === 'string' ? saved.from : base.from,
      to: typeof saved.to === 'string' ? saved.to : base.to,
      excluded: Array.isArray(saved.excluded) ? saved.excluded : base.excluded,
    };
    // A saved range that has completely passed is stale; start from the current term instead.
    return plan.to < today ? { ...base, weekdays: plan.weekdays } : plan;
  } catch {
    return defaultPlan(today, schoolName);
  }
}

export function savePlan(plan: Plan): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  } catch {
    // Storage unavailable; the plan just is not remembered for next time.
  }
}

/** The dates this plan will order for, from today onwards. */
export function planDates(plan: Plan, today: string): string[] {
  return listDates({
    from: plan.from,
    to: plan.to,
    weekdays: plan.weekdays,
    excluded: plan.excluded.map((e) => e.date),
    notBefore: today,
  });
}
