import type { Student } from '../api/types';
import type { OrderOutcome } from '../engine/orders';
import { formatDayMonth, formatShort } from '../engine/schedule';

interface Props {
  studentName: string;
  outcomes: OrderOutcome[];
  /** The account's other children, each a tap away from a plan of their own. */
  otherStudents?: Student[];
  onPlanAnother: () => void;
  onShowOrders: () => void;
  /** Back to the food, on the first date Flexischools declined. */
  onFix?: (date: string) => void;
  onOrderFor?: (student: Student) => void;
}

export default function DoneStep({
  studentName,
  outcomes,
  otherStudents = [],
  onPlanAnother,
  onShowOrders,
  onFix,
  onOrderFor,
}: Props) {
  const placed = outcomes.filter((o) => o.placed).length;
  const declined = outcomes.filter((o) => !o.placed).map((o) => o.date);
  const failed = declined.length;

  return (
    <section aria-labelledby="done-title">
      <div className="step-heading">
        <h2 id="done-title" className="title">
          {placed === outcomes.length
            ? `${placed} ${placed === 1 ? 'lunch' : 'lunches'} ordered for ${studentName}`
            : placed === 0
              ? 'Nothing was ordered'
              : `${placed} of ${outcomes.length} lunches ordered`}
        </h2>
      </div>
      {failed > 0 && (
        <p className="notice notice--warn">
          Flexischools declined{' '}
          {failed === 1 ? '1 date; the reason is' : `${failed} dates; the reasons are`} below.
          {placed > 0 && ' The rest are ordered.'}
        </p>
      )}
      <ul className="orders">
        {outcomes.map((outcome) => (
          <li className="order order--outcome" key={outcome.date}>
            <span className="order__date">{formatShort(outcome.date)}</span>
            <span className={`order__details status status--${outcome.placed ? 'ok' : 'bad'}`}>
              {outcome.message}
            </span>
          </li>
        ))}
      </ul>
      <div className="actions">
        {failed > 0 && onFix && (
          <button type="button" className="button" onClick={() => onFix(declined[0])}>
            {failed === 1 ? `Fix ${formatDayMonth(declined[0])}` : `Fix ${failed} dates`}
          </button>
        )}
        <button
          type="button"
          className={failed > 0 && onFix ? 'button button--quiet' : 'button'}
          onClick={onShowOrders}
        >
          See upcoming orders
        </button>
        {onOrderFor &&
          otherStudents.map((other) => (
            <button
              key={other.studentKey}
              type="button"
              className="button button--quiet"
              onClick={() => onOrderFor(other)}
            >
              Order for {other.studentFirstName}
            </button>
          ))}
        <button type="button" className="button button--quiet" onClick={onPlanAnother}>
          Plan more lunches
        </button>
      </div>
    </section>
  );
}
