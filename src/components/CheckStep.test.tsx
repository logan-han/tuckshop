import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ApiError,
  getFulfillmentDates,
  getMenu,
  getOrderHistory,
  placeOrders,
} from '../api/flexischools';
import type { FulfillmentDate, OrderHistory, PlaceOrdersBody, Wallet } from '../api/types';
import { addDays } from '../engine/schedule';
import {
  lunch,
  makeCategory,
  makeFulfilment,
  makeHistoryOrder,
  makeMenu,
  makeSelection,
  student,
  sushi,
  tenders,
  THURSDAYS,
} from '../test/fixtures';
import CheckStep from './CheckStep';

vi.mock('../api/flexischools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/flexischools')>()),
  getFulfillmentDates: vi.fn(),
  getMenu: vi.fn(),
  getOrderHistory: vi.fn(),
  placeOrders: vi.fn(),
}));

const fulfilments = vi.mocked(getFulfillmentDates);
const menu = vi.mocked(getMenu);
const history = vi.mocked(getOrderHistory);
const place = vi.mocked(placeOrders);

const wallet: Wallet = {
  accountKey: 'account-1',
  availableBalance: 50,
  defaultPaymentMethodName: null,
  defaultPaymentMethodReference: null,
  topUpAmountOptions: [],
};

const emptyHistory: OrderHistory = {
  hasMoreOrders: false,
  orderCount: 0,
  presentOrders: [],
  pastOrders: [],
};

/** What the canteen calendar says about a date; null means it does not list it at all. */
let calendar: (date: string) => FulfillmentDate | null;

function renderStep(overrides: Partial<Parameters<typeof CheckStep>[0]> = {}) {
  const onBack = vi.fn();
  const onPlaced = vi.fn();
  const onError = vi.fn();
  render(
    <CheckStep
      student={student}
      service={lunch}
      dates={THURSDAYS}
      bags={{ byDay: { 4: [makeSelection(tenders)] }, byDate: {} }}
      feePerOrder={0.33}
      wallet={wallet}
      onBack={onBack}
      onPlaced={onPlaced}
      onError={onError}
      {...overrides}
    />,
  );
  return { onBack, onPlaced, onError };
}

function row(date: string) {
  return screen.getByRole('checkbox', { name: `Order for ${date}` }).closest('tr') as HTMLElement;
}

beforeEach(() => {
  fulfilments.mockReset();
  menu.mockReset();
  history.mockReset();
  place.mockReset();
  calendar = (date) => makeFulfilment(date);
  fulfilments.mockImplementation((_student, _service, monday) =>
    Promise.resolve(
      Array.from({ length: 5 }, (_, i) => calendar(addDays(monday, i))).flatMap((entry) =>
        entry ? [entry] : [],
      ),
    ),
  );
  menu.mockResolvedValue(makeMenu());
  history.mockResolvedValue(emptyHistory);
  place.mockImplementation((body: PlaceOrdersBody) =>
    Promise.resolve({
      isSuccessful: true,
      cartError: null,
      ordersResponse: body.placeOrderRequests.map((request) => ({
        orderRequestId: request.orderRequestId,
        orderPlaced: true,
        orderKey: { id: 1, value: `key-${request.dueDate}` },
        error: null,
      })),
    }),
  );
});

