import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeError } from '../api/errors';
import { getMenu } from '../api/flexischools';
import { getFulfillmentDatesFor } from '../api/lookup';
import type { Menu, MenuItem, Student, StudentService } from '../api/types';
import { formatMoney, missingChoices, type Selection } from '../engine/pricing';
import { formatShort, WEEKDAYS, weekdayOf } from '../engine/schedule';
import {
  copyToAllDays,
  daysWithoutFood,
  withDay,
  type SelectionsByDay,
} from '../engine/selections';
import ItemDialog from './ItemDialog';

interface Props {
  student: Student;
  service: StudentService;
  /** Planned dates, ascending. */
  dates: string[];
  selections: SelectionsByDay;
  onChange: (selections: SelectionsByDay) => void;
  onBack: () => void;
  onContinue: () => void;
  onError: (error: unknown) => void;
}

interface Loaded {
  /** Which student/service/dates this menu belongs to; a stale load is simply ignored. */
  key: string;
  menu: Menu | null;
  /** The planned date whose menu is shown. */
  date: string | null;
  error: string | null;
}

export default function WhatStep({
  student,
  service,
  dates,
  selections,
  onChange,
  onBack,
  onContinue,
  onError,
}: Props) {
  const weekdays = useMemo(() => [...new Set(dates.map(weekdayOf))].sort(), [dates]);
  const [activeDay, setActiveDay] = useState(weekdays[0] ?? 4);
  const day = weekdays.includes(activeDay) ? activeDay : (weekdays[0] ?? 4);
  const dayDates = useMemo(() => dates.filter((date) => weekdayOf(date) === day), [dates, day]);
  const dayName = WEEKDAYS.find((w) => w.value === day)?.long ?? '';
  const dayItems = selections[day] ?? [];

  const key = `${student.studentKey}|${service.supplierServiceKey}|${dayDates.join(',')}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<MenuItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // The first few weeks are enough to find one orderable date to borrow the menu from.
        const sample = dayDates.slice(0, 10);
        const fulfilment = await getFulfillmentDatesFor(
          student.studentKey,
          service.supplierServiceKey,
          sample,
        );
        const date = sample.find((d) => {
          const entry = fulfilment.get(d);
          return entry && !entry.closureReason && !entry.hasCutOffTimePassed;
        });
        const entry = date ? fulfilment.get(date) : undefined;
        if (!date || !entry) {
          throw new Error(
            'None of the chosen dates can be ordered for. Check the days and term dates.',
          );
        }
        const menu = await getMenu({
          supplierKey: service.supplierKey,
          supplierServiceKey: service.supplierServiceKey,
          studentKey: student.studentKey,
          schoolKey: student.schoolKey,
          dueDate: entry.fulfillmentDate,
        });
        if (!cancelled) setLoaded({ key, menu, date, error: null });
      } catch (e) {
        if (cancelled) return;
        onError(e);
        setLoaded({ key, menu: null, date: null, error: describeError(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, student, service, dayDates, onError]);

  const current = loaded && loaded.key === key ? loaded : null;
  const closeDialog = useCallback(() => setEditing(null), []);

  const categories = useMemo(() => {
    if (!current?.menu) return [];
    const needle = query.trim().toLowerCase();
    return current.menu.itemCategories
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
  }, [current, query]);

  const empty = daysWithoutFood(selections, weekdays);
  const incomplete = weekdays.flatMap((d) =>
    (selections[d] ?? []).filter((s) => missingChoices(s).length > 0),
  );
  const otherDaysEmpty =
    weekdays.length > 1 && empty.length === weekdays.length - 1 && dayItems.length > 0;

  function save(selection: Selection) {
    const index = dayItems.findIndex((s) => s.item.itemKey === selection.item.itemKey);
    const next =
      index === -1
        ? [...dayItems, selection]
        : dayItems.map((s, i) => (i === index ? selection : s));
    onChange(withDay(selections, day, next));
    setEditing(null);
  }

  function remove(itemKey: string) {
    onChange(
      withDay(
        selections,
        day,
        dayItems.filter((s) => s.item.itemKey !== itemKey),
      ),
    );
    setEditing(null);
  }

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
              const count = selections[d]?.length ?? 0;
              const name = WEEKDAYS.find((w) => w.value === d)?.long ?? '';
              return (
                <button
                  key={d}
                  type="button"
                  className="chip"
                  aria-pressed={d === day}
                  onClick={() => setActiveDay(d)}
                >
                  {name}s
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
                onClick={() => onChange(copyToAllDays(selections, day, weekdays))}
              >
                Use {dayName}’s lunch for every day
              </button>
            </p>
          )}
        </div>
      )}

      {current?.error && (
        <p className="notice notice--bad" role="alert">
          {current.error}
        </p>
      )}
      {!current && <p className="hint">Loading the menu…</p>}

      {current?.menu && current.date && (
        <>
          <p className="hint" style={{ marginBottom: '1rem' }}>
            Showing the {service.supplierServiceName.trim()} menu for {formatShort(current.date)}
            {weekdays.length > 1 ? `, the first ${dayName}` : ''}. Daily specials change from day to
            day; every date gets checked before anything is ordered.
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
                const chosen = dayItems.find((s) => s.item.itemKey === item.itemKey);
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
          key={`${day}-${editing.itemKey}`}
          item={editing}
          existing={dayItems.find((s) => s.item.itemKey === editing.itemKey) ?? null}
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
          disabled={empty.length > 0 || incomplete.length > 0}
          onClick={onContinue}
        >
          Check every date
        </button>
        {empty.length > 0 && weekdays.length > 1 && (
          <span className="hint">
            Still nothing for{' '}
            {empty.map((d) => `${WEEKDAYS.find((w) => w.value === d)?.long}s`).join(' and ')}.
          </span>
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
