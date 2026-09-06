// Calendar maths for "every Thursday for the term". Dates are plain YYYY-MM-DD strings
// throughout so no time-zone conversion can move a lunch onto the wrong day.

export const WEEKDAYS = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
] as const;

export type Weekday = (typeof WEEKDAYS)[number]['value'];

export interface ExcludedDate {
  date: string;
  reason: string;
}

export interface TermPreset {
  id: string;
  label: string;
  from: string;
  to: string;
  excluded: ExcludedDate[];
}

// Edit these for your own school. Public holidays that fall on a school day are listed too,
// because the canteen calendar does not always know about them.
export const TERM_PRESETS: TermPreset[] = [
  {
    id: 'tintern-2026-t3',
    label: 'Tintern Grammar, Term 3 2026',
    from: '2026-07-14',
    to: '2026-09-17',
    excluded: [{ date: '2026-08-21', reason: 'Mid-term break' }],
  },
  {
    id: 'tintern-2026-t4',
    label: 'Tintern Grammar, Term 4 2026',
    from: '2026-10-05',
    to: '2026-12-09',
    excluded: [
      { date: '2026-11-02', reason: 'Mid-term break' },
      { date: '2026-11-03', reason: 'Melbourne Cup Day' },
    ],
  },
  {
    id: 'vic-2026-t4',
    label: 'Victorian government schools, Term 4 2026',
    from: '2026-10-05',
    to: '2026-12-18',
    excluded: [{ date: '2026-11-03', reason: 'Melbourne Cup Day' }],
  },
  // 2027 from tintern.vic.edu.au/about/term-dates (fetched 2026-09-07). Term 1 starts a day
  // earlier for Years 7, 10, 11 and 12. ANZAC Day 2027 is a Sunday and the 29 November
  // student-free day is secondary only, so neither is excluded here.
  {
    id: 'tintern-2027-t1',
    label: 'Tintern Grammar, Term 1 2027',
    from: '2027-02-02',
    to: '2027-03-25',
    excluded: [{ date: '2027-03-08', reason: 'Labour Day' }],
  },
  {
    id: 'tintern-2027-t2',
    label: 'Tintern Grammar, Term 2 2027',
    from: '2027-04-13',
    to: '2027-06-17',
    excluded: [{ date: '2027-06-14', reason: 'King’s Birthday' }],
  },
  {
    id: 'tintern-2027-t3',
    label: 'Tintern Grammar, Term 3 2027',
    from: '2027-07-13',
    to: '2027-09-16',
    excluded: [{ date: '2027-08-20', reason: 'Mid-term break' }],
  },
  {
    id: 'tintern-2027-t4',
    label: 'Tintern Grammar, Term 4 2027',
    from: '2027-10-04',
    to: '2027-12-09',
    excluded: [
      { date: '2027-11-01', reason: 'Mid-term break' },
      { date: '2027-11-02', reason: 'Melbourne Cup Day' },
    ],
  },
];

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = ISO.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 1 = Monday ... 7 = Sunday */
export function weekdayOf(iso: string): number {
  const day = toUtc(iso).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

/** The Monday on or before the given date. */
export function mondayOf(iso: string): string {
  return addDays(iso, 1 - weekdayOf(iso));
}

/** Today's date in Melbourne, whatever the browser's zone is. */
export function todayIso(now: Date = new Date(), timeZone = 'Australia/Melbourne'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export interface ScheduleInput {
  from: string;
  to: string;
  weekdays: Iterable<number>;
  excluded?: Iterable<string>;
  /** Dates on or before this are dropped (already past). */
  notBefore?: string;
}

/** Every matching weekday between from and to inclusive, ascending, minus exclusions. */
export function listDates({
  from,
  to,
  weekdays,
  excluded = [],
  notBefore,
}: ScheduleInput): string[] {
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return [];
  const wanted = new Set(weekdays);
  const skip = new Set(excluded);
  const dates: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (!wanted.has(weekdayOf(day))) continue;
    if (skip.has(day)) continue;
    if (notBefore && day < notBefore) continue;
    dates.push(day);
  }
  return dates;
}

/** Distinct Mondays covering the given dates, for one fulfilment-date lookup per week. */
export function weeksCovering(dates: Iterable<string>): string[] {
  return [...new Set([...dates].map(mondayOf))].sort();
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Thu 10 Sep" (fixed English names, so every ICU build agrees) */
export function formatShort(iso: string): string {
  const [, month, day] = iso.split('-').map(Number);
  return `${DAY_NAMES[weekdayOf(iso) - 1].slice(0, 3)} ${day} ${MONTH_NAMES[month - 1].slice(0, 3)}`;
}

/** "Thursday 10 September 2026" */
export function formatLong(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return `${DAY_NAMES[weekdayOf(iso) - 1]} ${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** The YYYY-MM-DD part of a Flexischools local date-time such as "2026-09-10T12:40:00". */
export function dateOf(localDateTime: string): string {
  return localDateTime.slice(0, 10);
}

/** "9 Thursdays", "8 lunches, Mon to Thu", "3 lunches, Mon, Wed and Fri" */
export function describeCount(count: number, weekdays: Iterable<number>): string {
  const chosen = WEEKDAYS.filter((w) => new Set(weekdays).has(w.value));
  const lunches = `${count} ${count === 1 ? 'lunch' : 'lunches'}`;
  if (chosen.length === 0) return lunches;
  if (chosen.length === 1) return `${count} ${chosen[0].long}${count === 1 ? '' : 's'}`;
  const consecutive = chosen.every((w, i) => i === 0 || w.value === chosen[i - 1].value + 1);
  if (consecutive) return `${lunches}, ${chosen[0].short} to ${chosen[chosen.length - 1].short}`;
  const names = chosen.map((w) => w.short);
  return `${lunches}, ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
