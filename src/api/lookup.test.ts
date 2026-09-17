import type { FulfillmentDate } from './types';
import { getFulfillmentDates } from './flexischools';
import { getFulfillmentDatesFor, mapWithConcurrency } from './lookup';

vi.mock('./flexischools', () => ({ getFulfillmentDates: vi.fn() }));

const fetchWeek = vi.mocked(getFulfillmentDates);

function entry(date: string): FulfillmentDate {
  return {
    fulfillmentDate: `${date}T12:40:00`,
    hasCutOffTimePassed: false,
    supplierDistributionTimeKey: { id: 1, value: 'dist' },
    closureReason: null,
  };
}

/** The API answers with the five weekdays from the Monday it was asked about. */
function week(monday: string): FulfillmentDate[] {
  const [y, m, d] = monday.split('-').map(Number);
  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1, d + i));
    return entry(date.toISOString().slice(0, 10));
  });
}

beforeEach(() => {
  fetchWeek.mockReset();
});

describe('getFulfillmentDatesFor', () => {
  it('asks once per week and keeps only the dates that were wanted', async () => {
    fetchWeek.mockImplementation((_s, _svc, monday) => Promise.resolve(week(monday)));

    const map = await getFulfillmentDatesFor('student-1', 'lunch', [
      '2026-10-08',
      '2026-10-09',
      '2026-10-15',
    ]);

    expect(fetchWeek.mock.calls.map((call) => call[2])).toEqual(['2026-10-05', '2026-10-12']);
    expect([...map.keys()]).toEqual(['2026-10-08', '2026-10-09', '2026-10-15']);
    expect(map.get('2026-10-08')?.fulfillmentDate).toBe('2026-10-08T12:40:00');
  });

  it('leaves out dates the canteen does not list, and keeps the first of any duplicate', async () => {
    fetchWeek.mockResolvedValue([
      entry('2026-10-08'),
      { ...entry('2026-10-08'), closureReason: 'Later copy' },
    ]);

    const map = await getFulfillmentDatesFor('student-1', 'lunch', ['2026-10-08', '2026-10-09']);

    expect(map.get('2026-10-08')?.closureReason).toBeNull();
    expect(map.has('2026-10-09')).toBe(false);
  });
});

describe('mapWithConcurrency', () => {
  it('keeps results in order while running several at a time', async () => {
    let running = 0;
    let peak = 0;
    const results = await mapWithConcurrency([10, 20, 30, 40, 50], 2, async (value, index) => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
      return `${index}:${value}`;
    });

    expect(results).toEqual(['0:10', '1:20', '2:30', '3:40', '4:50']);
    expect(peak).toBe(2);
  });

  it('never starts more workers than there are items', async () => {
    const seen: number[] = [];
    expect(await mapWithConcurrency([], 4, async () => seen.push(1))).toEqual([]);
    expect(await mapWithConcurrency([7], 4, async (n) => n * 2)).toEqual([14]);
  });
});
