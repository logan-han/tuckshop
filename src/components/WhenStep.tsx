import { useState } from 'react';
import type { ExistingOrders } from '../engine/orders';
import { formatShort, isIsoDate, WEEKDAYS, weekdayOf, type TermPreset } from '../engine/schedule';
import { applyPreset, skipDate, type Plan } from '../state/plan';

interface Props {
  plan: Plan;
  presets: TermPreset[];
  dates: string[];
  /** Orders already placed for this student and service, by date. */
  existing: ExistingOrders;
  onChange: (plan: Plan) => void;
  onBack: () => void;
  onContinue: () => void;
}

/** "Thu 10 Sep, Thu 17 Sep" or "Thu 10 Sep, Thu 17 Sep, Thu 24 Sep and 2 more" */
function listDates(dates: string[]): string {
  const shown = dates.length > 4 ? dates.slice(0, 3) : dates;
  const rest = dates.length - shown.length;
  return shown.map(formatShort).join(', ') + (rest > 0 ? ` and ${rest} more` : '');
}

export default function WhenStep({
  plan,
  presets,
  dates,
  existing,
  onChange,
  onBack,
  onContinue,
}: Props) {
  const [newExclusion, setNewExclusion] = useState('');
  const ordered = dates.filter((date) => existing.has(date));
  // Only what would otherwise be ordered: a Tuesday holiday means nothing to a Thursday plan.
  const skipped = plan.excluded.filter(
    (entry) =>
      plan.weekdays.includes(weekdayOf(entry.date)) &&
      entry.date >= plan.from &&
      entry.date <= plan.to,
  );
  const skippable = dates.includes(newExclusion);

  function toggleWeekday(value: number) {
    const weekdays = plan.weekdays.includes(value)
      ? plan.weekdays.filter((w) => w !== value)
      : [...plan.weekdays, value].sort();
    onChange({ ...plan, weekdays });
  }

  function addExclusion() {
    if (!skippable) return;
    onChange(skipDate(plan, newExclusion));
    setNewExclusion('');
  }

  const rangeValid = isIsoDate(plan.from) && isIsoDate(plan.to) && plan.from <= plan.to;

  return (
    <section aria-labelledby="when-title">
      <div className="step-heading">
        <span className="step-heading__number" aria-hidden="true">
          2
        </span>
        <h2 id="when-title" className="title">
          Which days?
        </h2>
      </div>

      <div className="field">
        <span className="field__label" id="weekdays-label">
          Days of the week
        </span>
        <div className="chips chips--week" role="group" aria-labelledby="weekdays-label">
          {WEEKDAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              className="chip"
              aria-label={day.long}
              aria-pressed={plan.weekdays.includes(day.value)}
              onClick={() => toggleWeekday(day.value)}
            >
              {day.short}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="preset">
          Term
        </label>
        <select
          id="preset"
          className="select input--short"
          value={plan.presetId}
          onChange={(e) => onChange(applyPreset(plan, e.target.value))}
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
          <option value="custom">Custom dates</option>
        </select>
      </div>

      <div className="date-row">
        <div className="field">
          <label className="field__label" htmlFor="from">
            From
          </label>
          <input
            id="from"
            className="input input--short"
            type="date"
            value={plan.from}
            onChange={(e) => onChange({ ...plan, presetId: 'custom', from: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="to">
            To
          </label>
          <input
            id="to"
            className="input input--short"
            type="date"
            value={plan.to}
            onChange={(e) => onChange({ ...plan, presetId: 'custom', to: e.target.value })}
          />
        </div>
      </div>
      {!rangeValid && (
        <p className="notice notice--warn" role="alert">
          Pick a start date on or before the end date.
        </p>
      )}

      <div className="field" style={{ marginTop: '1.25rem' }}>
        <span className="field__label">Skip these dates</span>
        <p className="hint">
          {plan.presetId === 'custom'
            ? 'Add holidays, camps or days off below.'
            : 'Holidays in this term are already skipped. Add camps or days off below.'}
        </p>
        <ul className="excluded" aria-label="Skipped dates">
          {skipped.length === 0 && (
            <li className="hint">
              {plan.presetId === 'custom' ? 'Nothing skipped.' : 'No holidays fall on your days.'}
            </li>
          )}
          {skipped.map((entry) => (
            <li key={entry.date}>
              <span>
                {formatShort(entry.date)}
                <span className="hint"> {entry.reason}</span>
              </span>
              <button
                type="button"
                className="link-button"
                aria-label={`Don’t skip ${formatShort(entry.date)}`}
                onClick={() =>
                  onChange({
                    ...plan,
                    excluded: plan.excluded.filter((e) => e.date !== entry.date),
                  })
                }
              >
                Don’t skip
              </button>
            </li>
          ))}
        </ul>
        <div className="date-row" style={{ marginTop: '0.75rem' }}>
          <div className="field">
            <label className="field__label" htmlFor="skip-date">
              Skip another date
            </label>
            <input
              id="skip-date"
              className="input input--short"
              type="date"
              value={newExclusion}
              min={plan.from}
              max={plan.to}
              onChange={(e) => setNewExclusion(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="button button--quiet"
            onClick={addExclusion}
            disabled={!skippable}
          >
            Skip it
          </button>
        </div>
        {isIsoDate(newExclusion) && !skippable && (
          <p className="hint" role="status">
            {formatShort(newExclusion)} is not in the plan.
          </p>
        )}
      </div>

      <p className="count-line" aria-live="polite">
        <strong>{dates.length}</strong> {dates.length === 1 ? 'lunch' : 'lunches'} to order{' '}
        {dates.length > 0 && (
          <span className="count-line__range hint">
            {dates.length === 1
              ? formatShort(dates[0])
              : `${formatShort(dates[0])} to ${formatShort(dates[dates.length - 1])}`}
          </span>
        )}
      </p>
      {ordered.length > 0 && (
        <p className="hint" role="status">
          Already ordered: {listDates(ordered)}. {ordered.length === 1 ? 'It starts' : 'They start'}{' '}
          unticked at the check.{' '}
          <button
            type="button"
            className="link-button"
            onClick={() =>
              onChange(
                ordered.reduce((next, date) => skipDate(next, date, 'Already ordered'), plan),
              )
            }
          >
            {ordered.length === 1 ? 'Skip that date' : 'Skip those dates'}
          </button>
        </p>
      )}

      <div className="actions">
        <button type="button" className="button button--quiet" onClick={onBack}>
          Back
        </button>
        <button type="button" className="button" onClick={onContinue} disabled={dates.length === 0}>
          Choose the food
        </button>
      </div>
    </section>
  );
}
