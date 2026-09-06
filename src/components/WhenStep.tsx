import { useState } from 'react';
import { formatShort, isIsoDate, TERM_PRESETS, WEEKDAYS, weekdayOf } from '../engine/schedule';
import { applyPreset, type Plan } from '../state/plan';

interface Props {
  plan: Plan;
  dates: string[];
  onChange: (plan: Plan) => void;
  onBack: () => void;
  onContinue: () => void;
}

export default function WhenStep({ plan, dates, onChange, onBack, onContinue }: Props) {
  const [newExclusion, setNewExclusion] = useState('');

  function toggleWeekday(value: number) {
    const weekdays = plan.weekdays.includes(value)
      ? plan.weekdays.filter((w) => w !== value)
      : [...plan.weekdays, value].sort();
    onChange({ ...plan, weekdays });
  }

  function addExclusion() {
    if (!isIsoDate(newExclusion) || plan.excluded.some((e) => e.date === newExclusion)) return;
    onChange({
      ...plan,
      excluded: [...plan.excluded, { date: newExclusion, reason: 'Skipped' }].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    });
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
        <div className="chips" role="group" aria-labelledby="weekdays-label">
          {WEEKDAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              className="chip"
              aria-pressed={plan.weekdays.includes(day.value)}
              onClick={() => toggleWeekday(day.value)}
            >
              {day.long}
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
          {TERM_PRESETS.map((preset) => (
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
          Public holidays and mid-term breaks are already listed for the chosen term. Add camps,
          excursions or days off here.
        </p>
        <ul className="excluded" aria-label="Skipped dates">
          {plan.excluded.length === 0 && <li className="hint">Nothing skipped.</li>}
          {plan.excluded.map((entry) => (
            <li key={entry.date}>
              <span>
                {formatShort(entry.date)}
                {plan.weekdays.includes(weekdayOf(entry.date)) ? '' : ' (not one of your days)'}
                <span className="hint"> {entry.reason}</span>
              </span>
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  onChange({
                    ...plan,
                    excluded: plan.excluded.filter((e) => e.date !== entry.date),
                  })
                }
              >
                keep it
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
            disabled={!isIsoDate(newExclusion)}
          >
            Skip it
          </button>
        </div>
      </div>

      <p className="count-line" aria-live="polite">
        <strong>{dates.length}</strong> {dates.length === 1 ? 'lunch' : 'lunches'} to order
        {dates.length > 0 && (
          <span className="hint">
            {' '}
            · first {formatShort(dates[0])}, last {formatShort(dates[dates.length - 1])}
          </span>
        )}
      </p>

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
