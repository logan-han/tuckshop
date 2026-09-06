// Canned Flexischools responses shaped like the real ones (captured 2026-09-07), with
// identifiers replaced. The e2e run never talks to Flexischools.

function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`;
}

export const ID_TOKEN = jwt({
  exp: Math.floor(Date.now() / 1000) + 3600,
  email: 'parent@example.com',
  given_name: 'Pat',
  'custom:toca_user_key': 'user-key',
});

export const cognitoSuccess = {
  AuthenticationResult: {
    IdToken: ID_TOKEN,
    AccessToken: 'access-token',
    RefreshToken: 'refresh-token',
    ExpiresIn: 3600,
    TokenType: 'Bearer',
  },
  ChallengeParameters: {},
};

export const students = [
  {
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
      {
        supplierServiceKey: 'old-event',
        supplierServiceName: 'Book Week Lunch ',
        supplierKey: 'canteen',
        supplierSiteKey: 'canteen-site',
        supplierSiteTimeRegionKey: 'melbourne',
      },
    ],
  },
];

export const wallet = {
  accountKey: 'account-1',
  availableBalance: 60,
  defaultPaymentMethodName: 'Mastercard_Debit',
  defaultPaymentMethodReference: '518868******8574',
  schoolKey: null,
  isFeeFreeTopUpEnabled: true,
  feeFreeTopUpAmount: 50,
  isApplePayEnabled: true,
  topUpAmountOptions: [30, 50, 100],
};

export const orderFee = { fee: 0.33, feeTax: 0.03 };

/** available-services only echoes services that are taking orders; a finished event day is absent. */
export const availableServices = [
  {
    supplierServiceKey: 'lunch',
    serviceName: 'Lunch',
    cutOffTime: '2036-10-06T08:30:00',
    cutOffTimeUtc: '2036-10-05T22:30:00',
    nextOrderFulfillmentDate: '2036-10-06T12:40:00',
    nextOrderFulfillmentDateUtc: '2036-10-06T02:40:00',
    image: null,
    description: 'Order by 8.30am',
    supplierKey: 'canteen',
    schoolSiteKey: 'site-1',
    schoolKey: 'school-1',
    supplierSiteTimeRegionKey: 'melbourne',
    supplierSiteKey: 'canteen-site',
    showDistributionTime: true,
    supplierDistributionTimeKey: 'dist',
  },
];

/** Five consecutive days from a Monday, in the API's local date-time format. */
export function fulfillmentWeek(monday: string) {
  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(`${monday}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const iso = date.toISOString().slice(0, 10);
    return {
      fulfillmentDate: `${iso}T12:40:00`,
      hasCutOffTimePassed: false,
      supplierDistributionTimeKey: { id: 1, value: `dist-${iso}` },
      closureReason: null,
    };
  });
}

const baseItem = {
  itemTax: 0.45,
  isDefaultInOrder: false,
  sequence: 5,
  inStock: true,
  unavailabilityMessage: '',
  imageUrl: null,
  description: null,
  hasQuantitySellLimit: false,
  quantityLeft: null,
  optionSets: [],
  questionSets: [],
  labels: [],
  allergens: [],
  priceOption: 1,
  requiresQuantitySellLimitCheck: false,
};

export function menu(dueDate: string, tendersInStock = true) {
  return {
    supplierServiceKey: 'lunch',
    serviceItemDescription: '',
    showDistributionDatetime: true,
    supplierServiceName: 'Lunch',
    dueDate,
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
        items: [
          {
            ...baseItem,
            itemKey: 'tenders',
            name: 'Chicken Tenders (2) - known allergens: gluten, soy, egg',
            itemPrice: 4.9,
            inStock: tendersInStock,
            unavailabilityMessage: tendersInStock ? '' : 'Sold out',
            hasQuantitySellLimit: true,
            quantityLeft: tendersInStock ? 22 : 0,
          },
          {
            ...baseItem,
            itemKey: 'hotdog',
            name: 'Hot Dog - known allergens: soy, gluten wheat',
            itemPrice: 4.5,
          },
        ],
      },
      {
        key: 'fruit',
        name: 'Salad/Fruit/Sushi',
        description: null,
        imageUrl: null,
        sequence: 3,
        serviceCategory: 1,
        items: [
          {
            ...baseItem,
            itemKey: 'fruit',
            name: 'Whole fruit',
            itemPrice: 1.3,
            optionSets: [
              {
                optionSetKey: 'variety',
                name: 'Variety',
                maxQuantity: 1,
                minQuantity: 1,
                sequence: 0,
                optionSetRenderType: 1,
                options: [
                  {
                    optionKey: 'apple',
                    name: 'Apple',
                    isActive: true,
                    inStock: true,
                    isDefault: false,
                    optionSequence: 0,
                    optionTax: 0,
                    optionPrice: 0,
                    hasQuantitySellLimit: false,
                    quantityLeft: 0,
                  },
                  {
                    optionKey: 'banana',
                    name: 'Banana',
                    isActive: true,
                    inStock: false,
                    isDefault: false,
                    optionSequence: 1,
                    optionTax: 0,
                    optionPrice: 0,
                    hasQuantitySellLimit: false,
                    quantityLeft: 0,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    allergenSettings: { isEnabled: false, itemBlockingMode: null, allergens: [] },
    userAllergens: [],
  };
}

export function historyWithOrder(dueDate: string) {
  return {
    hasMoreOrders: false,
    orderCount: 1,
    presentOrders: [
      {
        dueDate: `${dueDate}T00:00:00`,
        orders: [
          {
            orderKey: { id: 100, value: 'order-existing' },
            studentKey: { id: 1, value: 'student-1' },
            studentName: 'Sam',
            supplierServiceKey: 'lunch',
            supplierServiceName: 'Lunch',
            supplierServiceCategory: 'Food',
            orderItems: [
              {
                orderItemId: 1,
                itemId: 1,
                itemDisplayName: 'Hot Dog - known allergens: soy, gluten wheat',
                quantityOrdered: 1,
                predefined: false,
              },
            ],
            orderTotal: 4.83,
            dueDate: `${dueDate}T12:40:00`,
            orderState: 'Placed',
            supplierKey: 'canteen',
            currencyCode: 'AUD',
            currencySymbol: '$',
          },
        ],
      },
    ],
    pastOrders: [],
  };
}

export const emptyHistory = {
  hasMoreOrders: false,
  orderCount: 0,
  presentOrders: [],
  pastOrders: [],
};
