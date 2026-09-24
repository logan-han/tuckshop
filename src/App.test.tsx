import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { clearSession } from './api/auth';
import type { PlaceOrdersBody } from './api/types';
import { addDays } from './engine/schedule';
import { makeFulfilment, makeHistoryOrder, makeMenu } from './test/fixtures';

function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.sig`;
}

const student = {
  studentKey: 'student-1',
  studentId: 1,
  isClassValid: true,
  studentFirstName: 'Sam',
  studentLastName: 'Example',
  schoolKey: 'school-1',
  schoolName: 'Example Grammar',
  schoolSiteKey: 'site-1',
  services: [
    {
      supplierServiceKey: 'lunch',
      supplierServiceName: 'Lunch',
      supplierKey: 'canteen',
      supplierSiteKey: 'canteen-site',
      supplierSiteTimeRegionKey: 'melbourne',
    },
  ],
};

const fetchMock = vi.fn();

function respond(url: string, init?: RequestInit): Response {
  if (url.startsWith('https://cognito-idp')) {
    return new Response(
      JSON.stringify({
        AuthenticationResult: {
          IdToken: jwt({ exp: Math.floor(Date.now() / 1000) + 3600, email: 'parent@example.com' }),
          AccessToken: 'a',
          RefreshToken: 'r',
          ExpiresIn: 3600,
        },
      }),
    );
  }
  if (url.endsWith('/service-categories/1/students'))
    return new Response(JSON.stringify([student]));
  if (url.endsWith('/payments/user-account')) {
    return new Response(
      JSON.stringify({ accountKey: 'a', availableBalance: 12.44, topUpAmountOptions: [] }),
    );
  }
  if (url.endsWith('/available-services')) {
    return new Response(
      JSON.stringify([
        {
          supplierServiceKey: 'lunch',
          serviceName: 'Lunch',
          cutOffTime: '2036-10-06T08:30:00',
          nextOrderFulfillmentDate: '2036-10-06T12:40:00',
          description: 'Order by 8.30am',
          supplierKey: 'canteen',
          schoolKey: 'school-1',
          supplierDistributionTimeKey: 'dist',
        },
      ]),
    );
  }
  if (url.endsWith('/orderfee')) return new Response(JSON.stringify({ fee: 0.33, feeTax: 0.03 }));
  if (url.endsWith('/orders/order-history')) {
    return new Response(
      JSON.stringify({ hasMoreOrders: false, orderCount: 0, presentOrders: [], pastOrders: [] }),
    );
  }
  if (url.includes('next-order-fulfillment-dates')) {
    const startDate = new URL(url).searchParams.get('startDate') ?? '';
    return new Response(
      JSON.stringify(Array.from({ length: 5 }, (_, i) => makeFulfilment(addDays(startDate, i)))),
    );
  }
  if (url.includes('/itemlist')) return new Response(JSON.stringify(makeMenu()));
  if (url.endsWith('/api/v2.0/orders')) {
    const body = JSON.parse(String(init?.body ?? '{}')) as PlaceOrdersBody;
    return new Response(
      JSON.stringify({
        isSuccessful: true,
        cartError: null,
        ordersResponse: body.placeOrderRequests.map((request) => ({
          orderRequestId: request.orderRequestId,
          orderPlaced: true,
          orderKey: { id: 1, value: `key-${request.dueDate}` },
        })),
      }),
    );
  }
  return new Response('not mocked', { status: 500 });
}

/** Everything answered as usual, bar the one endpoint a test wants to go wrong. */
function respondExcept(path: string, instead: () => Response) {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    return Promise.resolve(url.endsWith(path) ? instead() : respond(url, init));
  });
}

async function signInAs(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'parent@example.com');
  await user.type(screen.getByLabelText('Password'), 'secret');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(respond(input.toString(), init)),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('starts on the sign-in screen', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /every Thursday/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument();
  });

  it('signs in and skips straight to choosing days for a single student', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Email'), 'parent@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Which days?' })).toBeInTheDocument();
    const bag = screen.getByRole('complementary', { name: 'Your lunch order so far' });
    expect(bag).toHaveTextContent('Sam');
    expect(bag).toHaveTextContent('Lunch');
    // No weekday is picked for you; the plan cannot go on until one is.
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      expect(screen.getByRole('button', { name: day })).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.getByText(/lunches to order/)).toHaveTextContent('0 lunches to order');
    expect(screen.getByRole('button', { name: 'Choose the food' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Thursday' }));
    expect(screen.getByRole('button', { name: 'Thursday' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Choose the food' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());
    expect(window.sessionStorage.getItem('tuckshop.session')).toBeNull();
  });

  it('stops on the student step when the account has more than one child', async () => {
    const user = userEvent.setup();
    const alex = { ...student, studentKey: 'student-2', studentId: 2, studentFirstName: 'Alex' };
    respondExcept(
      '/service-categories/1/students',
      () => new Response(JSON.stringify([student, alex])),
    );

    render(<App />);
    await signInAs(user);

    expect(await screen.findByRole('heading', { name: 'Who is this lunch for?' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Choose the days' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Alex/ }));
    await user.click(screen.getByRole('button', { name: 'Choose the days' }));
    expect(await screen.findByRole('heading', { name: 'Which days?' })).toBeVisible();
  });

  it('banners a Flexischools account that could not be loaded', async () => {
    const user = userEvent.setup();
    respondExcept('/service-categories/1/students', () => new Response('nope', { status: 503 }));

    render(<App />);
    await signInAs(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Flexischools is having trouble right now.',
    );
    expect(screen.queryByText('Loading your Flexischools account…')).not.toBeInTheDocument();
  });

  it('signs out again when Flexischools stops accepting the session', async () => {
    const user = userEvent.setup();
    respondExcept('/service-categories/1/students', () => new Response('expired', { status: 401 }));

    render(<App />);
    await signInAs(user);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your Flexischools session has expired. Sign in again.',
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });
});

describe('App, from the plan to the orders', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-06T02:00:00Z'));
    // A plan left from last visit: two Thursdays, so the walk-through stays short.
    window.localStorage.setItem(
      'tuckshop.plan',
      JSON.stringify({
        weekdays: [4],
        presetId: 'custom',
        from: '2026-10-08',
        to: '2026-10-15',
        excluded: [],
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('picks the food, checks the dates, places the orders and shows them', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await signInAs(user);

    expect(await screen.findByRole('heading', { name: 'Which days?' })).toBeVisible();
    expect(screen.getByText(/lunches to order/)).toHaveTextContent('2 lunches to order');
    await user.click(screen.getByRole('button', { name: 'Choose the food' }));

    expect(await screen.findByRole('heading', { name: 'Hot Food' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Chicken Tenders/ }));
    await user.click(screen.getByRole('button', { name: 'Add to the bag · $4.90' }));

    const bag = screen.getByRole('complementary', { name: 'Your lunch order so far' });
    expect(bag).toHaveTextContent('2 lunches + $0.33 fee each');
    expect(bag).toHaveTextContent('$10.46');

    await user.click(screen.getByRole('button', { name: 'Check every date' }));
    const place = await screen.findByRole('button', { name: 'Place 2 orders for $10.46' });
    // The check's own total is the one that counts, so the bag leaves its out.
    expect(
      screen.getByRole('complementary', { name: 'Your lunch order so far' }),
    ).not.toHaveTextContent('fee each');
    await user.click(place);

    expect(await screen.findByRole('heading', { name: '2 lunches ordered for Sam' })).toBeVisible();
    // What was placed is listed; the plan's bag would only disagree with it.
    expect(
      screen.queryByRole('complementary', { name: 'Your lunch order so far' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'See upcoming orders' }));
    expect(await screen.findByRole('heading', { name: 'Upcoming orders' })).toBeVisible();
    expect(screen.getByText('No upcoming lunch orders.')).toBeInTheDocument();
  });

  it('costs only what the check will order: no closed date, no date already ordered', async () => {
    // Three Thursdays: 15 Oct is a curriculum day and 22 Oct already has a lunch.
    window.localStorage.setItem(
      'tuckshop.plan',
      JSON.stringify({
        weekdays: [4],
        presetId: 'custom',
        from: '2026-10-08',
        to: '2026-10-22',
        excluded: [],
      }),
    );
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.includes('next-order-fulfillment-dates')) {
        const startDate = new URL(url).searchParams.get('startDate') ?? '';
        const week = Array.from({ length: 5 }, (_, i) => addDays(startDate, i)).map((date) =>
          makeFulfilment(date, date === '2026-10-15' ? { closureReason: 'Curriculum day' } : {}),
        );
        return Promise.resolve(new Response(JSON.stringify(week)));
      }
      if (url.endsWith('/orders/order-history')) {
        const order = makeHistoryOrder('2026-10-22');
        return Promise.resolve(
          new Response(
            JSON.stringify({
              hasMoreOrders: false,
              orderCount: 1,
              presentOrders: [{ dueDate: order.dueDate, orders: [order] }],
              pastOrders: [],
            }),
          ),
        );
      }
      return Promise.resolve(respond(url, init));
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await signInAs(user);

    await user.click(await screen.findByRole('button', { name: 'Choose the food' }));
    await user.click(await screen.findByRole('button', { name: /Chicken Tenders/ }));
    await user.click(screen.getByRole('button', { name: 'Add to the bag · $4.90' }));

    const bag = screen.getByRole('complementary', { name: 'Your lunch order so far' });
    await waitFor(() => expect(bag).toHaveTextContent('1 of 3 lunches + $0.33 fee each'));
    expect(bag).toHaveTextContent('$5.23');
    await user.click(screen.getByRole('button', { name: 'Check every date' }));
    expect(await screen.findByRole('button', { name: 'Place 1 order for $5.23' })).toBeEnabled();
  });

  it('reads the wallet again after a top-up in Flexischools', async () => {
    let balance = 5;
    respondExcept(
      '/payments/user-account',
      () =>
        new Response(
          JSON.stringify({ accountKey: 'a', availableBalance: balance, topUpAmountOptions: [] }),
        ),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await signInAs(user);

    await user.click(await screen.findByRole('button', { name: 'Choose the food' }));
    await user.click(await screen.findByRole('button', { name: /Chicken Tenders/ }));
    await user.click(screen.getByRole('button', { name: 'Add to the bag · $4.90' }));
    await user.click(screen.getByRole('button', { name: 'Check every date' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The wallet is $5.46 short.');

    // Topped up from a phone while this tab stayed open.
    balance = 8;
    await user.click(screen.getByRole('button', { name: 'Refresh the balance' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('The wallet is $2.46 short.'),
    );

    // Topped up in the Flexischools tab, then back to this one.
    balance = 20;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Place 2 orders for $10.46' })).toBeEnabled();
  });

  it('keeps the bag but starts the plan again when more lunches are wanted', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await signInAs(user);

    await user.click(await screen.findByRole('button', { name: 'Choose the food' }));
    await user.click(await screen.findByRole('button', { name: /Chicken Tenders/ }));
    await user.click(screen.getByRole('button', { name: 'Add to the bag · $4.90' }));

    // A line can be taken out of the bag itself while the food is being chosen.
    const bag = screen.getByRole('complementary', { name: 'Your lunch order so far' });
    await user.click(within(bag).getByRole('button', { name: 'remove' }));
    expect(bag).toHaveTextContent('Nothing in the bag yet.');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Which days?' })).toBeVisible();
  });

  it('keeps the bag through a reload, and drops it on signing out', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<App />);
    await signInAs(user);
    await user.click(await screen.findByRole('button', { name: 'Choose the food' }));
    await user.click(await screen.findByRole('button', { name: /Chicken Tenders/ }));
    await user.click(screen.getByRole('button', { name: 'Add to the bag · $4.90' }));
    unmount();

    // The page again, the way a pull-to-refresh leaves it: still signed in, nothing in memory.
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'What goes in the bag?' })).toBeVisible();
    const bag = screen.getByRole('complementary', { name: 'Your lunch order so far' });
    expect(bag).toHaveTextContent('Chicken Tenders');
    // The order fee is fetched afresh, so the total settles once it arrives.
    await waitFor(() => expect(bag).toHaveTextContent('$10.46'));

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());
    expect(window.sessionStorage.getItem('tuckshop.draft')).toBeNull();
  });

  it('gives the bag back after signing in again when the session lapsed', async () => {
    let lapsed = false;
    respondExcept('/payments/user-account', () =>
      lapsed
        ? new Response('expired', { status: 401 })
        : new Response(JSON.stringify({ accountKey: 'a', availableBalance: 20 })),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await signInAs(user);
    await user.click(await screen.findByRole('button', { name: 'Choose the food' }));
    await user.click(await screen.findByRole('button', { name: /Chicken Tenders/ }));
    await user.click(screen.getByRole('button', { name: 'Add to the bag · $4.90' }));

    lapsed = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(await screen.findByRole('status')).toHaveTextContent('Sign in again.');

    lapsed = false;
    await user.clear(screen.getByLabelText('Email')); // remembered from the first sign-in
    await signInAs(user);
    expect(await screen.findByRole('heading', { name: 'What goes in the bag?' })).toBeVisible();
    expect(
      screen.getByRole('complementary', { name: 'Your lunch order so far' }),
    ).toHaveTextContent('Chicken Tenders');
  });

  it('forgets the bag once it is ordered', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await signInAs(user);
    await user.click(await screen.findByRole('button', { name: 'Choose the food' }));
    await user.click(await screen.findByRole('button', { name: /Chicken Tenders/ }));
    await user.click(screen.getByRole('button', { name: 'Add to the bag · $4.90' }));
    expect(window.sessionStorage.getItem('tuckshop.draft')).toContain('tenders');

    await user.click(screen.getByRole('button', { name: 'Check every date' }));
    await user.click(await screen.findByRole('button', { name: 'Place 2 orders for $10.46' }));
    await screen.findByRole('heading', { name: '2 lunches ordered for Sam' });
    expect(window.sessionStorage.getItem('tuckshop.draft')).toBeNull();
  });

  it('goes back to a declined date to fix it, the other date now ordered', async () => {
    let placed = false;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith('/api/v2.0/orders')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as PlaceOrdersBody;
        placed = true;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              isSuccessful: false,
              cartError: null,
              ordersResponse: body.placeOrderRequests.map((request, index) => ({
                orderRequestId: request.orderRequestId,
                orderPlaced: index === 0,
                orderKey: index === 0 ? { id: 1, value: 'key-8-oct' } : undefined,
                error:
                  index === 0
                    ? null
                    : {
                        errorCode: 0,
                        errorTitle: null,
                        errorMessage: 'Chicken Tenders sold out.',
                        multiOrderErrorMessage: null,
                        renderType: null,
                        params: null,
                      },
              })),
            }),
          ),
        );
      }
      // Once placed, the history shows 8 Oct's order.
      if (url.endsWith('/orders/order-history') && placed) {
        const order = makeHistoryOrder('2026-10-08', { orderKey: { id: 1, value: 'key-8-oct' } });
        return Promise.resolve(
          new Response(
            JSON.stringify({
              hasMoreOrders: false,
              orderCount: 1,
              presentOrders: [{ dueDate: order.dueDate, orders: [order] }],
              pastOrders: [],
            }),
          ),
        );
      }
      return Promise.resolve(respond(url, init));
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await signInAs(user);
    await user.click(await screen.findByRole('button', { name: 'Choose the food' }));
    await user.click(await screen.findByRole('button', { name: /Chicken Tenders/ }));
    await user.click(screen.getByRole('button', { name: 'Add to the bag · $4.90' }));
    await user.click(screen.getByRole('button', { name: 'Check every date' }));
    await user.click(await screen.findByRole('button', { name: 'Place 2 orders for $10.46' }));

    expect(await screen.findByRole('heading', { name: '1 of 2 lunches ordered' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Fix 15 Oct' }));

    expect(await screen.findByRole('heading', { name: 'What goes in the bag?' })).toBeVisible();
    expect(screen.getByRole('button', { name: /^15 Oct/ })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^8 Oct/ })).toHaveTextContent('ordered'),
    );
    expect(
      screen.getByRole('complementary', { name: 'Your lunch order so far' }),
    ).toHaveTextContent('Chicken Tenders');
  });

  it('moves between planning and the orders list from the masthead', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await signInAs(user);
    await screen.findByRole('heading', { name: 'Which days?' });

    await user.click(screen.getByRole('button', { name: 'Upcoming orders' }));
    expect(await screen.findByRole('heading', { name: 'Upcoming orders' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Plan lunches' }));
    expect(await screen.findByRole('heading', { name: 'Which days?' })).toBeVisible();

    // The logo goes home too, without reloading the page.
    await user.click(screen.getByRole('button', { name: 'Upcoming orders' }));
    await user.click(screen.getByRole('link', { name: 'Tuckshop home' }));
    expect(await screen.findByRole('heading', { name: 'Which days?' })).toBeVisible();
  });
});
