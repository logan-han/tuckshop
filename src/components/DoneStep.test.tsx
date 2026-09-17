import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrderOutcome } from '../engine/orders';
import DoneStep from './DoneStep';

function placed(date: string): OrderOutcome {
  return { date, placed: true, message: 'Placed', orderKey: `order-${date}` };
}

function refused(date: string): OrderOutcome {
  return { date, placed: false, message: 'The cut-off time for that date has passed.' };
}

function renderStep(outcomes: OrderOutcome[]) {
  const onPlanAnother = vi.fn();
  const onShowOrders = vi.fn();
  render(
    <DoneStep
      studentName="Sam"
      outcomes={outcomes}
      onPlanAnother={onPlanAnother}
      onShowOrders={onShowOrders}
    />,
  );
  return { onPlanAnother, onShowOrders };
}

describe('DoneStep', () => {
  it('counts a single lunch in the singular and offers the next step', async () => {
    const user = userEvent.setup();
    const { onPlanAnother, onShowOrders } = renderStep([placed('2026-10-08')]);

    expect(screen.getByRole('heading', { name: '1 lunch ordered for Sam' })).toBeInTheDocument();
    expect(screen.getByText('Thu 8 Oct')).toBeInTheDocument();
    expect(screen.queryByText(/Flexischools declined/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'See upcoming orders' }));
    expect(onShowOrders).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Plan more lunches' }));
    expect(onPlanAnother).toHaveBeenCalled();
  });

  it('says how many of the batch made it, and why the rest did not', () => {
    renderStep([placed('2026-10-08'), refused('2026-10-15'), refused('2026-10-22')]);

    expect(screen.getByRole('heading', { name: '1 of 3 lunches ordered' })).toBeInTheDocument();
    expect(screen.getByText(/Flexischools declined 2 dates/)).toBeInTheDocument();
    expect(screen.getAllByText('The cut-off time for that date has passed.')).toHaveLength(2);
  });

  it('is plain about a batch where nothing was placed', () => {
    renderStep([refused('2026-10-08')]);

    expect(screen.getByRole('heading', { name: 'Nothing was ordered' })).toBeInTheDocument();
    expect(screen.getByText(/Flexischools declined 1 date\./)).toBeInTheDocument();
  });

  it('pluralises a batch that all went through', () => {
    renderStep([placed('2026-10-08'), placed('2026-10-15')]);
    expect(screen.getByRole('heading', { name: '2 lunches ordered for Sam' })).toBeInTheDocument();
  });
});
