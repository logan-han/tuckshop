import { makeItem } from './pricing.test';
import {
  copyToAllDays,
  daysWithoutFood,
  planTotals,
  selectionsForDate,
  withDay,
} from './selections';

const tenders = { item: makeItem(), quantity: 1, options: [], questions: [] };
const hotdog = {
  item: makeItem({ itemKey: 'hotdog', name: 'Hot Dog', itemPrice: 4.5 }),
  quantity: 2,
  options: [],
  questions: [],
};

describe('selections by weekday', () => {
  const byDay = { 4: [tenders], 5: [hotdog] };

  it('finds the food for a date by its weekday', () => {
    expect(selectionsForDate(byDay, '2026-10-08')).toEqual([tenders]); // Thursday
    expect(selectionsForDate(byDay, '2026-10-09')).toEqual([hotdog]); // Friday
    expect(selectionsForDate(byDay, '2026-10-05')).toEqual([]); // Monday, nothing chosen
  });

  it('reports chosen weekdays with an empty bag', () => {
    expect(daysWithoutFood(byDay, [4, 5])).toEqual([]);
    expect(daysWithoutFood(byDay, [1, 4, 5])).toEqual([1]);
    expect(daysWithoutFood(withDay(byDay, 5, []), [4, 5])).toEqual([5]);
  });

  it('copies one day onto every chosen day', () => {
    expect(copyToAllDays(byDay, 4, [1, 4, 5])).toEqual({
      1: [tenders],
      4: [tenders],
      5: [tenders],
    });
  });

  it('costs the plan date by date with a fee per lunch', () => {
    const dates = ['2026-10-08', '2026-10-09', '2026-10-15', '2026-10-16', '2026-10-12'];
    // two Thursdays at 4.90, two Fridays at 9.00, a Monday with nothing chosen
    expect(planTotals(byDay, dates, 0.33)).toEqual({
      lunches: 4,
      items: 27.8,
      fees: 1.32,
      total: 29.12,
    });
    expect(planTotals({}, dates, 0.33)).toEqual({ lunches: 0, items: 0, fees: 0, total: 0 });
  });
});
