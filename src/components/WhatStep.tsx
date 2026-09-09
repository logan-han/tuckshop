import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { describeError } from '../api/errors';
import { getMenu } from '../api/flexischools';
import { getFulfillmentDatesFor } from '../api/lookup';
import type { FulfillmentDate, Menu, MenuItem, Student, StudentService } from '../api/types';
import { formatMoney, missingChoices, type Selection } from '../engine/pricing';
import { formatShort, WEEKDAYS, weekdayOf } from '../engine/schedule';
import {
  bagFor,
  copyToAllDays,
  datesWithoutFood,
  describeMissing,
  hasOwnBag,
  selectionsForDate,
  setBag,
  type BagRef,
  type Bags,
} from '../engine/selections';
import ItemDialog from './ItemDialog';

interface Props {
  student: Student;
  service: StudentService;
  /** Planned dates, ascending. */
  dates: string[];
  bags: Bags;
  onChange: (bags: Bags) => void;
  /** Takes a date out of the plan altogether. */
  onSkipDate: (date: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onError: (error: unknown) => void;
}

interface Calendar {
  /** Which student/service/dates this belongs to; a stale load is simply ignored. */
  key: string;
  entries: Map<string, FulfillmentDate> | null;
  error: string | null;
}

interface MenuLoad {
  menu: Menu | null;
  error: string | null;
}

/** Menus already fetched for this student/service/dates, by planned date. */
interface Menus {
  key: string;
  byDate: Record<string, MenuLoad>;
}

function orderable(entry: FulfillmentDate | undefined): entry is FulfillmentDate {
  return !!entry && !entry.closureReason && !entry.hasCutOffTimePassed;
}

/** "nothing yet", "2 × Chicken Tenders (2)", "3 items" */
function summarise(items: Selection[]): string {
  if (items.length === 0) return 'nothing yet';
  if (items.length > 1) return `${items.length} items`;
  const [only] = items;
  return `${only.quantity > 1 ? `${only.quantity} × ` : ''}${only.item.name.split(' - ')[0]}`;
}

function nameOf(day: number): string {
  return WEEKDAYS.find((w) => w.value === day)?.long ?? '';
}

export default function WhatStep({
  student,
  service,
  dates,
  bags,
  onChange,
  onSkipDate,
  onBack,
  onContinue,
  onError,
}: Props) {
  const weekdays = useMemo(() => [...new Set(dates.map(weekdayOf))].sort(), [dates]);
  const [target, setTarget] = useState<BagRef>({ day: weekdays[0] ?? 4 });

  // Whatever was being looked at, kept on a date and weekday that are still in the plan.
  const ref = useMemo<BagRef>(() => {
    if (target.date !== undefined && dates.includes(target.date)) return target;
    const day = target.date !== undefined ? weekdayOf(target.date) : target.day;
    return { day: weekdays.includes(day) ? day : (weekdays[0] ?? 4) };
  }, [target, dates, weekdays]);
  const day = ref.date === undefined ? ref.day : weekdayOf(ref.date);
  const dayName = nameOf(day);
  const dayDates = useMemo(() => dates.filter((date) => weekdayOf(date) === day), [dates, day]);
  const items = bagFor(bags, ref);
  const own = ref.date !== undefined && hasOwnBag(bags, ref.date);

  const key = `${student.studentKey}|${service.supplierServiceKey}|${dates.join(',')}`;
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [menus, setMenus] = useState<Menus>({ key, byDate: {} });
  const inFlight = useRef(new Set<string>());
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<MenuItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await getFulfillmentDatesFor(
          student.studentKey,
          service.supplierServiceKey,
          dates,
        );
        if (!cancelled) setCalendar({ key, entries, error: null });
      } catch (e) {
        if (cancelled) return;
        onError(e);
        setCalendar({ key, entries: null, error: describeError(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, student, service, dates, onError]);

  const cal = calendar && calendar.key === key ? calendar : null;

  /** The date whose menu is shown: the date itself, or the first orderable date of the weekday. */
  const menuDate = useMemo(() => {
    if (!cal?.entries) return null;
    const entries = cal.entries;
    if (ref.date !== undefined) return orderable(entries.get(ref.date)) ? ref.date : null;
    return dayDates.find((date) => orderable(entries.get(date))) ?? null;
  }, [cal, ref, dayDates]);

  const loaded = menus.key === key && menuDate ? menus.byDate[menuDate] : undefined;

  useEffect(() => {
    if (!menuDate || loaded) return;
    const entry = cal?.entries?.get(menuDate);
    if (!entry) return;
    const flight = `${key}|${menuDate}`;
    if (inFlight.current.has(flight)) return;
    inFlight.current.add(flight);
    (async () => {
      let load: MenuLoad;
      try {
        const menu = await getMenu({
          supplierKey: service.supplierKey,
          supplierServiceKey: service.supplierServiceKey,
          studentKey: student.studentKey,
          schoolKey: student.schoolKey,
          dueDate: entry.fulfillmentDate,
        });
        load = { menu, error: null };
      } catch (e) {
        onError(e);
        load = { menu: null, error: describeError(e) };
      }
      inFlight.current.delete(flight);
      // Worth keeping even if the parent has moved on to another date meanwhile.
      setMenus((current) =>
        current.key === key
          ? { key, byDate: { ...current.byDate, [menuDate]: load } }
          : { key, byDate: { [menuDate]: load } },
      );
    })();
  }, [key, menuDate, loaded, cal, student, service, onError]);

  const closeDialog = useCallback(() => setEditing(null), []);

  const categories = useMemo(() => {
    if (!loaded?.menu) return [];
    const needle = query.trim().toLowerCase();
    return loaded.menu.itemCategories
      .map((category) => ({
        ...category,
        items: category.items.filter(
          (item) =>
            !needle ||
            item.name.toLowerCase().includes(needle) ||
            category.name.toLowerCase().includes(needle),
        ),
      }))
      .filter((category) => category.items.length > 0);
  }, [loaded, query]);

  let blocker: string | null = null;
  if (cal?.entries && !menuDate) {
    if (ref.date === undefined) {
      blocker = 'None of the chosen dates can be ordered for. Check the days and term dates.';
    } else {
      const entry = cal.entries.get(ref.date);
      blocker = !entry
        ? 'This date is not on the canteen calendar.'
        : entry.closureReason
          ? `The canteen is closed on this date: ${entry.closureReason}.`
          : 'The cut-off time for this date has passed.';
    }
  }

  /** What a date chip says under the date: its own lunch, or why it cannot be ordered for. */
  function dateNote(date: string): string | null {
    if (hasOwnBag(bags, date)) return summarise(bags.byDate[date]);
    if (!cal?.entries) return null;
    const entry = cal.entries.get(date);
    if (!entry) return 'not on the calendar';
    if (entry.closureReason) return 'closed';
    if (entry.hasCutOffTimePassed) return 'too late';
    return null;
  }

  const missing = datesWithoutFood(bags, dates);
  const incomplete = [...new Set(dates.flatMap((date) => selectionsForDate(bags, date)))].filter(
    (s) => missingChoices(s).length > 0,
  );
  const emptyDays = weekdays.filter((d) => (bags.byDay[d]?.length ?? 0) === 0);
  const otherDaysEmpty =
    weekdays.length > 1 &&
    emptyDays.length === weekdays.length - 1 &&
    (bags.byDay[day]?.length ?? 0) > 0;

  function save(selection: Selection) {
    const index = items.findIndex((s) => s.item.itemKey === selection.item.itemKey);
    const next =
      index === -1 ? [...items, selection] : items.map((s, i) => (i === index ? selection : s));
    onChange(setBag(bags, ref, next));
    setEditing(null);
  }

  function remove(itemKey: string) {
    onChange(
      setBag(
        bags,
        ref,
        items.filter((s) => s.item.itemKey !== itemKey),
      ),
    );
    setEditing(null);
  }

  const serviceName = service.supplierServiceName.trim();

  return (
    <section aria-labelledby="what-title">
      <div className="step-heading">
        <span className="step-heading__number" aria-hidden="true">
          3
        </span>
        <h2 id="what-title" className="title">
          What goes in the bag?
        </h2>
      </div>

      {weekdays.length > 1 && (
        <div className="field">
          <span className="field__label" id="day-tabs-label">
            Each day can have its own lunch
          </span>
          <div className="chips" role="group" aria-labelledby="day-tabs-label">
            {weekdays.map((d) => {
              const count = bags.byDay[d]?.length ?? 0;
              return (
                <button
                  key={d}
                  type="button"
                  className="chip"
                  aria-pressed={d === day}
                  onClick={() => setTarget({ day: d })}
                >
                  {nameOf(d)}s
                  <span className="hint">
                    {count === 0 ? 'nothing yet' : `${count} ${count === 1 ? 'item' : 'items'}`}
                  </span>
                </button>
              );
            })}
          </div>
          {otherDaysEmpty && (
            <p className="hint">
              <button
                type="button"
                className="link-button"
                onClick={() => onChange(copyToAllDays(bags, day, weekdays))}
              >
                Use {dayName}’s lunch for every day
              </button>
            </p>
          )}
        </div>
      )}

      {dayDates.length > 1 && (
        <div className="field">
          <span className="field__label" id="date-chips-label">
            Lunch for
          </span>
          <div className="chips" role="group" aria-labelledby="date-chips-label">
            <button
              type="button"
              className="chip"
              aria-pressed={ref.date === undefined}
              onClick={() => setTarget({ day })}
            >
              Every {dayName}
              <span className="hint">{summarise(bags.byDay[day] ?? [])}</span>
            </button>
            {dayDates.map((date) => {
              const note = dateNote(date);
              return (
                <button
                  key={date}
                  type="button"
                  className="chip"
                  data-own={hasOwnBag(bags, date) || undefined}
                  aria-pressed={ref.date === date}
                  onClick={() => setTarget({ date })}
                >
                  {formatShort(date)}
                  {note && <span className="hint">{note}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {cal?.error && (
        <p className="notice notice--bad" role="alert">
          {cal.error}
        </p>
      )}
      {!cal && <p className="hint">Checking the canteen calendar…</p>}
      {blocker && (
        <p className="notice notice--warn" role="alert">
          {blocker}
          {ref.date !== undefined && (
            <>
              {' '}
              <button type="button" className="link-button" onClick={() => onSkipDate(ref.date)}>
                Skip this date
              </button>
            </>
          )}
        </p>
      )}
      {menuDate && !loaded && <p className="hint">Loading the menu…</p>}
      {loaded?.error && (
        <p className="notice notice--bad" role="alert">
          {loaded.error}
        </p>
      )}

      {loaded?.menu && menuDate && (
        <>
          <p className="hint" style={{ marginBottom: '1rem' }}>
            {ref.date === undefined ? (
              <>
                Showing the {serviceName} menu for {formatShort(menuDate)}
                {dayDates.length > 1 ? `, the first ${dayName}` : ''}. Daily specials change from
                day to day; every date gets checked before anything is ordered.
                {dayDates.length > 1 ? ' Pick a date above to give it something different.' : ''}
              </>
            ) : own ? (
              <>
                {formatShort(menuDate)} has a lunch of its own.{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onChange(setBag(bags, ref, []))}
                >
                  Same as every {dayName}
                </button>
                {' · '}
                <button type="button" className="link-button" onClick={() => onSkipDate(menuDate)}>
                  Skip this date
                </button>
              </>
            ) : (
              <>
                Showing the {serviceName} menu for {formatShort(menuDate)}. This date gets every{' '}
                {dayName}’s lunch; change anything here to give it its own.{' '}
                <button type="button" className="link-button" onClick={() => onSkipDate(menuDate)}>
                  Skip this date
                </button>
              </>
            )}
          </p>
          <div className="field menu-search">
            <label className="visually-hidden" htmlFor="menu-search">
              Search the menu
            </label>
            <input
              id="menu-search"
              className="input"
              type="search"
              placeholder="Search the menu"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {categories.map((category) => (
            <section
              className="menu-category"
              key={category.key}
              aria-labelledby={`cat-${category.key}`}
            >
              <h3 className="menu-category__title" id={`cat-${category.key}`}>
                {category.name}
              </h3>
              {category.items.map((item) => {
                const chosen = items.find((s) => s.item.itemKey === item.itemKey);
                const soldOut = !item.inStock;
                return (
                  <button
                    key={item.itemKey}
                    type="button"
                    className="menu-item"
                    data-selected={!!chosen}
                    disabled={soldOut && !chosen}
                    onClick={() => setEditing(item)}
                  >
                    <span className="menu-item__name">
                      {item.name}
                      {chosen && <span className="badge">{chosen.quantity}</span>}
                    </span>
                    <span className="menu-item__price">{formatMoney(item.itemPrice)}</span>
                    {(soldOut || item.optionSets.length > 0) && (
                      <span className="menu-item__meta">
                        {soldOut
                          ? item.unavailabilityMessage?.trim() || 'Sold out on this date'
                          : item.optionSets.map((set) => set.name).join(', ')}
                      </span>
                    )}
                  </button>
                );
              })}
            </section>
          ))}
          {categories.length === 0 && (
            <p className="hint">Nothing on the menu matches “{query}”.</p>
          )}
        </>
      )}

      {editing && (
        <ItemDialog
          key={`${ref.date ?? ref.day}-${editing.itemKey}`}
          item={editing}
          existing={items.find((s) => s.item.itemKey === editing.itemKey) ?? null}
          onSave={save}
          onRemove={() => remove(editing.itemKey)}
          onClose={closeDialog}
        />
      )}

      <div className="actions">
        <button type="button" className="button button--quiet" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="button"
          disabled={missing.length > 0 || incomplete.length > 0}
          onClick={onContinue}
        >
          Check every date
        </button>
        {missing.length > 0 && (weekdays.length > 1 || missing.length < dates.length) && (
          <span className="hint">Still nothing for {describeMissing(missing, dates)}.</span>
        )}
        {incomplete.length > 0 && (
          <span className="hint">
            Finish choosing options for {incomplete.map((s) => s.item.name).join(', ')}.
          </span>
        )}
      </div>
    </section>
  );
}
