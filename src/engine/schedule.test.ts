import {
  TERM_PRESETS,
  addDays,
  presetsFor,
  dateOf,
  describeCount,
  formatDayMonth,
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
    expect(formatDayMonth('2026-12-03')).toBe('3 Dec');
    expect(formatLong('2026-09-10')).toBe('Thursday 10 September 2026');
    expect(dateOf('2026-09-10T12:40:00')).toBe('2026-09-10');
  });

  it('describes the plan in words', () => {
    expect(describeCount(9, [4])).toBe('9 Thursdays');
    expect(describeCount(1, [4])).toBe('1 Thursday');
    expect(describeCount(8, [1, 2, 3, 4])).toBe('8 lunches, Mon to Thu');
    expect(describeCount(4, [1, 5])).toBe('4 lunches, Mon and Fri');
    expect(describeCount(3, [1, 3, 5])).toBe('3 lunches, Mon, Wed and Fri');
    expect(describeCount(0, [])).toBe('0 lunches');
    expect(describeCount(1, [2, 3])).toBe('1 lunch, Tue to Wed');
  });

  it('reports Melbourne’s date, not UTC’s', () => {
    // 21:56 UTC on Sunday 6 September is already Monday morning in Melbourne.
    expect(todayIso(new Date('2026-09-06T21:56:00Z'))).toBe('2026-09-07');
  });

  it('ships presets whose dates are valid, ordered and whose exclusions fall inside the term', () => {
    for (const preset of TERM_PRESETS) {
      expect(isIsoDate(preset.from), preset.id).toBe(true);
      expect(isIsoDate(preset.to), preset.id).toBe(true);
      expect(preset.from < preset.to, preset.id).toBe(true);
      for (const { date } of preset.excluded) {
        expect(isIsoDate(date), `${preset.id} ${date}`).toBe(true);
        expect(date >= preset.from && date <= preset.to, `${preset.id} ${date}`).toBe(true);
        expect(weekdayOf(date), `${preset.id} ${date} is a weekend`).toBeLessThanOrEqual(5);
      }
    }
    for (const school of new Set(TERM_PRESETS.map((p) => p.school))) {
      const starts = TERM_PRESETS.filter((p) => p.school === school).map((p) => p.from);
      expect([...starts].sort(), String(school)).toEqual(starts);
    }
    expect(presetsFor('Tintern Grammar').every((p) => p.school === 'Tintern Grammar')).toBe(true);
    expect(presetsFor('Tintern Grammar').map((p) => p.id)).toContain('tintern-2027-t4');
    expect(presetsFor('Mooroolbark College').every((p) => p.school === null)).toBe(true);
    expect(presetsFor(null).map((p) => p.id)).toContain('vic-2028-t4');
  });

  it('knows the 2027 Tintern terms', () => {
    const t4 = TERM_PRESETS.find((p) => p.id === 'tintern-2027-t4');
    expect(t4).toMatchObject({ from: '2027-10-04', to: '2027-12-09' });
    expect(
      listDates({
        from: t4!.from,
        to: t4!.to,
        weekdays: [1],
        excluded: t4!.excluded.map((e) => e.date),
      }),
    ).toHaveLength(9);
    expect(
      listDates({
        from: t4!.from,
        to: t4!.to,
        weekdays: [2],
        excluded: t4!.excluded.map((e) => e.date),
      }),
    ).not.toContain('2027-11-02');
    expect(weekdayOf('2027-02-02')).toBe(2);
    expect(weekdayOf('2027-03-08')).toBe(1);
    expect(weekdayOf('2027-06-14')).toBe(1);
    expect(weekdayOf('2027-08-20')).toBe(5);
  });
});
