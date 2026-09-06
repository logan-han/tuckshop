import type { Student, StudentService, Wallet } from '../api/types';
import { formatMoney } from '../engine/pricing';

interface Props {
  students: Student[];
  student: Student | null;
  service: StudentService | null;
  wallet: Wallet | null;
  onChoose: (student: Student, service: StudentService) => void;
  onContinue: () => void;
}

export default function WhoStep({
  students,
  student,
  service,
  wallet,
  onChoose,
  onContinue,
}: Props) {
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
      <div className="chips" role="group" aria-label="Student and service">
        {students.flatMap((s) =>
          s.services.map((svc) => {
            const selected =
              student?.studentKey === s.studentKey &&
              service?.supplierServiceKey === svc.supplierServiceKey;
            return (
              <button
                key={`${s.studentKey}-${svc.supplierServiceKey}`}
                type="button"
                className="chip"
                aria-pressed={selected}
                onClick={() => onChoose(s, svc)}
              >
                <strong>{s.studentFirstName}</strong>
                <span className="hint">
                  {svc.supplierServiceName.trim()}, {s.schoolName}
                </span>
              </button>
            );
          }),
        )}
      </div>
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
