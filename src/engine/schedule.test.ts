import {
  addDays,
  dateOf,
  describeCount,
  formatLong,
  formatShort,
  isIsoDate,
  listDates,
  mondayOf,
  todayIso,
  weekdayOf,
  weeksCovering,
} from './schedule';

describe('schedule', () => {
  it('knows Thursday 10 September 2026 is a Thursday', () => {
    expect(weekdayOf('2026-09-10')).toBe(4);
    expect(weekdayOf('2026-09-13')).toBe(7);
  });

  it('lists every Thursday of Tintern term 4, skipping exclusions', () => {
    const dates = listDates({
      from: '2026-10-05',
      to: '2026-12-09',
      weekdays: [4],
      excluded: ['2026-11-05'],
    });
    expect(dates).toEqual([
      '2026-10-08',
      '2026-10-15',
      '2026-10-22',
      '2026-10-29',
      '2026-11-12',
      '2026-11-19',
      '2026-11-26',
      '2026-12-03',
    ]);
  });

  it('drops days before notBefore and handles mixed weekdays', () => {
    const dates = listDates({
      from: '2026-09-07',
      to: '2026-09-18',
      weekdays: [1, 5],
      notBefore: '2026-09-08',
    });
    expect(dates).toEqual(['2026-09-11', '2026-09-14', '2026-09-18']);
  });

  it('returns nothing for a reversed or invalid range', () => {
    expect(listDates({ from: '2026-10-05', to: '2026-10-01', weekdays: [1] })).toEqual([]);
    expect(listDates({ from: 'nope', to: '2026-10-01', weekdays: [1] })).toEqual([]);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
  });

  it('crosses a DST change without skipping a day', () => {
    // Melbourne moves to AEDT on Sunday 4 October 2026.
    expect(listDates({ from: '2026-10-01', to: '2026-10-08', weekdays: [1, 2, 3, 4, 5] })).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
    ]);
  });

  it('finds Mondays and one week per lookup', () => {
    expect(mondayOf('2026-09-10')).toBe('2026-09-07');
    expect(mondayOf('2026-09-07')).toBe('2026-09-07');
    expect(mondayOf('2026-09-13')).toBe('2026-09-07');
    expect(weeksCovering(['2026-09-10', '2026-09-11', '2026-09-17'])).toEqual([
      '2026-09-07',
      '2026-09-14',
    ]);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('formats for Australians', () => {
    expect(formatShort('2026-09-10')).toBe('Thu 10 Sep');
    expect(formatShort('2026-12-03')).toBe('Thu 3 Dec');
    expect(formatLong('2026-09-10')).toBe('Thursday 10 September 2026');
    expect(dateOf('2026-09-10T12:40:00')).toBe('2026-09-10');
  });

  it('describes the plan in words', () => {
    expect(describeCount(9, [4])).toBe('9 Thursdays');
    expect(describeCount(4, [1, 5])).toBe('4 Mondays and Fridays');
    expect(describeCount(3, [1, 3, 5])).toBe('3 Mondays, Wednesdays and Fridays');
    expect(describeCount(0, [])).toBe('0 days');
  });

  it('reports Melbourne’s date, not UTC’s', () => {
    // 21:56 UTC on Sunday 6 September is already Monday morning in Melbourne.
    expect(todayIso(new Date('2026-09-06T21:56:00Z'))).toBe('2026-09-07');
  });
});
