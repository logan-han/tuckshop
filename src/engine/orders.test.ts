import type {
  HistoryOrder,
  Menu,
  PlaceOrdersResponse,
  Student,
  StudentService,
} from '../api/types';
import {
  alreadySubmitted,
  batchKeys,
  buildPlaceOrdersBody,
  checkAvailability,
  describeOrderError,
  existingOrdersByDate,
  holdBatch,
  releaseCart,
  settleBatch,
  summariseOutcomes,
  type PendingBatch,
  type PlannedOrder,
} from './orders';
import { makeItem } from './pricing.test';

const student: Student = {
  studentKey: 'student-1',
  studentId: 1,
  isClassValid: true,
  studentFirstName: 'Winter',
  studentLastName: 'Han',
  schoolKey: 'school-1',
  schoolName: 'Tintern Grammar',
  schoolSiteKey: 'site-1',
  services: [],
};

const service: StudentService = {
  supplierServiceKey: 'lunch',
  supplierServiceName: 'Lunch',
  supplierKey: 'canteen',
  supplierSiteKey: 'canteen-site',
  supplierSiteTimeRegionKey: 'melbourne',
};

function menuWith(...items: ReturnType<typeof makeItem>[]): Menu {
  return {
    supplierServiceKey: 'lunch',
    serviceItemDescription: '',
    supplierServiceName: 'Lunch',
    dueDate: '2026-10-08T12:40:00',
    supplierDistributionTimeKey: 'dist',
    currencyCode: 'AUD',
    currencySymbol: '$',
    itemCategories: [
      {
        key: 'hot',
        name: 'Hot Snacks',
        description: null,
        imageUrl: null,
        sequence: 7,
        serviceCategory: 1,
        items,
      },
    ],
  };
}

const tenders = { item: makeItem(), quantity: 1, options: [], questions: [] };

describe('checkAvailability', () => {
  it('passes when the item is in stock with enough left', () => {
    const result = checkAvailability(menuWith(makeItem({ quantityLeft: 3 })), [tenders]);
    expect(result.ok).toBe(true);
    expect(result.selections[0].item.quantityLeft).toBe(3);
  });

  it('flags missing, sold out and capped items', () => {
    expect(checkAvailability(menuWith(), [tenders]).problems).toEqual([
      'Chicken Tenders (2) is not on the menu',
    ]);
    expect(checkAvailability(menuWith(makeItem({ inStock: false })), [tenders]).problems).toEqual([
      'Chicken Tenders (2) is sold out',
    ]);
    expect(
      checkAvailability(menuWith(makeItem({ quantityLeft: 1 })), [{ ...tenders, quantity: 2 }])
        .problems,
    ).toEqual(['Only 1 of Chicken Tenders (2) left']);
  });

  it('flags a sold-out option and a price change', () => {
    const fruit = makeItem({
      itemKey: 'fruit',
      name: 'Whole fruit',
      itemPrice: 1.3,
      hasQuantitySellLimit: false,
      optionSets: [
        {
          optionSetKey: 'variety',
          name: 'Variety',
          minQuantity: 1,
          maxQuantity: 1,
          sequence: 0,
          optionSetRenderType: 1,
          options: [
            {
              optionKey: 'banana',
              name: 'Banana',
              isActive: true,
              inStock: false,
              isDefault: false,
              optionSequence: 0,
              optionTax: 0,
              optionPrice: 0,
              hasQuantitySellLimit: false,
              quantityLeft: 0,
            },
          ],
        },
      ],
    });
    const selection = {
      item: fruit,
      quantity: 1,
      options: [{ optionKey: 'banana', quantity: 1 }],
      questions: [],
    };
    expect(checkAvailability(menuWith(fruit), [selection]).problems).toEqual([
      'Banana is sold out for Whole fruit',
    ]);

    const dearer = checkAvailability(menuWith(makeItem({ itemPrice: 5.2 })), [tenders]);
    expect(dearer.ok).toBe(false);
    expect(dearer.problems).toEqual(['Chicken Tenders (2) is now $5.20']);
    expect(dearer.selections[0].item.itemPrice).toBe(5.2);
  });
});

