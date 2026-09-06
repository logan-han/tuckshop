import type {
  HistoryOrder,
  Menu,
  PlaceOrdersResponse,
  Student,
  StudentService,
} from '../api/types';
import {
  buildPlaceOrdersBody,
  checkAvailability,
  describeOrderError,
  existingOrdersByDate,
  summariseOutcomes,
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
