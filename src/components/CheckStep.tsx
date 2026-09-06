import { useEffect, useState } from 'react';
import { describeError } from '../api/errors';
import { getMenu, getOrderHistory, placeOrders, uuid } from '../api/flexischools';
import { getFulfillmentDatesFor, mapWithConcurrency } from '../api/lookup';
import type { HistoryOrder, Student, StudentService, Wallet } from '../api/types';
import {
  buildPlaceOrdersBody,
  checkAvailability,
  existingOrdersByDate,
  summariseOutcomes,
  type OrderOutcome,
  type PlannedOrder,
} from '../engine/orders';
import { cartTotals, formatMoney, orderAmount, type Selection } from '../engine/pricing';
import { formatShort } from '../engine/schedule';

type Status = 'checking' | 'ok' | 'ordered' | 'closed' | 'cutoff' | 'unavailable' | 'error';

interface Row {
  date: string;
  dueDate: string | null;
  status: Status;
  detail: string;
  include: boolean;
  selections: Selection[];
  amount: number;
  existing: HistoryOrder[];
}

interface Props {
  student: Student;
  service: StudentService;
  dates: string[];
  selections: Selection[];
  feePerOrder: number;
  wallet: Wallet | null;
  onBack: () => void;
  onPlaced: (outcomes: OrderOutcome[], orders: PlannedOrder[]) => void;
  onError: (error: unknown) => void;
}

const STATUS_LABEL: Record<Status, { text: string; tone: 'ok' | 'warn' | 'bad' | 'checking' }> = {
  checking: { text: 'Checking', tone: 'checking' },
  ok: { text: 'Ready', tone: 'ok' },
  ordered: { text: 'Already ordered', tone: 'warn' },
  closed: { text: 'Canteen closed', tone: 'bad' },
  cutoff: { text: 'Cut-off passed', tone: 'bad' },
  unavailable: { text: 'Not available', tone: 'bad' },
  error: { text: 'Could not check', tone: 'bad' },
};