describe('buildPlaceOrdersBody', () => {
  const orders: PlannedOrder[] = [
    { date: '2026-10-08', dueDate: '2026-10-08T12:40:00', selections: [tenders] },
    {
      date: '2026-10-15',
      dueDate: '2026-10-15T12:40:00',
      selections: [{ ...tenders, quantity: 2 }],
    },
  ];

  it('mirrors the portal payload, one request per date, fee folded into the cart total', () => {
    const body = buildPlaceOrdersBody({
      student,
      service,
      orders,
      feePerOrder: 0.33,
      cartKey: 'cart-1',
      requestIds: ['req-1', 'req-2'],
    });
    expect(body).toEqual({
      cartKey: 'cart-1',
      totalCartAmount: 15.36,
      placeOrderRequests: [
        {
          orderRequestId: 'req-1',
          studentKey: 'student-1',
          supplierServiceKey: 'lunch',
          supplierKey: 'canteen',
          dueDate: '2026-10-08T12:40:00',
          orderAmount: 4.9,
          items: [{ itemKey: 'tenders', quantity: 1, options: [], questions: [] }],
          orderOrigin: 'Normal',
        },
        {
          orderRequestId: 'req-2',
          studentKey: 'student-1',
          supplierServiceKey: 'lunch',
          supplierKey: 'canteen',
          dueDate: '2026-10-15T12:40:00',
          orderAmount: 9.8,
          items: [{ itemKey: 'tenders', quantity: 2, options: [], questions: [] }],
          orderOrigin: 'Normal',
        },
      ],
    });
  });

  it('carries option choices with their default flag', () => {
    const fruit = makeItem({
      itemKey: 'fruit',
      itemPrice: 1.3,
      optionSets: [
        {
          optionSetKey: 'variety',
          name: 'Variety',
          minQuantity: 1,
          maxQuantity: 1,
          sequence: 0,
          optionSetRenderType: 1,
          options: [
            {
              optionKey: 'apple',
              name: 'Apple',
              isActive: true,
              inStock: true,
              isDefault: true,
              optionSequence: 0,
              optionTax: 0,
              optionPrice: 0,
              hasQuantitySellLimit: false,
              quantityLeft: 0,
            },
          ],
        },
      ],
    });
    const body = buildPlaceOrdersBody({
      student,
      service,
      orders: [
        {
          date: '2026-10-08',
          dueDate: '2026-10-08T12:40:00',
          selections: [
            {
              item: fruit,
              quantity: 1,
              options: [{ optionKey: 'apple', quantity: 1 }],
              questions: [{ questionKey: 'q', answer: 'no skin' }],
            },
          ],
        },
      ],
      feePerOrder: 0.33,
      cartKey: 'c',
      requestIds: ['r'],
    });
    expect(body.placeOrderRequests[0].items[0]).toEqual({
      itemKey: 'fruit',
      quantity: 1,
      options: [{ optionKey: 'apple', quantity: 1, isExcluded: false, isDefault: true }],
      questions: [{ questionKey: 'q', answer: 'no skin' }],
    });
  });

  it('names an unticked default option as excluded, like the portal', () => {
    const option = (optionKey: string, isDefault: boolean) => ({
      optionKey,
      name: optionKey,
      isActive: true,
      inStock: true,
      isDefault,
      optionSequence: 0,
      optionTax: 0,
      optionPrice: 0,
      hasQuantitySellLimit: false,
      quantityLeft: 0,
    });
    const fruit = makeItem({
      itemKey: 'fruit',
      optionSets: [
        {
          optionSetKey: 'variety',
          name: 'Variety',
          minQuantity: 1,
          maxQuantity: 1,
          sequence: 0,
          optionSetRenderType: 1,
          options: [option('apple', true), option('banana', false)],
        },
      ],
    });
    const body = buildPlaceOrdersBody({
      student,
      service,
      orders: [
        {
          date: '2026-10-08',
          dueDate: '2026-10-08T12:40:00',
          selections: [
            {
              item: fruit,
              quantity: 1,
              options: [{ optionKey: 'banana', quantity: 1 }],
              questions: [],
            },
          ],
        },
      ],
      feePerOrder: 0.33,
      cartKey: 'c',
      requestIds: ['r'],
    });
    expect(body.placeOrderRequests[0].items[0].options).toEqual([
      { optionKey: 'banana', quantity: 1, isExcluded: false, isDefault: false },
      { optionKey: 'apple', quantity: 1, isExcluded: true, isDefault: true },
    ]);
  });
});

