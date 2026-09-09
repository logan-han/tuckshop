import type { Student, StudentService } from '../api/types';
import { formatMoney, lineTotal, orderAmount, type Selection } from '../engine/pricing';
import { describeCount, formatShort, WEEKDAYS, weekdayOf } from '../engine/schedule';
import { hasOwnBag, ownBagDates, planTotals, type BagRef, type Bags } from '../engine/selections';

interface Props {
  student: Student | null;
  service: StudentService | null;
  weekdays: number[];
  dates: string[];
  bags: Bags;
  feePerOrder: number | null;
  onRemove?: (ref: BagRef, index: number) => void;
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

/** One bag's lines and what that lunch costs. */
function Lines({
  items,
  label,
  onRemove,
}: {
  items: Selection[];
  label: string;
  onRemove?: (index: number) => void;
}) {
  return (
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
                  <button type="button" className="bag__remove" onClick={() => onRemove(index)}>
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
        <span>{label}</span>
        <span>{formatMoney(orderAmount(items))}</span>
      </p>
    </>
  );
}

/** The running summary, drawn as the paper bag the canteen will hand over. */
export default function LunchBag({
  student,
  service,
  weekdays,
  dates,
  bags,
  feePerOrder,
  onRemove,
}: Props) {
  const days = weekdays.filter((day) => dates.some((date) => weekdayOf(date) === day));
  const own = ownBagDates(bags, dates);
  const totals = planTotals(bags, dates, feePerOrder ?? 0);
  const anything = own.length > 0 || days.some((day) => (bags.byDay[day]?.length ?? 0) > 0);
  const headed = days.length > 1 || own.length > 0;

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
            const items = bags.byDay[day] ?? [];
            // Dates with a lunch of their own are listed separately below.
            const count = dates.filter(
              (date) => weekdayOf(date) === day && !hasOwnBag(bags, date),
            ).length;
            const name = WEEKDAYS.find((w) => w.value === day)?.long ?? '';
            if (count === 0) return null;
            return (
              <div key={day}>
                {headed && (
                  <p className="bag__day">
                    {name}s <span>× {count}</span>
                  </p>
                )}
                {items.length === 0 ? (
                  <p className="bag__empty">Nothing yet for {name}s.</p>
                ) : (
                  <Lines
                    items={items}
                    label="Each lunch"
                    onRemove={onRemove && ((index) => onRemove({ day }, index))}
                  />
                )}
              </div>
            );
          })}
          {own.map((date) => (
            <div key={date}>
              <p className="bag__day">{formatShort(date)}</p>
              <Lines
                items={bags.byDate[date]}
                label="This lunch"
                onRemove={onRemove && ((index) => onRemove({ date }, index))}
              />
            </div>
          ))}
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
