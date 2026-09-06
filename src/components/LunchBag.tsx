import type { Student, StudentService } from '../api/types';
import { formatMoney, lineTotal, orderAmount, type Selection } from '../engine/pricing';
import { describeCount } from '../engine/schedule';

interface Props {
  student: Student | null;
  service: StudentService | null;
  weekdays: number[];
  dateCount: number;
  selections: Selection[];
  feePerOrder: number | null;
  onRemove?: (index: number) => void;
}

/** The running summary, drawn as the paper bag the canteen will hand over. */
export default function LunchBag({
  student,
  service,
  weekdays,
  dateCount,
  selections,
  feePerOrder,
  onRemove,
}: Props) {
  const perLunch = orderAmount(selections);
  const fee = feePerOrder ?? 0;
  const total = Math.round((perLunch + fee) * dateCount * 100) / 100;

  return (
    <aside className="bag" aria-label="Your lunch order so far">
      <p className="bag__name">{student ? student.studentFirstName : 'Whose lunch?'}</p>
      <p className="bag__sub">
        {service ? `${service.supplierServiceName}, ` : ''}
        {dateCount > 0 ? describeCount(dateCount, weekdays) : 'no days yet'}
      </p>
      {selections.length === 0 ? (
        <p className="bag__empty">Nothing in the bag yet.</p>
      ) : (
        <>
          <ul className="bag__list">
            {selections.map((selection, index) => (
              <li key={`${selection.item.itemKey}-${index}`}>
                <span>
                  {selection.quantity > 1 ? `${selection.quantity} × ` : ''}
                  {selection.item.name.split(' - ')[0]}
                  {selection.options.length > 0 && (
                    <span className="hint">
                      {' '}
                      (
                      {selection.options
                        .map((choice) => {
                          const option = selection.item.optionSets
                            .flatMap((set) => set.options)
                            .find((o) => o.optionKey === choice.optionKey);
                          return option?.name ?? 'option';
                        })
                        .join(', ')}
                      )
                    </span>
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
          <p className="bag__total">
            <span>Each lunch</span>
            <span>{formatMoney(perLunch)}</span>
          </p>
          {dateCount > 0 && (
            <p className="bag__total" style={{ fontWeight: 400 }}>
              <span>
                × {dateCount} {feePerOrder !== null ? `+ ${formatMoney(fee)} fee each` : ''}
              </span>
              <span>{formatMoney(total)}</span>
            </p>
          )}
        </>
      )}
    </aside>
  );
}
