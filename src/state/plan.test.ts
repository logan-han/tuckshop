import {
  applyPreset,
  currentPreset,
  defaultPlan,
  loadPlan,
  planDates,
  retargetPlan,
  savePlan,
} from './plan';

beforeEach(() => window.localStorage.clear());

describe('plan presets by school', () => {
  it('starts a Tintern student on Tintern’s current term and a government student on the state’s', () => {
    expect(currentPreset('2026-09-07', 'Tintern Grammar').id).toBe('tintern-2026-t3');
    expect(currentPreset('2026-09-18', 'Tintern Grammar').id).toBe('tintern-2026-t4');
    expect(currentPreset('2026-09-07', 'Ringwood Primary School').id).toBe('vic-2026-t3');
    expect(currentPreset('2099-01-01', 'Tintern Grammar').id).toBe('tintern-2027-t4');
    expect(defaultPlan('2026-10-01', 'Tintern Grammar')).toMatchObject({
      weekdays: [4],
      presetId: 'tintern-2026-t4',
      from: '2026-10-05',
      to: '2026-12-09',
    });
  });

  it('moves a plan from another school’s term onto this school’s, leaving custom ranges alone', () => {
    const govPlan = defaultPlan('2026-10-01', 'Some State School');
    expect(govPlan.presetId).toBe('vic-2026-t4');
    const retargeted = retargetPlan(govPlan, '2026-10-01', 'Tintern Grammar');
    expect(retargeted.presetId).toBe('tintern-2026-t4');
    expect(retargeted.to).toBe('2026-12-09');

    const own = defaultPlan('2026-10-01', 'Tintern Grammar');
    expect(retargetPlan(own, '2026-10-01', 'Tintern Grammar')).toBe(own);

    const custom = { ...own, presetId: 'custom', from: '2026-10-01', to: '2026-10-31' };
    expect(retargetPlan(custom, '2026-10-01', 'Tintern Grammar')).toBe(custom);
  });

  it('applies a preset or falls back to custom for unknown ids', () => {
    const plan = defaultPlan('2026-10-01', 'Tintern Grammar');
    expect(applyPreset(plan, 'vic-2027-t1')).toMatchObject({
      presetId: 'vic-2027-t1',
      from: '2027-01-28',
    });
    expect(applyPreset(plan, 'nope').presetId).toBe('custom');
  });

  it('remembers the plan and drops a range that has already passed', () => {
    const plan = { ...defaultPlan('2026-10-01', 'Tintern Grammar'), weekdays: [1, 3] };
    savePlan(plan);
    expect(loadPlan('2026-10-01', 'Tintern Grammar')).toEqual(plan);
    const later = loadPlan('2027-01-15', 'Tintern Grammar');
    expect(later.presetId).toBe('tintern-2027-t1');
    expect(later.weekdays).toEqual([1, 3]);
    expect(planDates(later, '2027-01-15')[0]).toBe('2027-02-03');
  });
});