export default function CheckStep({
  student,
  service,
  dates,
  selections,
  feePerOrder,
  wallet,
  onBack,
  onPlaced,
  onError,
}: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    dates.map((date) => ({
      date,
      dueDate: null,
      status: 'checking',
      detail: '',
      include: false,
      selections: [],
      amount: 0,
      existing: [],
    })),
  );
  const [checking, setChecking] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const update = (date: string, patch: Partial<Row>) => {
      if (cancelled) return;
      setRows((current) => current.map((row) => (row.date === date ? { ...row, ...patch } : row)));
    };

    (async () => {
      try {
        const [fulfilment, history] = await Promise.all([
          getFulfillmentDatesFor(student.studentKey, service.supplierServiceKey, dates),
          getOrderHistory({ fromDate: dates[0], toDate: dates[dates.length - 1], pageSize: 200 }),
        ]);
        const existing = existingOrdersByDate(
          history,
          student.studentKey,
          service.supplierServiceKey,
        );

        const toFetch: Array<{ date: string; dueDate: string }> = [];
        for (const date of dates) {
          const entry = fulfilment.get(date);
          if (!entry) {
            update(date, { status: 'closed', detail: 'Not on the canteen calendar' });
          } else if (entry.closureReason) {
            update(date, {
              status: 'closed',
              detail: entry.closureReason,
              dueDate: entry.fulfillmentDate,
            });
          } else if (entry.hasCutOffTimePassed) {
            update(date, {
              status: 'cutoff',
              detail: 'Too late to order for this day',
              dueDate: entry.fulfillmentDate,
            });
          } else if (existing.has(date)) {
            const orders = existing.get(date) ?? [];
            update(date, {
              status: 'ordered',
              dueDate: entry.fulfillmentDate,
              existing: orders,
              detail: orders
                .flatMap((o) => o.orderItems.map((i) => i.itemDisplayName.split(' - ')[0]))
                .join(', '),
            });
          } else {
            toFetch.push({ date, dueDate: entry.fulfillmentDate });
          }
        }

        await mapWithConcurrency(toFetch, 4, async ({ date, dueDate }) => {
          try {
            const menu = await getMenu({
              supplierKey: service.supplierKey,
              supplierServiceKey: service.supplierServiceKey,
              studentKey: student.studentKey,
              schoolKey: student.schoolKey,
              dueDate,
            });
            const result = checkAvailability(menu, selections);
            if (result.ok) {
              update(date, {
                status: 'ok',
                dueDate,
                include: true,
                selections: result.selections,
                amount: orderAmount(result.selections),
                detail: '',
              });
            } else {
              update(date, { status: 'unavailable', dueDate, detail: result.problems.join('; ') });
            }
          } catch (e) {
            onError(e);
            update(date, { status: 'error', dueDate, detail: describeError(e) });
          }
        });
      } catch (e) {
        if (!cancelled) {
          onError(e);
          setError(describeError(e));
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [student, service, dates, selections, onError]);

  const included = rows.filter((row) => row.include && row.dueDate);
  const totals = cartTotals(
    included.map((row) => row.amount),
    feePerOrder,
  );
  const shortfall = wallet
    ? Math.max(0, Math.round((totals.total - wallet.availableBalance) * 100) / 100)
    : 0;

  async function place() {
    setPlacing(true);
    setError(null);
    const orders: PlannedOrder[] = included.map((row) => ({
      date: row.date,
      dueDate: row.dueDate as string,
      selections: row.selections,
    }));
    const requestIds = orders.map(() => uuid());
    try {
      const response = await placeOrders(
        buildPlaceOrdersBody({
          student,
          service,
          orders,
          feePerOrder,
          cartKey: uuid(),
          requestIds,
        }),
      );
      onPlaced(summariseOutcomes(orders, requestIds, response), orders);
    } catch (e) {
      onError(e);
      setError(describeError(e));
      setPlacing(false);
    }
  }

  return (
    <section aria-labelledby="check-title">
      <div className="step-heading">
        <span className="step-heading__number" aria-hidden="true">
          4
        </span>
        <h2 id="check-title" className="title">
          Check every date
        </h2>
      </div>
      <p className="lede">
        Each date is checked against the canteen calendar, that day’s menu and the orders already
        placed for {student.studentFirstName}. Untick anything you would rather skip.
      </p>

      {error && (
        <p className="notice notice--bad" role="alert">
          {error}
        </p>
      )}

      <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
        <table className="check-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Order</span>
              </th>
              <th scope="col">Date</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">
                Lunch
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const label = STATUS_LABEL[row.status];
              const selectable = row.status === 'ok' || row.status === 'ordered';
              return (
                <tr key={row.date} data-status={selectable ? 'fine' : 'problem'}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Order for ${formatShort(row.date)}`}
                      checked={row.include}
                      disabled={!selectable || placing}
                      onChange={(e) => {
                        const include = e.target.checked;
                        setRows((current) =>
                          current.map((r) =>
                            r.date === row.date
                              ? {
                                  ...r,
                                  include,
                                  // An "already ordered" date has no checked menu; order the plan as chosen.
                                  selections: r.selections.length ? r.selections : selections,
                                  amount: r.amount || orderAmount(selections),
                                }
                              : r,
                          ),
                        );
                      }}
                    />
                  </td>
                  <td>{formatShort(row.date)}</td>
                  <td>
                    <span className={`status status--${label.tone}`}>{label.text}</span>
                    {row.detail && <div className="hint">{row.detail}</div>}
                  </td>
                  <td className="num">
                    {row.status === 'ok' || row.include ? formatMoney(row.amount) : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="totals" aria-live="polite">
        <dl>
          <dt>
            {totals.orders} {totals.orders === 1 ? 'lunch' : 'lunches'}
          </dt>
          <dd>{formatMoney(totals.items)}</dd>
          <dt>Flexischools order fees ({formatMoney(feePerOrder)} each)</dt>
          <dd>{formatMoney(totals.fees)}</dd>
          <dt className="totals__grand">Total</dt>
          <dd className="totals__grand">{formatMoney(totals.total)}</dd>
          {wallet && (
            <>
              <dt>Wallet balance</dt>
              <dd>{formatMoney(wallet.availableBalance)}</dd>
            </>
          )}
        </dl>
      </div>

      {shortfall > 0 && (
        <p className="notice notice--warn" role="alert">
          The wallet is {formatMoney(shortfall)} short. Top it up in{' '}
          <a href="https://user.flexischools.com.au/home" target="_blank" rel="noreferrer">
            Flexischools
          </a>{' '}
          first, or untick some dates.
        </p>
      )}

      <div className="actions">
        <button type="button" className="button button--quiet" onClick={onBack} disabled={placing}>
          Back
        </button>
        <button
          type="button"
          className="button button--go"
          disabled={checking || placing || included.length === 0 || shortfall > 0}
          onClick={place}
        >
          {placing
            ? 'Placing…'
            : checking
              ? 'Checking dates…'
              : `Place ${included.length} ${included.length === 1 ? 'order' : 'orders'} for ${formatMoney(totals.total)}`}
        </button>
      </div>
    </section>
  );
}
