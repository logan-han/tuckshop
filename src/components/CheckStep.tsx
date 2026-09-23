import { useEffect, useRef, useState } from 'react';
import { describeError, needsSignIn } from '../api/errors';
import { ApiError, getMenu, getOrderHistory, placeOrders, uuid } from '../api/flexischools';
import { getFulfillmentDatesFor, mapWithConcurrency } from '../api/lookup';
import type { HistoryOrder, Student, StudentService, Wallet } from '../api/types';
import {
  buildPlaceOrdersBody,
  checkAvailability,
  describeOrders,
  existingOrdersByDate,
  summariseOutcomes,
  type OrderOutcome,
  type PlannedOrder,
} from '../engine/orders';
import { cartTotals, formatMoney, orderAmount, type Selection } from '../engine/pricing';
import { formatShort } from '../engine/schedule';
import { selectionsForDate, type Bags } from '../engine/selections';

type Status =
  'checking' | 'ok' | 'ordered' | 'empty' | 'closed' | 'cutoff' | 'unavailable' | 'error';

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
  bags: Bags;
  feePerOrder: number;
  wallet: Wallet | null;
  /** Reads the wallet again, e.g. after a top-up in Flexischools. */
  onRefreshWallet: () => Promise<void>;
  onBack: () => void;
  onPlaced: (outcomes: OrderOutcome[], orders: PlannedOrder[]) => void;
  onError: (error: unknown) => void;
}

const STATUS_LABEL: Record<
  Status,
  { text: string; tone: 'ok' | 'warn' | 'bad' | 'checking' | 'quiet' }
> = {
  checking: { text: 'Checking', tone: 'checking' },
  ok: { text: 'Ready', tone: 'ok' },
  ordered: { text: 'Already ordered', tone: 'warn' },
  empty: { text: 'Nothing chosen', tone: 'quiet' },
  closed: { text: 'Canteen closed', tone: 'bad' },
  cutoff: { text: 'Cut-off passed', tone: 'bad' },
  unavailable: { text: 'Not available', tone: 'bad' },
  error: { text: 'Could not check', tone: 'bad' },
};

/** Every date back to "Checking", with nothing ticked until it has been checked. */
function unchecked(dates: string[]): Row[] {
  return dates.map((date) => ({
    date,
    dueDate: null,
    status: 'checking',
    detail: '',
    include: false,
    selections: [],
    amount: 0,
    existing: [],
  }));
}

/** A failure that leaves it open whether Flexischools took the orders: no answer came back. */
function unanswered(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof ApiError && error.status >= 500);
}

