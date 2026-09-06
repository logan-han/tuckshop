import type { Student, StudentService } from '../api/types';
import { formatMoney, lineTotal, orderAmount, type Selection } from '../engine/pricing';
import { describeCount, WEEKDAYS, weekdayOf } from '../engine/schedule';
import { planTotals, type SelectionsByDay } from '../engine/selections';

interface Props {
  student: Student | null;
  service: StudentService | null;
  weekdays: number[];
  dates: string[];
  selections: SelectionsByDay;
  feePerOrder: number | null;
  onRemove?: (day: number, index: number) => void;
}

function optionNames(selection: Selection): string {
  return selection.options
    .map(
      (choice) =>
        selection.item.optionSets
          .flatMap((set) => set.options)
          .find((o) => o.optionKey === choice.optionKey)?.name ?? 'option',
    )
    .join(', ');
}

/** The running summary, drawn as the paper bag the canteen will hand over. */
export default function LunchBag({
  student,
  service,
  weekdays,
  dates,
  selections,
  feePerOrder,
  onRemove,
}: Props) {
  const days = weekdays.filter((day) => dates.some((date) => weekdayOf(date) === day));
  const totals = planTotals(selections, dates, feePerOrder ?? 0);
  const anything = days.some((day) => (selections[day]?.length ?? 0) > 0);

  return (
    <aside className="bag" aria-label="Your lunch order so far">
      <p className="bag__name">{student ? student.studentFirstName : 'Whose lunch?'}</p>
      <p className="bag__sub">
        {service ? `${service.supplierServiceName.trim()}, ` : ''}
        {dates.length > 0 ? describeCount(dates.length, weekdays) : 'no days yet'}
      </p>
      {!anything ? (
        <p className="bag__empty">Nothing in the bag yet.</p>
      ) : (
        <>
          {days.map((day) => {
            const items = selections[day] ?? [];
            const count = dates.filter((date) => weekdayOf(date) === day).length;
            const name = WEEKDAYS.find((w) => w.value === day)?.long ?? '';
            return (
              <div key={day}>
                {days.length > 1 && (
                  <p className="bag__day">
                    {name}s <span>× {count}</span>
                  </p>
                )}
                {items.length === 0 ? (
                  <p className="bag__empty">Nothing yet for {name}s.</p>
                ) : (
                  <>
                    <ul className="bag__list">
                      {items.map((selection, index) => (
                        <li key={`${selection.item.itemKey}-${index}`}>
                          <span>
                            {selection.quantity > 1 ? `${selection.quantity} × ` : ''}
                            {selection.item.name.split(' - ')[0]}
                            {selection.options.length > 0 && (
                              <span className="hint"> ({optionNames(selection)})</span>
                            )}
                            {onRemove && (
                              <>
                                {' '}
                                <button
                                  type="button"
                                  className="bag__remove"
                                  onClick={() => onRemove(day, index)}
                                >
                                  remove
                                </button>
                              </>
                            )}
                          </span>
                          <span>{formatMoney(lineTotal(selection))}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="bag__total" style={{ fontWeight: 400 }}>
                      <span>Each lunch</span>
                      <span>{formatMoney(orderAmount(items))}</span>
                    </p>
                  </>
                )}
              </div>
            );
          })}
          {totals.lunches > 0 && (
            <p className="bag__total">
              <span>
                {totals.lunches} {totals.lunches === 1 ? 'lunch' : 'lunches'}
                {feePerOrder !== null ? ` + ${formatMoney(feePerOrder)} fee each` : ''}
              </span>
              <span>{formatMoney(totals.total)}</span>
            </p>
          )}
        </>
      )}
    </aside>
  );
}
