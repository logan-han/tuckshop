import { makeItem } from './pricing.test';
import {
  bagFor,
  copyToAllDays,
  datesWithoutFood,
  describeMissing,
  EMPTY_BAGS,
  hasOwnBag,
  ownBagDates,
  planTotals,
  selectionsForDate,
  setBag,
  type Bags,
} from './selections';

const tenders = { item: makeItem(), quantity: 1, options: [], questions: [] };
const hotdog = {
  item: makeItem({ itemKey: 'hotdog', name: 'Hot Dog', itemPrice: 4.5 }),
  quantity: 2,
  options: [],
  questions: [],
};
const sushi = {
  item: makeItem({ itemKey: 'sushi', name: 'Sushi', itemPrice: 6.5 }),
  quantity: 1,
  options: [],
  questions: [],
};

// Thursdays get tenders, Fridays a hot dog, and the second Thursday has sushi of its own.
const bags: Bags = { byDay: { 4: [tenders], 5: [hotdog] }, byDate: { '2026-10-15': [sushi] } };
// Thu, Fri, Thu, Fri, Mon
const dates = ['2026-10-08', '2026-10-09', '2026-10-15', '2026-10-16', '2026-10-12'];

describe('bags by weekday and by date', () => {
  it('finds the food for a date: its own bag first, then its weekday', () => {
    expect(selectionsForDate(bags, '2026-10-08')).toEqual([tenders]);
    expect(selectionsForDate(bags, '2026-10-15')).toEqual([sushi]);
    expect(selectionsForDate(bags, '2026-10-09')).toEqual([hotdog]);
    expect(selectionsForDate(bags, '2026-10-05')).toEqual([]); // Monday, nothing chosen
  });

  it('shows a date without its own bag what its weekday has', () => {
    expect(bagFor(bags, { day: 5 })).toEqual([hotdog]);
    expect(bagFor(bags, { date: '2026-10-08' })).toEqual([tenders]);
    expect(bagFor(bags, { date: '2026-10-15' })).toEqual([sushi]);
    expect(hasOwnBag(bags, '2026-10-15')).toBe(true);
    expect(hasOwnBag(bags, '2026-10-08')).toBe(false);
  });

  it('gives a date its own bag and hands it back to the weekday when emptied', () => {
    const own = setBag(bags, { date: '2026-10-08' }, [hotdog]);
    expect(selectionsForDate(own, '2026-10-08')).toEqual([hotdog]);
    expect(selectionsForDate(own, '2026-10-22')).toEqual([tenders]); // other Thursdays unchanged
    const back = setBag(own, { date: '2026-10-08' }, []);
    expect(back.byDate).toEqual(bags.byDate);
    expect(selectionsForDate(back, '2026-10-08')).toEqual([tenders]);
    expect(setBag(bags, { day: 4 }, [sushi]).byDay).toEqual({ 4: [sushi], 5: [hotdog] });
  });

  it('lists the planned dates that would get nothing, and those with their own lunch', () => {
    expect(datesWithoutFood(bags, dates)).toEqual(['2026-10-12']);
    expect(datesWithoutFood(setBag(bags, { day: 5 }, []), dates)).toEqual([
      '2026-10-09',
      '2026-10-16',
      '2026-10-12',
    ]);
    expect(ownBagDates(bags, dates)).toEqual(['2026-10-15']);
    expect(ownBagDates(bags, ['2026-10-08'])).toEqual([]);
  });

  it('names what is missing by weekday when a whole weekday is empty, else by date', () => {
    expect(describeMissing(['2026-10-12'], dates)).toBe('Mondays');
    expect(describeMissing(['2026-10-09', '2026-10-16', '2026-10-12'], dates)).toBe(
      'Mondays and Fridays',
    );
    expect(describeMissing(['2026-10-08'], dates)).toBe('Thu 8 Oct');
    expect(describeMissing(['2026-10-08', '2026-10-16', '2026-10-12'], dates)).toBe(
      'Mondays, Thu 8 Oct and Fri 16 Oct',
    );
    const thursdays = [
      '2026-10-01',
      '2026-10-08',
      '2026-10-15',
      '2026-10-22',
      '2026-10-29',
      '2026-11-05',
    ];
    expect(describeMissing(thursdays.slice(0, 5), thursdays)).toBe(
      'Thu 1 Oct, Thu 8 Oct, Thu 15 Oct and 2 more dates',
    );
  });

  it('copies one day onto every chosen day, leaving dates with their own lunch alone', () => {
    const copied = copyToAllDays(bags, 4, [1, 4, 5]);
    expect(copied.byDay).toEqual({ 1: [tenders], 4: [tenders], 5: [tenders] });
    expect(copied.byDate).toEqual(bags.byDate);
  });

  it('costs the plan date by date with a fee per lunch', () => {
    // a Thursday at 4.90, the sushi Thursday at 6.50, two Fridays at 9.00, a Monday with nothing
    expect(planTotals(bags, dates, 0.33)).toEqual({
      lunches: 4,
      items: 29.4,
      fees: 1.32,
      total: 30.72,
    });
    expect(planTotals(EMPTY_BAGS, dates, 0.33)).toEqual({
      lunches: 0,
      items: 0,
      fees: 0,
      total: 0,
    });
  });
});
