import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError, needsSignIn } from '../api/errors';
import { ApiError, cancelOrder, getOrderHistory } from '../api/flexischools';
import type { OrderHistoryGroup } from '../api/types';
import { formatMoney } from '../engine/pricing';
import { addDays, dateOf, formatShort, todayIso } from '../engine/schedule';

interface Props {
  /** The account's only child, when it has just the one: their orders need not name them. */
  onlyChild?: string | null;
  onError: (error: unknown) => void;
  onChanged: () => void;
}

/** Everything placed for the next six months, soonest first. */
async function fetchUpcoming(): Promise<OrderHistoryGroup[]> {
  const today = todayIso();
  const history = await getOrderHistory({
    fromDate: today,
    toDate: addDays(today, 180),
    pageSize: 200,
  });
  return [...history.presentOrders].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Why a cancellation failed; a refusal is most likely an order past its cut-off. */
function describeRefusal(error: unknown, label: string): string {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return `Flexischools would not cancel ${label}. It may be past the day’s cut-off.`;
  }
  return describeError(error);
}

export default function UpcomingOrders({ onlyChild = null, onError, onChanged }: Props) {
  const [groups, setGroups] = useState<OrderHistoryGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  /** The order whose Cancel was pressed, waiting on a yes. One at a time. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** The order whose Cancel button gets focus back once it is shown again. */
  const refocus = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGroups(await fetchUpcoming());
      setError(null);
    } catch (e) {
      onError(e);
      setError(describeError(e));
    }
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const groups = await fetchUpcoming();
        if (!cancelled) setGroups(groups);
      } catch (e) {
        if (cancelled) return;
        onError(e);
        setError(describeError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onError]);

  async function cancel(orderKey: string, label: string) {
    setConfirming(null);
    setBusyKey(orderKey);
    setError(null);
    try {
      await cancelOrder(orderKey);
      await load();
      onChanged();
    } catch (e) {
      onError(e);
      if (!needsSignIn(e)) setError(describeRefusal(e, label));
      refocus.current = orderKey;
    } finally {
      setBusyKey(null);
    }
  }

  function keep(orderKey: string) {
    refocus.current = orderKey;
    setConfirming(null);
  }

  const live = (groups ?? []).map((group) => ({
    ...group,
    orders: group.orders.filter((o) => o.supplierServiceCategory === 'Food'),
  }));
  const total = live
    .flatMap((g) => g.orders)
    .filter((o) => !o.orderState.startsWith('Cancelled')).length;
  // A sibling with no open service is not listed, but their orders still need their name.
  const named =
    !onlyChild || live.some((g) => g.orders.some((o) => o.studentKey.value !== onlyChild));

  return (
    <section aria-labelledby="orders-title">
      <div className="step-heading">
        <h2 id="orders-title" className="title">
          Upcoming orders
        </h2>
      </div>
      <p className="lede">
        Orders for the next six months, placed here or on Flexischools. Cancelling refunds the
        wallet, up to the day’s cut-off.
      </p>
      {error && (
        <p className="notice notice--bad" role="alert">
          {error}
        </p>
      )}
      {groups === null && !error && <p className="hint">Loading orders…</p>}
      {groups !== null && total === 0 && (
        <p className="notice notice--plain">No upcoming lunch orders.</p>
      )}
      <ul className="orders">
        {live.flatMap((group) =>
          group.orders.map((order) => {
            const cancelled = order.orderState.startsWith('Cancelled');
            const items = order.orderItems
              .map(
                (i) =>
                  `${i.quantityOrdered > 1 ? `${i.quantityOrdered} × ` : ''}${i.itemDisplayName.split(' - ')[0]}`,
              )
              .join(', ');
            const key = order.orderKey.value;
            const date = formatShort(dateOf(order.dueDate));
            const label = `${named ? `${order.studentName}’s ` : 'the '}${order.supplierServiceName.trim()} on ${date}`;
            return (
              <li className="order" key={key} data-cancelled={cancelled}>
                <span className="order__date">{date}</span>
                <span className="order__details">
                  {named && (
                    <>
                      <strong>{order.studentName}</strong> ·{' '}
                    </>
                  )}
                  {items}
                  <span className="order__items"> · {formatMoney(order.orderTotal)}</span>
                </span>
                <span className="order__action">
                  {cancelled ? (
                    <span className="hint">Cancelled</span>
                  ) : confirming === key ? (
                    <>
                      <button
                        type="button"
                        className="button button--danger button--small"
                        aria-label={`Yes, cancel ${label}`}
                        autoFocus
                        onClick={() => cancel(key, label)}
                      >
                        Yes, cancel
                      </button>
                      <button
                        type="button"
                        className="button button--quiet button--small"
                        onClick={() => keep(key)}
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button button--danger button--small"
                      disabled={busyKey !== null}
                      ref={(button) => {
                        if (button && refocus.current === key) {
                          refocus.current = null;
                          button.focus();
                        }
                      }}
                      onClick={() => setConfirming(key)}
                    >
                      {busyKey === key ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </span>
              </li>
            );
          }),
        )}
      </ul>
    </section>
  );
}
