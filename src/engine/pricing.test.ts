import type { MenuItem } from '../api/types';
import {
  cartTotals,
  formatMoney,
  lineTotal,
  missingChoices,
  orderAmount,
  round2,
  splitName,
  unitPrice,
  type Selection,
} from './pricing';

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
    hasQuantitySellLimit: true,
    quantityLeft: 22,
    optionSets: [],
    questionSets: [],
    labels: [],
    allergens: [],
    priceOption: 1,
    requiresQuantitySellLimitCheck: true,
    ...overrides,
  };
}

const sandwich = makeItem({
  itemKey: 'byo',
  name: 'Build-Your-Own',
  itemPrice: 4.2,
  priceOption: 2,
  optionSets: [
    {
      optionSetKey: 'bread',
      name: 'Bread type',
      minQuantity: 1,
      maxQuantity: 1,
      sequence: 0,
      optionSetRenderType: 1,
      options: [
        {
          optionKey: 'white',
          name: 'White',
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
          optionKey: 'wrap',
          name: 'Wrap',
          isActive: true,
          inStock: true,
          isDefault: false,
          optionSequence: 1,
          optionTax: 0,
          optionPrice: 0,
          hasQuantitySellLimit: false,
          quantityLeft: 0,
        },
      ],
    },
    {
      optionSetKey: 'fillings',
      name: 'Fillings',
      minQuantity: null,
      maxQuantity: null,
      sequence: 1,
      optionSetRenderType: 2,
      options: [
        {
          optionKey: 'ham',
          name: 'Light Ham',
          isActive: true,
          inStock: true,
          isDefault: false,
          optionSequence: 0,
          optionTax: 0.09,
          optionPrice: 1,
          hasQuantitySellLimit: false,
          quantityLeft: 0,
        },
        {
          optionKey: 'cheese',
          name: 'Cheese',
          isActive: true,
          inStock: true,
          isDefault: false,
          optionSequence: 1,
          optionTax: 0.05,
          optionPrice: 0.5,
          hasQuantitySellLimit: false,
          quantityLeft: 0,
        },
      ],
    },
  ],
});

describe('pricing', () => {
  it('rounds the way the portal does', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(4.9 + 0.33)).toBe(5.23);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it('prices a plain item by quantity', () => {
    const selection: Selection = { item: makeItem(), quantity: 2, options: [], questions: [] };
    expect(unitPrice(selection)).toBe(4.9);
    expect(lineTotal(selection)).toBe(9.8);
  });

  it('adds paid options into the unit price', () => {
    const selection: Selection = {
      item: sandwich,
      quantity: 1,
      options: [
        { optionKey: 'wrap', quantity: 1 },
        { optionKey: 'ham', quantity: 1 },
        { optionKey: 'cheese', quantity: 2 },
      ],
      questions: [],
    };
    expect(unitPrice(selection)).toBe(6.2);
    expect(
      orderAmount([selection, { item: makeItem(), quantity: 1, options: [], questions: [] }]),
    ).toBe(11.1);
  });

  it('follows the item’s priceOption the way the portal does', () => {
    const options = [
      { optionKey: 'ham', quantity: 1 },
      { optionKey: 'cheese', quantity: 1 },
    ];
    const priced = (priceOption: number): Selection => ({
      item: { ...sandwich, priceOption },
      quantity: 1,
      options,
      questions: [],
    });
    expect(unitPrice(priced(1))).toBe(4.2);
    expect(unitPrice(priced(2))).toBe(5.7);
    expect(unitPrice(priced(0))).toBe(1.5);
    expect(unitPrice(priced(3))).toBe(1.5);
  });

  it('only charges a default option when the item prices all its options', () => {
    const hamByDefault: MenuItem = {
      ...sandwich,
      optionSets: sandwich.optionSets.map((set) => ({
        ...set,
        options: set.options.map((o) => (o.optionKey === 'ham' ? { ...o, isDefault: true } : o)),
      })),
    };
    const priced = (priceOption: number): Selection => ({
      item: { ...hamByDefault, priceOption },
      quantity: 1,
      options: [
        { optionKey: 'ham', quantity: 1 },
        { optionKey: 'cheese', quantity: 1 },
      ],
      questions: [],
    });
    expect(unitPrice(priced(2))).toBe(4.7);
    expect(unitPrice(priced(0))).toBe(0.5);
    expect(unitPrice(priced(3))).toBe(1.5);
  });

  it('totals a term of orders with a fee on each', () => {
    const totals = cartTotals([4.9, 4.9, 4.9], 0.33);
    expect(totals).toEqual({ items: 14.7, fees: 0.99, total: 15.69, orders: 3 });
    expect(cartTotals([], 0.33).total).toBe(0);
  });

  it('formats dollars for Australia', () => {
    expect(formatMoney(5.23)).toBe('$5.23');
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('splits an item name from what trails it after a dash', () => {
    expect(splitName('Hot Dog - known allergens: soy, gluten wheat')).toEqual([
      'Hot Dog',
      'known allergens: soy, gluten wheat',
    ]);
    expect(splitName('Pie - Beef - known allergens: gluten')).toEqual([
      'Pie',
      'Beef - known allergens: gluten',
    ]);
    expect(splitName('Build-Your-Own Sandwich')).toEqual(['Build-Your-Own Sandwich', null]);
  });

  it('reports option sets that still need a choice', () => {
    const bare: Selection = { item: sandwich, quantity: 1, options: [], questions: [] };
    expect(missingChoices(bare)).toEqual(['Bread type']);
    expect(missingChoices({ ...bare, options: [{ optionKey: 'white', quantity: 1 }] })).toEqual([]);
    expect(missingChoices({ item: makeItem(), quantity: 1, options: [], questions: [] })).toEqual(
      [],
    );
  });
});