describe('summariseOutcomes', () => {
  const orders: PlannedOrder[] = [
    { date: '2026-10-08', dueDate: '2026-10-08T12:40:00', selections: [tenders] },
    { date: '2026-10-15', dueDate: '2026-10-15T12:40:00', selections: [tenders] },
  ];

  it('matches results by request id and explains failures', () => {
    const response: PlaceOrdersResponse = {
      isSuccessful: false,
      cartError: null,
      ordersResponse: [
        {
          orderRequestId: 'r2',
          orderPlaced: false,
          error: {
            errorCode: 104,
            errorTitle: null,
            errorMessage: null,
            multiOrderErrorMessage: null,
            renderType: null,
            params: [{ itemKey: 'tenders', quantityLeft: 0 }],
          },
        },
        {
          orderRequestId: 'r1',
          orderPlaced: true,
          orderKey: { id: 1, value: 'order-1' },
          error: null,
        },
      ],
    };
    expect(summariseOutcomes(orders, ['r1', 'r2'], response)).toEqual([
      { date: '2026-10-08', placed: true, message: 'Placed', orderKey: 'order-1' },
      {
        date: '2026-10-15',
        placed: false,
        message: 'An item is sold out or no longer on the menu for that date.',
        orderKey: undefined,
      },
    ]);
  });

  it('falls back to position and the cart error when ids are missing', () => {
    const response: PlaceOrdersResponse = {
      isSuccessful: false,
      cartError: {
        errorCode: 105,
        errorTitle: null,
        errorMessage: 'Insufficient funds',
        multiOrderErrorMessage: null,
        renderType: 'Modal',
        params: null,
      },
      ordersResponse: [{ orderPlaced: false, error: null }],
    };
    const outcomes = summariseOutcomes(orders, ['r1', 'r2'], response);
    expect(outcomes[0]).toEqual({
      date: '2026-10-08',
      placed: false,
      message: 'Insufficient funds',
      orderKey: undefined,
    });
    expect(outcomes[1]).toEqual({
      date: '2026-10-15',
      placed: false,
      message: 'Insufficient funds',
    });
    expect(describeOrderError(null)).toBe('Flexischools could not place this order.');
    expect(
      describeOrderError({
        errorCode: 42,
        errorTitle: null,
        errorMessage: null,
        multiOrderErrorMessage: null,
        renderType: null,
        params: null,
      }),
    ).toBe('Error 42.');
  });
});

describe('existingOrdersByDate', () => {
  const order = (overrides: Partial<HistoryOrder>): HistoryOrder => ({
    orderKey: { id: 1, value: 'o1' },
    studentKey: { id: 1, value: 'student-1' },
    studentName: 'Winter',
    supplierServiceKey: 'lunch',
    supplierServiceName: 'Lunch',
    supplierServiceCategory: 'Food',
    orderItems: [],
    orderTotal: 5.23,
    dueDate: '2026-10-08T12:40:00',
    orderState: 'Placed',
    supplierKey: 'canteen',
    currencyCode: 'AUD',
    currencySymbol: '$',
    ...overrides,
  });

  it('keeps live orders for the same student and service only', () => {
    const map = existingOrdersByDate(
      {
        presentOrders: [
          {
            orders: [
              order({}),
              order({ orderKey: { id: 2, value: 'o2' }, orderState: 'CancelledByUser' }),
              order({ orderKey: { id: 3, value: 'o3' }, studentKey: { id: 9, value: 'other' } }),
              order({ orderKey: { id: 4, value: 'o4' }, supplierServiceKey: 'french-day' }),
              order({ orderKey: { id: 5, value: 'o5' }, dueDate: '2026-10-15T12:40:00' }),
            ],
          },
        ],
      },
      'student-1',
      'lunch',
    );
    expect([...map.keys()]).toEqual(['2026-10-08', '2026-10-15']);
    expect(map.get('2026-10-08')?.map((o) => o.orderKey.value)).toEqual(['o1']);
  });
});

