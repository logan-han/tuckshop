import { orderAmount, round2, type Selection } from './pricing';
import { formatShort, WEEKDAYS, weekdayOf } from './schedule';

/**
 * What goes in the bag: a lunch for every date of each chosen weekday (1 = Monday ... 5 = Friday),
 * plus a lunch of its own for any single date that should differ.
 */
export interface Bags {
  byDay: Record<number, Selection[]>;
  byDate: Record<string, Selection[]>;
}

export const EMPTY_BAGS: Bags = { byDay: {}, byDate: {} };

/** Which bag is meant: every date of a weekday, or one date on its own. */
export type BagRef = { day: number; date?: undefined } | { date: string; day?: undefined };

/** Whether this date has a lunch of its own rather than its weekday's. */
export function hasOwnBag(bags: Bags, date: string): boolean {
  return (bags.byDate[date]?.length ?? 0) > 0;
}

/** The food for a date: its own bag when it has one, otherwise its weekday's. */
export function selectionsForDate(bags: Bags, date: string): Selection[] {
  return bags.byDate[date] ?? bags.byDay[weekdayOf(date)] ?? [];
}

/** What a bag holds right now; a date without its own lunch shows its weekday's. */
export function bagFor(bags: Bags, ref: BagRef): Selection[] {
  return ref.date === undefined ? (bags.byDay[ref.day] ?? []) : selectionsForDate(bags, ref.date);
}

/** Replaces one bag. Emptying a date's own bag hands the date back to its weekday. */
export function setBag(bags: Bags, ref: BagRef, selections: Selection[]): Bags {
  if (ref.date === undefined) {
    return { ...bags, byDay: { ...bags.byDay, [ref.day]: selections } };
  }
  const byDate = { ...bags.byDate };
  if (selections.length === 0) delete byDate[ref.date];
  else byDate[ref.date] = selections;
  return { ...bags, byDate };
}

/** Planned dates that would get no lunch: nothing of their own and nothing for their weekday. */
export function datesWithoutFood(bags: Bags, dates: string[]): string[] {
  return dates.filter((date) => selectionsForDate(bags, date).length === 0);
}

/** Planned dates with a lunch of their own, in date order. */
export function ownBagDates(bags: Bags, dates: string[]): string[] {
  return dates.filter((date) => hasOwnBag(bags, date));
}

/** Puts one weekday's bag on every other chosen weekday too. Dates with their own lunch keep it. */
export function copyToAllDays(bags: Bags, from: number, weekdays: number[]): Bags {
  const source = bags.byDay[from] ?? [];
  const byDay = Object.fromEntries(weekdays.map((day) => [day, source])) as Record<
    number,
    Selection[]
  >;
  return { ...bags, byDay };
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Names the dates still without food: a weekday when every one of its dates is empty
 * ("Fridays"), otherwise the dates themselves ("Thu 9 Oct and Thu 23 Oct").
 */
export function describeMissing(missing: string[], dates: string[]): string {
  const gone = new Set(missing);
  const wholeDays: string[] = [];
  const singles: string[] = [];
  for (const weekday of WEEKDAYS) {
    const ofDay = dates.filter((date) => weekdayOf(date) === weekday.value);
    if (ofDay.length === 0) continue;
    if (ofDay.every((date) => gone.has(date))) wholeDays.push(`${weekday.long}s`);
    else singles.push(...ofDay.filter((date) => gone.has(date)));
  }
  singles.sort();
  const shown = singles.length > 4 ? singles.slice(0, 3) : singles;
  const parts = [...wholeDays, ...shown.map(formatShort)];
  if (singles.length > 4) parts.push(`${singles.length - 3} more dates`);
  return joinAnd(parts);
}

export interface PlanTotals {
  lunches: number;
  items: number;
  fees: number;
  total: number;
}

/** The whole plan costed date by date, since dates can carry different food. */
export function planTotals(bags: Bags, dates: string[], feePerOrder: number): PlanTotals {
  let lunches = 0;
  let items = 0;
  for (const date of dates) {
    const selections = selectionsForDate(bags, date);
    if (selections.length === 0) continue;
    lunches += 1;
    items += orderAmount(selections);
  }
  const fees = round2(lunches * feePerOrder);
  return { lunches, items: round2(items), fees, total: round2(items + fees) };
}
