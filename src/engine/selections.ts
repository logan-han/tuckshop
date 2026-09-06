import { orderAmount, round2, type Selection } from './pricing';
import { weekdayOf } from './schedule';

/** What goes in the bag on each weekday (1 = Monday ... 5 = Friday). */
export type SelectionsByDay = Record<number, Selection[]>;

export function selectionsForDate(byDay: SelectionsByDay, date: string): Selection[] {
  return byDay[weekdayOf(date)] ?? [];
}

/** Chosen weekdays that still have nothing in the bag. */
export function daysWithoutFood(byDay: SelectionsByDay, weekdays: number[]): number[] {
  return weekdays.filter((day) => (byDay[day]?.length ?? 0) === 0);
}

export function withDay(
  byDay: SelectionsByDay,
  day: number,
  selections: Selection[],
): SelectionsByDay {
  return { ...byDay, [day]: selections };
}

/** Puts one weekday's bag on every other chosen weekday too. */
export function copyToAllDays(
  byDay: SelectionsByDay,
  from: number,
  weekdays: number[],
): SelectionsByDay {
  const source = byDay[from] ?? [];
  return Object.fromEntries(weekdays.map((day) => [day, source])) as SelectionsByDay;
}

export interface PlanTotals {
  lunches: number;
  items: number;
  fees: number;
  total: number;
}

/** The whole plan costed date by date, since different weekdays can carry different food. */
export function planTotals(
  byDay: SelectionsByDay,
  dates: string[],
  feePerOrder: number,
): PlanTotals {
  let lunches = 0;
  let items = 0;
  for (const date of dates) {
    const selections = selectionsForDate(byDay, date);
    if (selections.length === 0) continue;
    lunches += 1;
    items += orderAmount(selections);
  }
  const fees = round2(lunches * feePerOrder);
  return { lunches, items: round2(items), fees, total: round2(items + fees) };
}