describe('carts that got no answer', () => {
  const owner = 'student-1|lunch';
  const planned = (date: string): PlannedOrder => ({
    date,
    dueDate: `${date}T12:40:00`,
    selections: [],
  });
  const placed = (date: string, key: string) =>
    ({ orderKey: { id: 1, value: key }, dueDate: `${date}T12:40:00` }) as HistoryOrder;
  let minted = 0;
  const mint = () => `new-${++minted}`;
  beforeEach(() => {
    minted = 0;
  });

  const pending: PendingBatch = {
    owner,
    dates: {
      '2026-10-08': { cartKey: 'cart-a', requestId: 'req-8', had: [] },
      '2026-10-15': { cartKey: 'cart-a', requestId: 'req-15', had: ['old-15'] },
    },
  };

  it('mints fresh keys when nothing is pending', () => {
    expect(batchKeys([planned('2026-10-08')], null, owner, mint)).toEqual({
      cartKey: 'new-1',
      requestIds: ['new-2'],
    });
  });

  it('reuses a pending cart’s keys for its dates, sent in any company', () => {
    const keys = batchKeys([planned('2026-10-22'), planned('2026-10-15')], pending, owner, mint);
    expect(keys).toEqual({ cartKey: 'cart-a', requestIds: ['new-1', 'req-15'] });
  });

  it('ignores another student’s or service’s pending cart', () => {
    const keys = batchKeys([planned('2026-10-08')], pending, 'student-2|lunch', mint);
    expect(keys.cartKey).toBe('new-1');
  });

  it('holds a cart that got no answer, keeping the first keys a date went out with', () => {
    const held = holdBatch(
      pending,
      owner,
      {
        cartKey: 'cart-b',
        requestIds: ['req-8-again', 'req-22'],
        orders: [planned('2026-10-08'), planned('2026-10-22')],
      },
      (date) => (date === '2026-10-22' ? [placed(date, 'old-22')] : []),
    );
    expect(held.dates['2026-10-08']).toEqual(pending.dates['2026-10-08']);
    expect(held.dates['2026-10-22']).toEqual({
      cartKey: 'cart-b',
      requestId: 'req-22',
      had: ['old-22'],
    });
  });

  it('settles a date once it shows an order it did not have before', () => {
    const existing = new Map([
      ['2026-10-08', [placed('2026-10-08', 'new-8')]],
      // Only the order 15 Oct already had: its own cart may not have gone in.
      ['2026-10-15', [placed('2026-10-15', 'old-15')]],
    ]);
    expect(settleBatch(pending, existing)?.dates).toEqual({
      '2026-10-15': pending.dates['2026-10-15'],
    });
    expect(settleBatch(pending, new Map())).toBe(pending);
    expect(
      settleBatch(pending, new Map([...existing, ['2026-10-15', [placed('x', 'new-15')]]])),
    ).toBeNull();
  });

  it('lets go of every date of a cart Flexischools answered as new', () => {
    const mixed: PendingBatch = {
      owner,
      dates: { ...pending.dates, '2026-10-22': { cartKey: 'cart-b', requestId: 'r', had: [] } },
    };
    expect(Object.keys(releaseCart(mixed, 'cart-a')?.dates ?? {})).toEqual(['2026-10-22']);
    expect(releaseCart(pending, 'cart-a')).toBeNull();
    expect(releaseCart(null, 'cart-a')).toBeNull();
  });

  it('spots a cart turned away as already submitted', () => {
    const refusal = (errorCode: number) => ({
      errorCode,
      errorTitle: null,
      errorMessage: null,
      multiOrderErrorMessage: null,
      renderType: null,
      params: null,
    });
    const response = (
      cartError: number | null,
      orderError: number | null,
    ): PlaceOrdersResponse => ({
      isSuccessful: false,
      cartError: cartError === null ? null : refusal(cartError),
      ordersResponse: [
        { orderPlaced: false, error: orderError === null ? null : refusal(orderError) },
      ],
    });
    expect(alreadySubmitted(response(119, null))).toBe(true);
    expect(alreadySubmitted(response(null, 119))).toBe(true);
    expect(alreadySubmitted(response(105, null))).toBe(false);
  });
});