describe('CheckStep', () => {
  it('checks every date, totals the cart and places the batch', async () => {
    const user = userEvent.setup();
    const { onPlaced } = renderStep();

    expect(screen.getByRole('button', { name: 'Checking dates…' })).toBeDisabled();

    const placeButton = await screen.findByRole('button', {
      name: 'Place 3 orders for $15.69',
    });
    expect(screen.getAllByText('Ready')).toHaveLength(3);
    expect(screen.getByText('3 lunches')).toBeInTheDocument();
    expect(screen.getByText('$14.70')).toBeInTheDocument();
    expect(screen.getByText('Flexischools order fees ($0.33 each)')).toBeInTheDocument();
    expect(screen.getByText('$0.99')).toBeInTheDocument();
    expect(screen.getByText('Wallet balance')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();

    await user.click(placeButton);

    expect(place).toHaveBeenCalledTimes(1);
    const body = place.mock.calls[0][0];
    expect(body.totalCartAmount).toBe(15.69);
    expect(body.placeOrderRequests.map((request) => request.dueDate)).toEqual(
      THURSDAYS.map((date) => `${date}T12:40:00`),
    );
    expect(body.placeOrderRequests[0].items).toEqual([
      { itemKey: 'tenders', quantity: 1, options: [], questions: [] },
    ]);
    await waitFor(() =>
      expect(onPlaced).toHaveBeenCalledWith(
        THURSDAYS.map((date) => ({
          date,
          placed: true,
          message: 'Placed',
          orderKey: `key-${date}T12:40:00`,
        })),
        expect.arrayContaining([expect.objectContaining({ date: THURSDAYS[0] })]),
      ),
    );
  });

  it('takes a date off the batch when it is unticked', async () => {
    const user = userEvent.setup();
    renderStep();

    await screen.findByRole('button', { name: 'Place 3 orders for $15.69' });
    await user.click(screen.getByRole('checkbox', { name: 'Order for Thu 15 Oct' }));

    expect(screen.getByRole('button', { name: 'Place 2 orders for $10.46' })).toBeEnabled();
    expect(screen.getByText('2 lunches')).toBeInTheDocument();
  });

  it('explains a date that is closed, missed or not on the calendar', async () => {
    calendar = (date) => {
      if (date === THURSDAYS[0]) return null;
      if (date === THURSDAYS[1]) return makeFulfilment(date, { closureReason: 'Curriculum day' });
      return makeFulfilment(date, { hasCutOffTimePassed: true });
    };
    renderStep();

    await waitFor(() => expect(screen.getAllByText('Canteen closed')).toHaveLength(2));
    expect(row('Thu 8 Oct')).toHaveTextContent('Not on the canteen calendar');
    expect(row('Thu 15 Oct')).toHaveTextContent('Curriculum day');
    expect(row('Thu 22 Oct')).toHaveTextContent('Cut-off passed');
    for (const date of ['Thu 8 Oct', 'Thu 15 Oct', 'Thu 22 Oct']) {
      expect(screen.getByRole('checkbox', { name: `Order for ${date}` })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Place 0 orders for $0.00' })).toBeDisabled();
    // Nothing was worth a menu lookup.
    expect(menu).not.toHaveBeenCalled();
  });

  it('starts an already-ordered date unticked but lets a second order be added', async () => {
    const user = userEvent.setup();
    history.mockResolvedValue({
      ...emptyHistory,
      presentOrders: [
        { dueDate: `${THURSDAYS[1]}T12:40:00`, orders: [makeHistoryOrder(THURSDAYS[1])] },
      ],
    });
    renderStep();

    expect(await screen.findByText('Already ordered')).toBeInTheDocument();
    // The detail names what is already going in the bag that day.
    expect(row('Thu 15 Oct')).toHaveTextContent('Chicken Tenders (2)');
    const checkbox = screen.getByRole('checkbox', { name: 'Order for Thu 15 Oct' });
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Place 2 orders for $10.46' })).toBeEnabled();

    await user.click(checkbox);
    expect(screen.getByRole('button', { name: 'Place 3 orders for $15.69' })).toBeEnabled();
  });

  it('leaves a date with nothing in its bag out of the batch', async () => {
    renderStep({ bags: { byDay: {}, byDate: { [THURSDAYS[0]]: [makeSelection(tenders)] } } });

    await waitFor(() => expect(screen.getAllByText('Nothing chosen')).toHaveLength(2));
    expect(screen.getByRole('checkbox', { name: 'Order for Thu 15 Oct' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Place 1 order for $5.23' })).toBeEnabled();
  });

  it('re-checks each date against that day’s own menu', async () => {
    menu.mockImplementation(({ dueDate }) => {
      if (dueDate.startsWith(THURSDAYS[0])) {
        return Promise.resolve(makeMenu([makeCategory([sushi])]));
      }
      if (dueDate.startsWith(THURSDAYS[1])) {
        return Promise.reject(new ApiError(500, '', '/itemlist'));
      }
      return Promise.resolve(makeMenu());
    });
    const { onError } = renderStep();

    await waitFor(() => expect(screen.getByText('Could not check')).toBeInTheDocument());
    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.getByText('Chicken Tenders (2) is not on the menu')).toBeInTheDocument();
    expect(onError).toHaveBeenCalled();
  });

  it('stops the batch when the wallet cannot cover it', async () => {
    renderStep({ wallet: { ...wallet, availableBalance: 5 } });

    expect(await screen.findByRole('alert')).toHaveTextContent('The wallet is $10.69 short.');
    expect(screen.getByRole('button', { name: /^Place 3 orders/ })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Flexischools' })).toHaveAttribute(
      'href',
      'https://user.flexischools.com.au/login?returnUrl=/wallet-topup',
    );
  });

  it('leaves the wallet out of it when there is no wallet to read', async () => {
    renderStep({ wallet: null });
    await screen.findByRole('button', { name: 'Place 3 orders for $15.69' });
    expect(screen.queryByText('Wallet balance')).not.toBeInTheDocument();
  });

  it('reports a check that could not run at all', async () => {
    history.mockRejectedValue(new ApiError(401, '', '/api/v1.0/orders/order-history'));
    const { onError } = renderStep();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your Flexischools session has expired.',
    );
    expect(onError).toHaveBeenCalled();
    expect(screen.getAllByText('Checking')).toHaveLength(3);
  });

  it('reports a refused batch and lets it be tried again', async () => {
    const user = userEvent.setup();
    place.mockRejectedValue(new ApiError(403, '', '/api/v2.0/orders'));
    const { onPlaced, onError } = renderStep();

    await user.click(await screen.findByRole('button', { name: 'Place 3 orders for $15.69' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Flexischools refused that request');
    expect(onPlaced).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Place 3 orders for $15.69' })).toBeEnabled();
  });

  it('goes back to the food', async () => {
    const user = userEvent.setup();
    const { onBack } = renderStep();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });
});
