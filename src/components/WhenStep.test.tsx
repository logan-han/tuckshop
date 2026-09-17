import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExistingOrders } from '../engine/orders';
import { presetsFor } from '../engine/schedule';
import type { Plan } from '../state/plan';
import { makeHistoryOrder, THURSDAYS } from '../test/fixtures';
import WhenStep from './WhenStep';

const presets = presetsFor(null);

const plan: Plan = {
  weekdays: [4],
  presetId: 'vic-2026-t4',
  from: '2026-10-05',
  to: '2026-12-18',
  excluded: [{ date: '2026-11-03', reason: 'Melbourne Cup Day' }],
};

const noOrders: ExistingOrders = new Map();

function renderStep(overrides: Partial<Parameters<typeof WhenStep>[0]> = {}) {
  const onChange = vi.fn();
  const onBack = vi.fn();
  const onContinue = vi.fn();
  render(
    <WhenStep
      plan={plan}
      presets={presets}
      dates={THURSDAYS}
      existing={noOrders}
      onChange={onChange}
      onBack={onBack}
      onContinue={onContinue}
      {...overrides}
    />,
  );
  return { onChange, onBack, onContinue };
}

describe('WhenStep', () => {
  it('toggles a weekday on and off, keeping them in order', async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep();

    expect(screen.getByRole('button', { name: 'Thursday' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Tuesday' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ weekdays: [2, 4] }));

    await user.click(screen.getByRole('button', { name: 'Thursday' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ weekdays: [] }));
  });

  it('takes the dates and the holidays from the term that is picked', async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep();

    await user.selectOptions(screen.getByLabelText('Term'), 'vic-2027-t1');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        presetId: 'vic-2027-t1',
        from: '2027-01-28',
        to: '2027-03-25',
        excluded: [{ date: '2027-03-08', reason: 'Labour Day' }],
      }),
    );

    await user.selectOptions(screen.getByLabelText('Term'), 'custom');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ presetId: 'custom' }));
  });

  it('turns a hand-picked range into a custom term', () => {
    const { onChange } = renderStep();
    expect(screen.queryByText(/on or before the end date/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-02' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ presetId: 'custom', from: '2026-11-02' }),
    );

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-12-01' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ presetId: 'custom', to: '2026-12-01' }),
    );
  });

  it('warns when the range runs backwards', () => {
    renderStep({ plan: { ...plan, from: '2026-12-18', to: '2026-10-05' }, dates: [] });
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a start date on or before the end');
    expect(screen.getByRole('button', { name: 'Choose the food' })).toBeDisabled();
  });

  it('adds and drops skipped dates, flagging one that is not a chosen weekday', async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep();

    const skipped = screen.getByRole('list', { name: 'Skipped dates' });
    // 3 November 2026 is a Tuesday, and only Thursdays are being ordered.
    expect(skipped).toHaveTextContent('Tue 3 Nov (not one of your days)');
    expect(skipped).toHaveTextContent('Melbourne Cup Day');

    expect(screen.getByRole('button', { name: 'Skip it' })).toBeDisabled();
    await user.type(screen.getByLabelText('Skip another date'), '2026-10-22');
    await user.click(screen.getByRole('button', { name: 'Skip it' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        excluded: [
          { date: '2026-10-22', reason: 'Skipped' },
          { date: '2026-11-03', reason: 'Melbourne Cup Day' },
        ],
      }),
    );

    await user.click(screen.getByRole('button', { name: 'keep it' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ excluded: [] }));
  });

  it('says when nothing is skipped', () => {
    renderStep({ plan: { ...plan, excluded: [] } });
    expect(screen.getByRole('list', { name: 'Skipped dates' })).toHaveTextContent(
      'Nothing skipped.',
    );
  });

  it('counts the lunches and names the first and last', () => {
    renderStep();
    expect(screen.getByText(/lunches to order/)).toHaveTextContent(
      '3 lunches to order · first Thu 8 Oct, last Thu 22 Oct',
    );
  });

  it('counts a single lunch in the singular', () => {
    renderStep({ dates: [THURSDAYS[0]] });
    expect(screen.getByText(/lunch to order/)).toHaveTextContent('1 lunch to order');
  });

  it('points out dates that already have an order and offers to skip them all', async () => {
    const user = userEvent.setup();
    const existing = new Map(THURSDAYS.map((date) => [date, [makeHistoryOrder(date)]]));
    const { onChange } = renderStep({ existing });

    expect(screen.getByText(/already ordered/)).toHaveTextContent('3 already ordered');
    expect(screen.getByRole('status')).toHaveTextContent(
      'There is already an order for Thu 8 Oct, Thu 15 Oct, Thu 22 Oct.',
    );

    await user.click(screen.getByRole('button', { name: 'Skip them' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        excluded: [
          { date: '2026-10-08', reason: 'Already ordered' },
          { date: '2026-10-15', reason: 'Already ordered' },
          { date: '2026-10-22', reason: 'Already ordered' },
          { date: '2026-11-03', reason: 'Melbourne Cup Day' },
        ],
      }),
    );
  });

  it('shortens a long list of already-ordered dates', () => {
    const dates = [...THURSDAYS, '2026-10-29', '2026-11-05'];
    renderStep({ dates, existing: new Map(dates.map((d) => [d, [makeHistoryOrder(d)]])) });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Thu 8 Oct, Thu 15 Oct, Thu 22 Oct and 2 more',
    );
  });

  it('moves on only when there is something to order', async () => {
    const user = userEvent.setup();
    const { onBack, onContinue } = renderStep();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Choose the food' }));
    expect(onContinue).toHaveBeenCalled();
  });
});
