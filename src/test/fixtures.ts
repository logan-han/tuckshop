// Shapes the components are given, trimmed to the fields they actually read. Dates are all
// October 2026 so nothing here depends on when the tests run.

import type {
  FulfillmentDate,
  HistoryOrder,
  Menu,
  MenuCategory,
  MenuItem,
  MenuOption,
  MenuOptionSet,
  Student,
  StudentService,
} from '../api/types';
import type { Selection } from '../engine/pricing';

export const THURSDAYS = ['2026-10-08', '2026-10-15', '2026-10-22'];
export const FRIDAY = '2026-10-09';

export const lunch: StudentService = {
  supplierServiceKey: 'lunch',
  supplierServiceName: 'Lunch ',
  supplierKey: 'canteen',
  supplierSiteKey: 'canteen-site',
  supplierSiteTimeRegionKey: 'melbourne',
};

export const student: Student = {
  studentKey: 'student-1',
  studentId: 1,
  isClassValid: true,
  studentFirstName: 'Sam',
  studentLastName: 'Example',
  schoolKey: 'school-1',
  schoolName: 'Example Grammar',
  schoolSiteKey: 'site-1',
  services: [lunch],
};

export function makeOption(overrides: Partial<MenuOption> = {}): MenuOption {
  return {
    optionKey: 'white',
    name: 'White',
    isActive: true,
    inStock: true,
    isDefault: false,
    optionSequence: 0,
    optionTax: 0,
    optionPrice: 0,
    hasQuantitySellLimit: false,
    quantityLeft: null,
    ...overrides,
  };
}

export function makeOptionSet(overrides: Partial<MenuOptionSet> = {}): MenuOptionSet {
  return {
    optionSetKey: 'bread',
    name: 'Bread type',
    minQuantity: 1,
    maxQuantity: 1,
    sequence: 0,
    optionSetRenderType: 1,
    options: [makeOption(), makeOption({ optionKey: 'multigrain', name: 'Multigrain' })],
    ...overrides,
  };
}

export function makeItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    itemKey: 'tenders',
    name: 'Chicken Tenders (2)',
    itemPrice: 4.9,
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
    ...overrides,
  };
}

export const tenders = makeItem();
export const sushi = makeItem({ itemKey: 'sushi', name: 'Sushi Roll - Tuna', itemPrice: 3.5 });

export function makeCategory(
  items: MenuItem[],
  overrides: Partial<MenuCategory> = {},
): MenuCategory {
  return {
    key: 'hot',
    name: 'Hot Food',
    description: null,
    imageUrl: null,
    sequence: 0,
    serviceCategory: 1,
    items,
    ...overrides,
  };
}

export function makeMenu(categories: MenuCategory[] = [makeCategory([tenders, sushi])]): Menu {
  return {
    supplierServiceKey: lunch.supplierServiceKey,
    serviceItemDescription: 'Lunch',
    supplierServiceName: lunch.supplierServiceName,
    dueDate: `${THURSDAYS[0]}T12:40:00`,
    itemCategories: categories,
    supplierDistributionTimeKey: 'dist',
    currencyCode: 'AUD',
    currencySymbol: '$',
  };
}

export function makeFulfilment(
  date: string,
  overrides: Partial<FulfillmentDate> = {},
): FulfillmentDate {
  return {
    fulfillmentDate: `${date}T12:40:00`,
    hasCutOffTimePassed: false,
    supplierDistributionTimeKey: { id: 1, value: 'dist' },
    closureReason: null,
    ...overrides,
  };
}

export function makeSelection(
  item: MenuItem = tenders,
  overrides: Partial<Selection> = {},
): Selection {
  return { item, quantity: 1, options: [], questions: [], ...overrides };
}

export function makeHistoryOrder(
  date: string,
  overrides: Partial<HistoryOrder> = {},
): HistoryOrder {
  return {
    orderKey: { id: 1, value: `order-${date}` },
    studentKey: { id: 1, value: student.studentKey },
    studentName: 'Sam Example',
    supplierServiceKey: lunch.supplierServiceKey,
    supplierServiceName: lunch.supplierServiceName,
    supplierServiceCategory: 'Food',
    orderItems: [
      {
        orderItemId: 1,
        itemId: 1,
        itemDisplayName: 'Chicken Tenders (2) - Hot',
        quantityOrdered: 1,
        predefined: false,
      },
    ],
    orderTotal: 5.23,
    dueDate: `${date}T12:40:00`,
    orderState: 'Placed',
    supplierKey: lunch.supplierKey,
    currencyCode: 'AUD',
    currencySymbol: '$',
    ...overrides,
  };
}
