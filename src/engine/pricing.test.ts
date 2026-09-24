import type { MenuItem, MenuOption, MenuOptionSet } from '../api/types';
import {
  cartTotals,
  describePrice,
  formatMoney,
  fromPrice,
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

  it('works out the least an item can cost from the options it has to have', () => {
    // A plain item, and one whose only required set has a free choice: their listed price.
    expect(describePrice(makeItem())).toBe('$4.90');
    expect(describePrice(sandwich)).toBe('$4.20');

    const bread = (options: Array<Partial<MenuOption>>, minQuantity = 1) => ({
      ...sandwich.optionSets[0],
      minQuantity,
      options: options.map((o, i) => ({
        ...sandwich.optionSets[0].options[0],
        optionKey: `bread-${i}`,
        ...o,
      })),
    });
    const byo = (priceOption: number, set: MenuOptionSet, itemPrice = 0): MenuItem => ({
      ...sandwich,
      itemPrice,
      priceOption,
      optionSets: [set, sandwich.optionSets[1]],
    });

    // Listed at $0 and priced by its bread; a cheaper bread that is sold out or gone is no help.
    const breads = bread([
      { optionPrice: 3.5, inStock: false },
      { optionPrice: 3.8, isActive: false },
      { optionPrice: 4.5 },
      { optionPrice: 4 },
    ]);
    expect(fromPrice(byo(2, breads))).toBe(4);
    expect(describePrice(byo(2, breads))).toBe('from $4.00');
    // Summed options ignore the item's own price; a fixed price ignores the options.
    expect(describePrice(byo(0, breads, 5))).toBe('from $4.00');
    expect(describePrice(byo(1, breads, 5))).toBe('$5.00');
    // Nothing it has to have costs anything, so there is no "from $0.00".
    expect(describePrice(byo(0, bread([{ optionPrice: 4 }], 0), 5))).toBe('$0.00');

    // Two to choose means the two cheapest.
    const twoOf = bread([{ optionPrice: 1 }, { optionPrice: 0.5 }, { optionPrice: 0.8 }], 2);
    expect(fromPrice(byo(2, twoOf, 4.2))).toBe(5.5);

    // A default option is free unless the item charges for every option.
    const byDefault = bread([{ optionPrice: 4, isDefault: true }, { optionPrice: 4.5 }]);
    expect(fromPrice(byo(2, byDefault))).toBe(0);
    expect(fromPrice(byo(3, byDefault))).toBe(4);

    // Optional radio buttons that start with a default ticked cannot be emptied again: the
    // cheapest of them counts. Left unticked, or as checkboxes, they can be left out.
    const sauce = (options: Array<Partial<MenuOption>>, optionSetRenderType: number) => ({
      ...bread(options, 0),
      maxQuantity: optionSetRenderType === 1 ? 1 : 0,
      optionSetRenderType,
    });
    const tomato = { optionPrice: 0.3, isDefault: true };
    expect(fromPrice(byo(3, sauce([tomato, { optionPrice: 0.5 }], 1)))).toBe(0.3);
    expect(fromPrice(byo(3, sauce([{ ...tomato, isDefault: false }], 1)))).toBe(0);
    expect(fromPrice(byo(3, sauce([tomato], 2)))).toBe(0);
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
