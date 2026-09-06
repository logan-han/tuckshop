import { useCallback, useEffect, useState } from 'react';
import { describeError } from '../api/errors';
import { cancelOrder, getOrderHistory } from '../api/flexischools';
import type { OrderHistoryGroup } from '../api/types';
import { formatMoney } from '../engine/pricing';
import { addDays, dateOf, formatShort, todayIso } from '../engine/schedule';

interface Props {
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

export default function UpcomingOrders({ onError, onChanged }: Props) {
  const [groups, setGroups] = useState<OrderHistoryGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

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
    if (!window.confirm(`Cancel ${label}? Flexischools refunds it to your wallet.`)) return;
    setBusyKey(orderKey);
    setError(null);
    try {
      await cancelOrder(orderKey);
      await load();
      onChanged();
    } catch (e) {
      onError(e);
      setError(describeError(e));
    } finally {
      setBusyKey(null);
    }
  }

  const live = (groups ?? []).map((group) => ({
    ...group,
    orders: group.orders.filter((o) => o.supplierServiceCategory === 'Food'),
  }));
  const total = live
    .flatMap((g) => g.orders)
    .filter((o) => !o.orderState.startsWith('Cancelled')).length;

  return (
    <section aria-labelledby="orders-title">
      <div className="step-heading">
        <h2 id="orders-title" className="title">
          Upcoming orders
        </h2>
      </div>
      <p className="lede">
        Everything placed for the next six months, from this app or from Flexischools itself.
        Cancelling refunds the wallet straight away, right up to the day’s cut-off.
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
            const label = `${order.studentName}’s ${order.supplierServiceName.trim()} on ${formatShort(dateOf(order.dueDate))}`;
            return (
              <li className="order" key={order.orderKey.value} data-cancelled={cancelled}>
                <span className="order__date">{formatShort(dateOf(order.dueDate))}</span>
                <span>
                  <strong>{order.studentName}</strong> · {items}
                  <span className="order__items"> · {formatMoney(order.orderTotal)}</span>
                </span>
                <span>
                  {cancelled ? (
                    <span className="hint">Cancelled</span>
                  ) : (
                    <button
                      type="button"
                      className="button button--danger button--small"
                      disabled={busyKey !== null}
                      onClick={() => cancel(order.orderKey.value, label)}
                    >
                      {busyKey === order.orderKey.value ? 'Cancelling…' : 'Cancel'}
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
