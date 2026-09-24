import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrderOutcome } from '../engine/orders';
import { student } from '../test/fixtures';
import DoneStep from './DoneStep';

function placed(date: string): OrderOutcome {
  return { date, placed: true, message: 'Placed', orderKey: `order-${date}` };
}

function refused(date: string): OrderOutcome {
  return { date, placed: false, message: 'The cut-off time for that date has passed.' };
}

const alex = { ...student, studentKey: 'student-2', studentFirstName: 'Alex' };

function renderStep(outcomes: OrderOutcome[], otherStudents = [alex]) {
  const spies = {
    onPlanAnother: vi.fn(),
    onShowOrders: vi.fn(),
    onFix: vi.fn(),
    onOrderFor: vi.fn(),
  };
  render(
    <DoneStep studentName="Sam" outcomes={outcomes} otherStudents={otherStudents} {...spies} />,
  );
  return spies;
}

describe('DoneStep', () => {
  it('counts a single lunch in the singular and offers the next step', async () => {
    const user = userEvent.setup();
    const { onPlanAnother, onShowOrders } = renderStep([placed('2026-10-08')]);

    expect(screen.getByRole('heading', { name: '1 lunch ordered for Sam' })).toBeInTheDocument();
    expect(screen.getByText('Thu 8 Oct')).toBeInTheDocument();
    expect(screen.queryByText(/Flexischools declined/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Fix/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'See upcoming orders' }));
    expect(onShowOrders).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Plan more lunches' }));
    expect(onPlanAnother).toHaveBeenCalled();
  });

  it('says how many of the batch made it, and why the rest did not', async () => {
    const user = userEvent.setup();
    const { onFix } = renderStep([
      placed('2026-10-08'),
      refused('2026-10-15'),
      refused('2026-10-22'),
    ]);

    expect(screen.getByRole('heading', { name: '1 of 3 lunches ordered' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Flexischools declined 2 dates; the reasons are below. The rest are ordered.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('The cut-off time for that date has passed.')).toHaveLength(2);

    // Back to the food, on the first of them.
    await user.click(screen.getByRole('button', { name: 'Fix 2 dates' }));
    expect(onFix).toHaveBeenCalledWith('2026-10-15');
  });

  it('is plain about a batch where nothing was placed', async () => {
    const user = userEvent.setup();
    const { onFix } = renderStep([refused('2026-10-08')]);

    expect(screen.getByRole('heading', { name: 'Nothing was ordered' })).toBeInTheDocument();
    expect(
      screen.getByText('Flexischools declined 1 date; the reason is below.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fix 8 Oct' }));
    expect(onFix).toHaveBeenCalledWith('2026-10-08');
  });

  it('offers to order for the other children', async () => {
    const user = userEvent.setup();
    const { onOrderFor } = renderStep([placed('2026-10-08')]);

    await user.click(screen.getByRole('button', { name: 'Order for Alex' }));
    expect(onOrderFor).toHaveBeenCalledWith(alex);
  });

  it('pluralises a batch that all went through', () => {
    renderStep([placed('2026-10-08'), placed('2026-10-15')]);
    expect(screen.getByRole('heading', { name: '2 lunches ordered for Sam' })).toBeInTheDocument();
  });
});
