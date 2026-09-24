import type { PendingBatch } from '../engine/orders';
import { loadPending, savePending } from './pending';

const now = Date.parse('2026-10-06T02:00:00Z');

const batch: PendingBatch = {
  owner: 'student-1|lunch',
  dates: {
    '2026-10-08': { cartKey: 'cart-1', requestId: 'request-1', had: [] },
    '2026-10-15': { cartKey: 'cart-1', requestId: 'request-2', had: ['order-9'] },
  },
};

beforeEach(() => window.sessionStorage.clear());

describe('carts that got no answer, kept for the tab', () => {
  it('come back as they were saved', () => {
    savePending({ [batch.owner]: batch }, now);
    expect(loadPending(now + 60_000)).toEqual({ [batch.owner]: batch });
  });

  it('leave nothing behind once none are held', () => {
    savePending({ [batch.owner]: batch }, now);
    savePending({}, now);
    expect(window.sessionStorage.getItem('tuckshop.pending')).toBeNull();
    expect(loadPending(now)).toEqual({});
  });

  it('are let go after a day, when the history would show anything that went in', () => {
    savePending({ [batch.owner]: batch }, now);
    expect(loadPending(now + 25 * 60 * 60 * 1000)).toEqual({});
  });

  it('drop anything they do not recognise', () => {
    const saved = (batches: unknown, savedAt: unknown = now) => {
      window.sessionStorage.setItem('tuckshop.pending', JSON.stringify({ savedAt, batches }));
      return loadPending(now);
    };
    expect(saved({ [batch.owner]: batch }, 'yesterday')).toEqual({});
    expect(saved(null)).toEqual({});
    // Filed under someone else, or with a date missing its keys.
    expect(saved({ 'student-2|lunch': batch })).toEqual({});
    expect(
      saved({ [batch.owner]: { ...batch, dates: { '2026-10-08': { cartKey: 'cart-1' } } } }),
    ).toEqual({});
    window.sessionStorage.setItem('tuckshop.pending', '{not json');
    expect(loadPending(now)).toEqual({});
  });
});
