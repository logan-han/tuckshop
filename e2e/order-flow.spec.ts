import { expect, test, type Page, type Route } from '@playwright/test';
import {
  availableServices,
  cognitoSuccess,
  emptyHistory,
  fulfillmentWeek,
  historyWithOrder,
  menu,
  orderFee,
  students,
  wallet,
} from './fixtures';

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// Plan a range in the future so "today" never trims it: the four weeks starting 2036-10-06.
const FROM = '2036-10-06';
const TO = '2036-10-31';
const THURSDAYS = ['2036-10-09', '2036-10-16', '2036-10-23', '2036-10-30'];

interface Captured {
  placeOrderBodies: unknown[];
  menuDueDates: string[];
}

async function mockFlexischools(
  page: Page,
  options: { soldOutOn?: string; alreadyOrderedOn?: string } = {},
) {
  const captured: Captured = { placeOrderBodies: [], menuDueDates: [] };

  await page.route('https://cognito-idp.ap-southeast-2.amazonaws.com/', (route) => {
    const body = route.request().postDataJSON();
    if (body.AuthParameters?.PASSWORD === 'wrong') {
      return json(
        route,
        { __type: 'NotAuthorizedException', message: 'Incorrect username or password.' },
        400,
      );
    }
    return json(route, cognitoSuccess);
  });

  await page.route('https://bffordering.flexischools.com.au/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path.endsWith('/service-categories/1/students')) return json(route, students);
    if (path.endsWith('/payments/user-account')) return json(route, wallet);
    if (path.endsWith('/available-services')) return json(route, availableServices);
    if (path.endsWith('/orderfee')) return json(route, orderFee);
    if (path.endsWith('/next-order-fulfillment-dates')) {
      return json(route, fulfillmentWeek(url.searchParams.get('startDate') ?? FROM));
    }
    if (path.endsWith('/itemlist')) {
      const dueDate = url.searchParams.get('dueDate') ?? '';
      captured.menuDueDates.push(dueDate);
      return json(route, menu(dueDate, !dueDate.startsWith(options.soldOutOn ?? 'never')));
    }
    if (path.endsWith('/orders/order-history')) {
      return json(
        route,
        options.alreadyOrderedOn ? historyWithOrder(options.alreadyOrderedOn) : emptyHistory,
      );
    }
    if (path.endsWith('/v2.0/orders') && method === 'POST') {
      const body = route.request().postDataJSON();
      captured.placeOrderBodies.push(body);
      return json(route, {
        isSuccessful: true,
        cartError: null,
        ordersResponse: body.placeOrderRequests.map(
          (request: { orderRequestId: string }, index: number) => ({
            orderRequestId: request.orderRequestId,
            orderPlaced: true,
            orderKey: { id: index + 1, value: `order-${index + 1}` },
            error: null,
          }),
        ),
      });
    }
    if (method === 'DELETE') return route.fulfill({ status: 204, body: '' });
    return json(route, { unexpected: path }, 500);
  });

  return captured;
}

async function signInAndPlan(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill('parent@example.com');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // One student with one service skips straight to the days.
  await expect(page.getByRole('heading', { name: 'Which days?' })).toBeVisible();
  await page.getByLabel('Term').selectOption('custom');
  await page.getByLabel('From').fill(FROM);
  await page.getByLabel('To').fill(TO);
  await expect(page.getByText('4 lunches to order')).toBeVisible();
}

