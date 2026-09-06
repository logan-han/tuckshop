import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeError } from '../api/errors';
import { getMenu } from '../api/flexischools';
import { getFulfillmentDatesFor } from '../api/lookup';
import type { Menu, MenuItem, Student, StudentService } from '../api/types';
import { formatMoney, missingChoices, type Selection } from '../engine/pricing';
import { formatShort } from '../engine/schedule';
import ItemDialog from './ItemDialog';

interface Props {
  student: Student;
  service: StudentService;
  dates: string[];
  selections: Selection[];
  onChange: (selections: Selection[]) => void;
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
  const key = `${student.studentKey}|${service.supplierServiceKey}|${dates.join(',')}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<MenuItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // The first few weeks are enough to find one orderable date to borrow the menu from.
        const sample = dates.slice(0, 10);
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
  }, [key, student, service, dates, onError]);

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

  const incomplete = selections.filter((s) => missingChoices(s).length > 0);

  function save(selection: Selection) {
    const index = selections.findIndex((s) => s.item.itemKey === selection.item.itemKey);
    onChange(
      index === -1
        ? [...selections, selection]
        : selections.map((s, i) => (i === index ? selection : s)),
    );
    setEditing(null);
  }

  function remove(itemKey: string) {
    onChange(selections.filter((s) => s.item.itemKey !== itemKey));
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

      {current?.error && (
        <p className="notice notice--bad" role="alert">
          {current.error}
        </p>
      )}
      {!current && <p className="hint">Loading the menu…</p>}

      {current?.menu && current.date && (
        <>
          <p className="hint" style={{ marginBottom: '1rem' }}>
            Showing the {service.supplierServiceName.trim()} menu for {formatShort(current.date)}.
            Daily specials change from day to day; every date gets checked before anything is
            ordered.
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
                const chosen = selections.find((s) => s.item.itemKey === item.itemKey);
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
          key={editing.itemKey}
          item={editing}
          existing={selections.find((s) => s.item.itemKey === editing.itemKey) ?? null}
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
          disabled={selections.length === 0 || incomplete.length > 0}
          onClick={onContinue}
        >
          Check every date
        </button>
        {incomplete.length > 0 && (
          <span className="hint">
            Finish choosing options for {incomplete.map((s) => s.item.name).join(', ')}.
          </span>
        )}
      </div>
    </section>
  );
}
