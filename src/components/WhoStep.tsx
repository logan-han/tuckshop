import type { AvailableService, Student, StudentService, Wallet } from '../api/types';
import { formatMoney } from '../engine/pricing';

interface Props {
  students: Student[];
  /** What the canteen says about each service, e.g. "Order by 8.30am". */
  available?: AvailableService[];
  student: Student | null;
  service: StudentService | null;
  wallet: Wallet | null;
  onChoose: (student: Student, service: StudentService) => void;
  onContinue: () => void;
}

export default function WhoStep({
  students,
  available = [],
  student,
  service,
  wallet,
  onChoose,
  onContinue,
}: Props) {
  const services = student?.services ?? [];

  return (
    <section aria-labelledby="who-title">
      <div className="step-heading">
        <span className="step-heading__number" aria-hidden="true">
          1
        </span>
        <h2 id="who-title" className="title">
          Who is this lunch for?
        </h2>
      </div>
      {students.length === 0 && (
        <p className="notice notice--warn">
          No students with a food service are linked to this account. Add them in Flexischools
          first.
        </p>
      )}
      <div className="chips" role="group" aria-label="Student">
        {students.map((s) => (
          <button
            key={s.studentKey}
            type="button"
            className="chip"
            aria-pressed={student?.studentKey === s.studentKey}
            onClick={() => onChoose(s, s.services[0])}
          >
            <strong>{s.studentFirstName}</strong>
            <span className="hint">{s.schoolName}</span>
          </button>
        ))}
      </div>

      {student && services.length > 1 && (
        <div className="field" style={{ marginTop: '1.25rem' }}>
          <span className="field__label" id="service-label">
            Order from
          </span>
          <p className="hint">
            The canteen is taking orders for more than one service. Everyday lunches come from the
            first one; the others are special days.
          </p>
          <div className="chips" role="group" aria-labelledby="service-label">
            {services.map((svc) => {
              const info = available.find((a) => a.supplierServiceKey === svc.supplierServiceKey);
              return (
                <button
                  key={svc.supplierServiceKey}
                  type="button"
                  className="chip"
                  aria-pressed={service?.supplierServiceKey === svc.supplierServiceKey}
                  onClick={() => onChoose(student, svc)}
                >
                  {svc.supplierServiceName.trim()}
                  {info?.description && <span className="hint">{info.description}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {wallet && (
        <p className="hint" style={{ marginTop: '1rem' }}>
          Wallet balance {formatMoney(wallet.availableBalance)}
          {wallet.defaultPaymentMethodReference
            ? `, top-ups from ${wallet.defaultPaymentMethodName?.replace('_', ' ')} ending ${wallet.defaultPaymentMethodReference.slice(-4)}`
            : ''}
          .
        </p>
      )}
      <div className="actions">
        <button
          className="button"
          type="button"
          disabled={!student || !service}
          onClick={onContinue}
        >
          Choose the days
        </button>
      </div>
    </section>
  );
}