test.describe('ordering a term of lunches', () => {
  test('signs in, picks Thursdays, adds food, checks each date and places every order', async ({
    page,
  }) => {
    const captured = await mockFlexischools(page);
    await signInAndPlan(page);

    await expect(page.getByText('Thursdays', { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Choose the food' }).click();

    await expect(page.getByRole('heading', { name: 'What goes in the bag?' })).toBeVisible();
    await page.getByRole('button', { name: /Chicken Tenders/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'One more' }).click();
    await dialog.getByRole('button', { name: /Add to the bag/ }).click();

    await page.getByRole('button', { name: /Whole fruit/ }).click();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: /Add to the bag/ }),
    ).toBeDisabled();
    await page.getByRole('dialog').getByLabel('Apple').check();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Add to the bag/ })
      .click();

    const bag = page.getByRole('complementary', { name: 'Your lunch order so far' });
    await expect(bag.getByText('Sam')).toBeVisible();
    await expect(bag.getByText('$11.10')).toBeVisible(); // 2 × 4.90 + 1.30

    await page.getByRole('button', { name: 'Check every date' }).click();
    await expect(page.getByRole('heading', { name: 'Check every date' })).toBeVisible();
    const placeButton = page.getByRole('button', { name: /Place 4 orders for \$45.72/ });
    await expect(placeButton).toBeEnabled();
    expect(captured.menuDueDates.filter((d) => d.startsWith('2036-10-'))).toHaveLength(5); // 1 reference + 4 checks

    await placeButton.click();
    await expect(page.getByRole('heading', { name: '4 lunches ordered for Sam' })).toBeVisible();

    expect(captured.placeOrderBodies).toHaveLength(1);
    const body = captured.placeOrderBodies[0] as {
      cartKey: string;
      totalCartAmount: number;
      placeOrderRequests: Array<{
        dueDate: string;
        orderAmount: number;
        items: unknown[];
        orderOrigin: string;
      }>;
    };
    expect(body.totalCartAmount).toBe(45.72);
    expect(body.placeOrderRequests.map((r) => r.dueDate)).toEqual(
      THURSDAYS.map((d) => `${d}T12:40:00`),
    );
    expect(body.placeOrderRequests[0]).toMatchObject({
      orderAmount: 11.1,
      orderOrigin: 'Normal',
      items: [
        { itemKey: 'tenders', quantity: 2, options: [], questions: [] },
        {
          itemKey: 'fruit',
          quantity: 1,
          options: [{ optionKey: 'apple', quantity: 1, isExcluded: false, isDefault: false }],
          questions: [],
        },
      ],
    });
  });

  test('leaves out sold-out days and days that already have an order', async ({ page }) => {
    await mockFlexischools(page, { soldOutOn: '2036-10-16', alreadyOrderedOn: '2036-10-23' });
    await signInAndPlan(page);
    await page.getByRole('button', { name: 'Choose the food' }).click();
    await page.getByRole('button', { name: /Chicken Tenders/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Add to the bag/ })
      .click();
    await page.getByRole('button', { name: 'Check every date' }).click();

    await expect(page.getByText('Sold out', { exact: true })).toBeVisible();
    await expect(page.getByText('Already ordered')).toBeVisible();
    await expect(page.getByText('Hot Dog', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /Place 2 orders for \$10.46/ })).toBeEnabled();
    await expect(page.getByLabel('Order for Thu 16 Oct')).toBeDisabled();

    // Opting back in to the already-ordered day adds a third lunch.
    await page.getByLabel('Order for Thu 23 Oct').check();
    await expect(page.getByRole('button', { name: /Place 3 orders for \$15.69/ })).toBeEnabled();
  });

  test('explains a wrong password without leaving the page', async ({ page }) => {
    await mockFlexischools(page);
    await page.goto('/');
    await page.getByLabel('Email').fill('parent@example.com');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('do not match');
  });

  test('lists and cancels upcoming orders', async ({ page }) => {
    await mockFlexischools(page, { alreadyOrderedOn: '2036-10-23' });
    await signInAndPlan(page);
    await page.getByRole('button', { name: 'Upcoming orders' }).click();
    await expect(page.getByRole('heading', { name: 'Upcoming orders' })).toBeVisible();
    await expect(page.getByText('Hot Dog', { exact: false })).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Hot Dog', { exact: false })).toBeVisible(); // mock history is static
  });

  test('gives Thursdays and Fridays their own lunch', async ({ page }) => {
    const captured = await mockFlexischools(page);
    await signInAndPlan(page);
    await page.getByRole('button', { name: 'Friday' }).click();
    await expect(page.getByText('8 lunches to order')).toBeVisible();
    await page.getByRole('button', { name: 'Choose the food' }).click();

    // Thursdays get tenders, Fridays a hot dog.
    await expect(page.getByRole('button', { name: /^Thursdays/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: /Chicken Tenders/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Add to the bag/ })
      .click();
    await expect(page.getByRole('button', { name: 'Check every date' })).toBeDisabled();
    await expect(page.getByText('Still nothing for Fridays.')).toBeVisible();

    await page.getByRole('button', { name: /^Fridays/ }).click();
    await page.getByRole('button', { name: /Hot Dog/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Add to the bag/ })
      .click();

    const bag = page.getByRole('complementary', { name: 'Your lunch order so far' });
    await expect(bag.getByText('Thursdays')).toBeVisible();
    await expect(bag.getByText('Fridays')).toBeVisible();
    await expect(bag.getByText('$40.24')).toBeVisible(); // 4 × 4.90 + 4 × 4.50 + 8 × 0.33

    await page.getByRole('button', { name: 'Check every date' }).click();
    await page.getByRole('button', { name: /Place 8 orders for \$40.24/ }).click();
    await expect(page.getByRole('heading', { name: '8 lunches ordered for Sam' })).toBeVisible();

    const body = captured.placeOrderBodies[0] as {
      placeOrderRequests: Array<{ dueDate: string; items: Array<{ itemKey: string }> }>;
    };
    const byDate = Object.fromEntries(
      body.placeOrderRequests.map((r) => [r.dueDate.slice(0, 10), r.items[0].itemKey]),
    );
    expect(byDate).toEqual({
      '2036-10-09': 'tenders',
      '2036-10-10': 'hotdog',
      '2036-10-16': 'tenders',
      '2036-10-17': 'hotdog',
      '2036-10-23': 'tenders',
      '2036-10-24': 'hotdog',
      '2036-10-30': 'tenders',
      '2036-10-31': 'hotdog',
    });
  });
});
