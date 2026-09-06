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

/** Price of one serve including its chosen options. */
export function unitPrice(selection: Selection): number {
  const extras = selection.options.reduce((sum, choice) => {
    const option = findOption(selection.item, choice.optionKey);
    return sum + (option?.optionPrice ?? 0) * choice.quantity;
  }, 0);
  return round2(selection.item.itemPrice + extras);
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
