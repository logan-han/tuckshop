import type { MenuItem, MenuOption } from '../api/types';

/** Same rounding the portal uses before sending amounts. */
export function round2(value: number): number {
  return Math.round(value * 100 * (1 + Number.EPSILON)) / 100;
}

export interface OptionChoice {
  optionKey: string;
  quantity: number;
}

export interface Selection {
  item: MenuItem;
  quantity: number;
  options: OptionChoice[];
  questions: Array<{ questionKey: string; answer: string }>;
}

export function findOption(item: MenuItem, optionKey: string): MenuOption | undefined {
  for (const set of item.optionSets) {
    const option = set.options.find((o) => o.optionKey === optionKey);
    if (option) return option;
  }
  return undefined;
}

/** The portal's PriceOption enum: how an item's options feed into its price. */
export const PRICE_OPTION = {
  SumOfOptions: 0,
  ItemPrice: 1,
  ItemPricePlusOptions: 2,
  AllOptions: 3,
} as const;

function optionsPrice(selection: Selection, chargeDefaults: boolean): number {
  return selection.options.reduce((sum, choice) => {
    const option = findOption(selection.item, choice.optionKey);
    if (!option || (option.isDefault && !chargeDefaults)) return sum;
    return sum + option.optionPrice * choice.quantity;
  }, 0);
}

/** Price of one serve, worked out the way the portal does for the item's priceOption. */
export function unitPrice(selection: Selection): number {
  const { item } = selection;
  switch (item.priceOption) {
    case PRICE_OPTION.ItemPrice:
      return round2(item.itemPrice);
    case PRICE_OPTION.SumOfOptions:
      return round2(optionsPrice(selection, false));
    case PRICE_OPTION.AllOptions:
      return round2(optionsPrice(selection, true));
    default:
      return round2(item.itemPrice + optionsPrice(selection, false));
  }
}

export function lineTotal(selection: Selection): number {
  return round2(unitPrice(selection) * selection.quantity);
}

/** Item total for one order (one date), before the order fee. */
export function orderAmount(selections: Selection[]): number {
  return round2(selections.reduce((sum, s) => sum + lineTotal(s), 0));
}

export interface CartTotals {
  items: number;
  fees: number;
  total: number;
  orders: number;
}

/** What Flexischools will charge for a set of orders, each carrying the per-order fee. */
export function cartTotals(orderAmounts: number[], feePerOrder: number): CartTotals {
  const items = round2(orderAmounts.reduce((sum, a) => sum + a, 0));
  const fees = round2(feePerOrder * orderAmounts.length);
  return { items, fees, total: round2(items + fees), orders: orderAmounts.length };
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);
}

/**
 * A canteen item's name and whatever trails it after " - ", usually its allergens:
 * "Hot Dog - known allergens: soy" gives ["Hot Dog", "known allergens: soy"].
 */
export function splitName(name: string): [string, string | null] {
  const [title, ...rest] = name.split(' - ');
  return [title, rest.length > 0 ? rest.join(' - ') : null];
}

/** Option-set choices a menu item still needs before it can be ordered. */
export function missingChoices(selection: Selection): string[] {
  return selection.item.optionSets
    .filter((set) => {
      const min = set.minQuantity ?? 0;
      if (min <= 0) return false;
      const chosen = selection.options
        .filter((c) => set.options.some((o) => o.optionKey === c.optionKey))
        .reduce((sum, c) => sum + c.quantity, 0);
      return chosen < min;
    })
    .map((set) => set.name);
}
