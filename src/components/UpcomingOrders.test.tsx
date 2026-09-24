import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, cancelOrder, getOrderHistory } from '../api/flexischools';
import type { HistoryOrder, OrderHistory } from '../api/types';
import { makeHistoryOrder, student, THURSDAYS } from '../test/fixtures';
import UpcomingOrders from './UpcomingOrders';

vi.mock('../api/flexischools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/flexischools')>()),
  getOrderHistory: vi.fn(),
  cancelOrder: vi.fn(),
}));

const history = vi.mocked(getOrderHistory);
const cancel = vi.mocked(cancelOrder);

function historyWith(...groups: Array<{ dueDate: string; orders: HistoryOrder[] }>): OrderHistory {
  return { hasMoreOrders: false, orderCount: 0, presentOrders: groups, pastOrders: [] };
}

function group(date: string, orders = [makeHistoryOrder(date)]) {
  return { dueDate: `${date}T12:40:00`, orders };
}

function renderOrders(onlyChild: string | null = null) {
  const onError = vi.fn();
  const onChanged = vi.fn();
  render(<UpcomingOrders onlyChild={onlyChild} onError={onError} onChanged={onChanged} />);
  return { onError, onChanged };
}

beforeEach(() => {
  history.mockReset();
  cancel.mockReset();
  history.mockResolvedValue(historyWith(group(THURSDAYS[0])));
  cancel.mockResolvedValue(undefined);
});

describe('UpcomingOrders', () => {
  it('lists what is ordered, soonest first, once the history arrives', async () => {
    history.mockResolvedValue(historyWith(group(THURSDAYS[1]), group(THURSDAYS[0])));
    renderOrders();

    expect(screen.getByText('Loading orders…')).toBeInTheDocument();
    const rows = await screen.findAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Thu 8 Oct'),
      expect.stringContaining('Thu 15 Oct'),
    ]);
    expect(rows[0]).toHaveTextContent('Sam Example · Chicken Tenders (2) · $5.23');
    expect(history).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 200, toDate: expect.any(String) }),
    );
  });

  it('leaves out the name when there is only the one child', async () => {
    renderOrders(student.studentKey);
    const [row] = await screen.findAllByRole('listitem');
    expect(row).toHaveTextContent('Thu 8 Oct');
    expect(row).toHaveTextContent('Chicken Tenders (2) · $5.23');
    expect(row).not.toHaveTextContent('Sam Example');
  });

  it('names the orders of a child who is not listed, such as one with no open service', async () => {
    const sibling = makeHistoryOrder(THURSDAYS[1], {
      orderKey: { id: 2, value: 'order-sibling' },
      studentKey: { id: 2, value: 'student-2' },
      studentName: 'Alex Example',
    });
    history.mockResolvedValue(historyWith(group(THURSDAYS[1], [sibling])));
    renderOrders(student.studentKey);

    const [row] = await screen.findAllByRole('listitem');
    expect(row).toHaveTextContent('Alex Example · Chicken Tenders (2)');
  });

  it('shows the quantity when more than one of an item was ordered', async () => {
    history.mockResolvedValue(
      historyWith(
        group(THURSDAYS[0], [
          makeHistoryOrder(THURSDAYS[0], {
            orderItems: [
              {
                orderItemId: 1,
                itemId: 1,
                itemDisplayName: 'Sushi Roll - Tuna',
                quantityOrdered: 2,
                predefined: false,
              },
            ],
          }),
        ]),
      ),
    );
    renderOrders();
    expect(await screen.findByText(/2 × Sushi Roll/)).toBeInTheDocument();
  });

  it('leaves out anything that is not food and counts cancelled orders as gone', async () => {
    history.mockResolvedValue(
      historyWith(
        group(THURSDAYS[0], [
          makeHistoryOrder(THURSDAYS[0], { supplierServiceCategory: 'Uniform' }),
          makeHistoryOrder(THURSDAYS[0], {
            orderKey: { id: 2, value: 'order-cancelled' },
            orderState: 'CancelledByUser',
          }),
        ]),
      ),
    );
    renderOrders();

    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByText('No upcoming lunch orders.')).toBeInTheDocument();
  });

  it('says so when nothing is coming up', async () => {
    history.mockResolvedValue(historyWith());
    renderOrders();
    expect(await screen.findByText('No upcoming lunch orders.')).toBeInTheDocument();
  });

  it('cancels an order once it is confirmed, then reloads and tells the parent', async () => {
    const user = userEvent.setup();
    const { onChanged } = renderOrders();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(cancel).not.toHaveBeenCalled();
    const yes = screen.getByRole('button', {
      name: 'Yes, cancel Sam Example’s Lunch on Thu 8 Oct',
    });
    expect(yes).toHaveFocus();
    await user.click(yes);

    expect(cancel).toHaveBeenCalledWith(`order-${THURSDAYS[0]}`);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // The list is fetched again so a cancellation made elsewhere shows up too.
    expect(history).toHaveBeenCalledTimes(2);
  });

  it('asks about one order at a time', async () => {
    const user = userEvent.setup();
    history.mockResolvedValue(historyWith(group(THURSDAYS[0]), group(THURSDAYS[1])));
    renderOrders();

    const [first, second] = await screen.findAllByRole('listitem');
    await user.click(within(first).getByRole('button', { name: 'Cancel' }));
    await user.click(within(second).getByRole('button', { name: 'Cancel' }));
    expect(within(first).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(second).getByRole('button', { name: /^Yes, cancel/ })).toBeInTheDocument();
  });

  it('leaves the order alone when it is kept', async () => {
    const user = userEvent.setup();
    const { onChanged } = renderOrders();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(cancel).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    // Back where the parent was, not dropped at the top of the page.
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('reports a history that could not be loaded', async () => {
    history.mockRejectedValue(new ApiError(500, '', '/api/v1.0/orders/order-history'));
    const { onError } = renderOrders();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Flexischools is having trouble right now.',
    );
    expect(onError).toHaveBeenCalled();
    expect(screen.queryByText('Loading orders…')).not.toBeInTheDocument();
  });

  it('reports a cancellation that was refused and puts the button back', async () => {
    const user = userEvent.setup();
    cancel.mockRejectedValue(new ApiError(400, '', '/api/v1.0/orders/order-1'));
    const { onError, onChanged } = renderOrders();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: /^Yes, cancel/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Flexischools would not cancel Sam Example’s Lunch on Thu 8 Oct. It may be past the day’s cut-off.',
    );
    expect(onError).toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    const list = screen.getByRole('list');
    expect(within(list).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(within(list).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('says to try again when Flexischools could not be reached', async () => {
    const user = userEvent.setup();
    cancel.mockRejectedValue(new ApiError(503, '', '/api/v1.0/orders/order-1'));
    renderOrders();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: /^Yes, cancel/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Flexischools is having trouble right now. Try again in a minute.',
    );
  });
});
