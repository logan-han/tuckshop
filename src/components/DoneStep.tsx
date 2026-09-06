import type { OrderOutcome } from '../engine/orders';
import { formatShort } from '../engine/schedule';

interface Props {
  studentName: string;
  outcomes: OrderOutcome[];
  onPlanAnother: () => void;
  onShowOrders: () => void;
}

export default function DoneStep({ studentName, outcomes, onPlanAnother, onShowOrders }: Props) {
  const placed = outcomes.filter((o) => o.placed).length;
  const failed = outcomes.length - placed;

  return (
    <section aria-labelledby="done-title">
      <div className="step-heading">
        <span className="step-heading__number" aria-hidden="true">
          5
        </span>
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
          Flexischools declined {failed} {failed === 1 ? 'date' : 'dates'}. The reasons are listed
          below; the successful orders stand.
        </p>
      )}
      <ul className="orders">
        {outcomes.map((outcome) => (
          <li className="order" key={outcome.date}>
            <span className="order__date">{formatShort(outcome.date)}</span>
            <span className={`status status--${outcome.placed ? 'ok' : 'bad'}`}>
              {outcome.message}
            </span>
            <span />
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" className="button" onClick={onShowOrders}>
          See upcoming orders
        </button>
        <button type="button" className="button button--quiet" onClick={onPlanAnother}>
          Plan more lunches
        </button>
      </div>
    </section>
  );
}
