import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, cancelOrder, getOrderHistory } from '../api/flexischools';
import type { HistoryOrder, OrderHistory } from '../api/types';
import { makeHistoryOrder, THURSDAYS } from '../test/fixtures';
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

function renderOrders() {
  const onError = vi.fn();
  const onChanged = vi.fn();
  render(<UpcomingOrders onError={onError} onChanged={onChanged} />);
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
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onChanged } = renderOrders();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(confirm).toHaveBeenCalledWith(
      'Cancel Sam Example’s Lunch on Thu 8 Oct? Flexischools refunds it to your wallet.',
    );
    expect(cancel).toHaveBeenCalledWith(`order-${THURSDAYS[0]}`);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // The list is fetched again so a cancellation made elsewhere shows up too.
    expect(history).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });

  it('leaves the order alone when the confirmation is dismissed', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onChanged } = renderOrders();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(cancel).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    confirm.mockRestore();
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
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    cancel.mockRejectedValue(new ApiError(403, '', '/api/v1.0/orders/order-1'));
    const { onError, onChanged } = renderOrders();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Flexischools refused that request');
    expect(onError).toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    const list = screen.getByRole('list');
    expect(within(list).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    confirm.mockRestore();
  });
});
