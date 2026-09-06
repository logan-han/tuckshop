import { dateOf, weeksCovering } from '../engine/schedule';
import { getFulfillmentDates } from './flexischools';
import type { FulfillmentDate } from './types';

/**
 * Fulfilment-date records for each requested date, fetched one week at a time (the API
 * returns five consecutive days per call). Dates the canteen does not list are absent.
 */
export async function getFulfillmentDatesFor(
  studentKey: string,
  supplierServiceKey: string,
  dates: string[],
): Promise<Map<string, FulfillmentDate>> {
  const weeks = weeksCovering(dates);
  const pages = await Promise.all(
    weeks.map((monday) => getFulfillmentDates(studentKey, supplierServiceKey, monday)),
  );
  const wanted = new Set(dates);
  const map = new Map<string, FulfillmentDate>();
  for (const page of pages) {
    for (const entry of page) {
      const date = dateOf(entry.fulfillmentDate);
      if (wanted.has(date) && !map.has(date)) map.set(date, entry);
    }
  }
  return map;
}

/** Runs fn over items with at most `limit` in flight, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