export default function CheckStep({
  student,
  service,
  dates,
  bags,
  feePerOrder,
  wallet,
  onRefreshWallet,
  onBack,
  onPlaced,
  onError,
}: Props) {
  const [rows, setRows] = useState<Row[]>(() => unchecked(dates));
  const [checking, setChecking] = useState(true);
  /** Bumped to check every date again. */
  const [checkRun, setCheckRun] = useState(0);
  const [checkError, setCheckError] = useState<{ message: string; retry: boolean } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  /** The last batch got no answer, so every date was checked again before anything is resent. */
  const [unsure, setUnsure] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /**
   * The keys the batch last went out with. The same dates sent again reuse them, so when a first
   * try did go through, Flexischools sees a repeat rather than a second cart to charge for.
   */
  const sent = useRef<{ dates: string; cartKey: string; requestIds: string[] } | null>(null);

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
              detail: describeOrders(orders),
            });
          } else if (selectionsForDate(bags, date).length === 0) {
            update(date, { status: 'empty', dueDate: entry.fulfillmentDate });
          } else {
            toFetch.push({ date, dueDate: entry.fulfillmentDate });
          }
        }

        await mapWithConcurrency(toFetch, 4, async ({ date, dueDate }) => {
          const chosen = selectionsForDate(bags, date);
          try {
            const menu = await getMenu({
              supplierKey: service.supplierKey,
              supplierServiceKey: service.supplierServiceKey,
              studentKey: student.studentKey,
              schoolKey: student.schoolKey,
              dueDate,
            });
            const result = checkAvailability(menu, chosen);
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
          setCheckError({ message: describeError(e), retry: !needsSignIn(e) });
          setRows((current) =>
            current.map((row) => (row.status === 'checking' ? { ...row, status: 'error' } : row)),
          );
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [student, service, dates, bags, onError, checkRun]);

  function checkAgain() {
    setRows(unchecked(dates));
    setChecking(true);
    setCheckError(null);
    setCheckRun((n) => n + 1);
  }

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
    setPlaceError(null);
    setUnsure(false);
    const orders: PlannedOrder[] = included.map((row) => ({
      date: row.date,
      dueDate: row.dueDate as string,
      selections: row.selections,
    }));
    const batch = orders.map((order) => order.date).join(',');
    if (sent.current?.dates !== batch) {
      sent.current = { dates: batch, cartKey: uuid(), requestIds: orders.map(() => uuid()) };
    }
    const { cartKey, requestIds } = sent.current;
    try {
      const response = await placeOrders(
        buildPlaceOrdersBody({ student, service, orders, feePerOrder, cartKey, requestIds }),
      );
      onPlaced(summariseOutcomes(orders, requestIds, response), orders);
    } catch (e) {
      onError(e);
      setPlacing(false);
      if (unanswered(e)) {
        // The orders may have gone in with the answer lost on the way back, so look again
        // before anything is sent twice.
        setUnsure(true);
        checkAgain();
      } else {
        setPlaceError(describeError(e));
      }
    }
  }

  let placeLabel = `Place ${included.length} ${included.length === 1 ? 'order' : 'orders'} for ${formatMoney(totals.total)}`;
  if (placing) placeLabel = 'Placing…';
  else if (checking) placeLabel = 'Checking dates…';
  else if (checkError) placeLabel = 'Could not check dates';
  else if (included.length === 0) placeLabel = 'Nothing to order';
  else if (shortfall > 0) placeLabel = `Wallet ${formatMoney(shortfall)} short`;
  const someFailed = !checking && !checkError && rows.some((row) => row.status === 'error');

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
      <p className="lede">Tick the dates to order for {student.studentFirstName}.</p>

      {checkError && (
        <p className="notice notice--bad" role="alert">
          {checkError.message}
          {checkError.retry && (
            <>
              {' '}
              <button type="button" className="link-button" onClick={checkAgain}>
                Try again
              </button>
            </>
          )}
        </p>
      )}
      {someFailed && (
        <p className="notice notice--warn">
          Some dates could not be checked.{' '}
          <button type="button" className="link-button" onClick={checkAgain}>
            Check again
          </button>
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
              // An already-ordered date can take an extra order, as long as there is something to order.
              const selectable =
                row.status === 'ok' ||
                (row.status === 'ordered' && selectionsForDate(bags, row.date).length > 0);
              return (
                <tr key={row.date} data-status={selectable ? 'fine' : 'problem'}>
                  <td>
                    <input
                      id={`pick-${row.date}`}
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
                                  selections: r.selections.length
                                    ? r.selections
                                    : selectionsForDate(bags, r.date),
                                  amount: r.amount || orderAmount(selectionsForDate(bags, r.date)),
                                }
                              : r,
                          ),
                        );
                      }}
                    />
                  </td>
                  <td>
                    {/* The date ticks the box too, a far easier target on a phone. */}
                    <label htmlFor={`pick-${row.date}`} className="check-table__pick">
                      {formatShort(row.date)}
                    </label>
                  </td>
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
          <a
            href="https://user.flexischools.com.au/login?returnUrl=/wallet-topup"
            target="_blank"
            rel="noreferrer"
          >
            Flexischools
          </a>{' '}
          first, or untick some dates.{' '}
          <button
            type="button"
            className="link-button"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              try {
                await onRefreshWallet();
              } finally {
                setRefreshing(false);
              }
            }}
          >
            {refreshing ? 'Refreshing…' : 'Refresh the balance'}
          </button>
        </p>
      )}

      <div className="actions actions--sticky">
        {/* Up here rather than by the lede, so they show beside the button that was pressed. */}
        {unsure && (
          <p className="notice notice--warn" role="status">
            No answer from Flexischools, so every date was checked again. Any order that went
            through now shows as Already ordered.
          </p>
        )}
        {placeError && (
          <p className="notice notice--bad" role="alert">
            {placeError}
          </p>
        )}
        <button type="button" className="button button--quiet" onClick={onBack} disabled={placing}>
          Back
        </button>
        <button
          type="button"
          className="button button--go"
          disabled={checking || placing || !!checkError || included.length === 0 || shortfall > 0}
          onClick={place}
        >
          {placeLabel}
        </button>
      </div>
    </section>
  );
}
