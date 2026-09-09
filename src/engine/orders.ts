import type {
  HistoryOrder,
  Menu,
  MenuItem,
  PlaceOrderError,
  PlaceOrderOption,
  PlaceOrderRequest,
  PlaceOrdersBody,
  PlaceOrdersResponse,
  PlacedOrderResponse,
  Student,
  StudentService,
} from '../api/types';
import { findOption, orderAmount, round2, type Selection } from './pricing';

/** Error codes the portal's placeOrder module maps (its own enum, copied verbatim). */
export const ORDER_ERRORS: Record<number, string> = {
  100: 'That date cannot be ordered for.',
  101: 'The canteen does not serve this school on that date.',
  102: 'This service is not available on that date.',
  103: 'This student is not linked to that service.',
  104: 'An item is sold out or no longer on the menu for that date.',
  105: 'Not enough money in the wallet for these orders.',
  106: 'Prices changed since the menu was loaded. Check the menu again.',
  107: 'This order goes over the daily spending limit.',
  108: 'Flexischools could not place this order.',
  109: 'The cut-off time for that date has passed.',
  110: 'The student is not assigned to a class yet.',
  111: 'The student’s class is no longer valid.',
  114: 'Not enough money in the wallet for this student’s order.',
  115: 'The order total is negative.',
  116: 'There is already an identical order in this batch.',
  119: 'This batch was already submitted.',
};

export function describeOrderError(error: PlaceOrderError | null | undefined): string {
  if (!error) return 'Flexischools could not place this order.';
  return error.errorMessage || ORDER_ERRORS[error.errorCode] || `Error ${error.errorCode}.`;
}

export function findMenuItem(menu: Menu, itemKey: string): MenuItem | undefined {
  for (const category of menu.itemCategories) {
    const item = category.items.find((i) => i.itemKey === itemKey);
    if (item) return item;
  }
  return undefined;
}

export interface AvailabilityCheck {
  ok: boolean;
  problems: string[];
  /** Selections re-pointed at the item definitions from this date's menu, so prices are current. */
  selections: Selection[];
}

/** Whether every chosen item can be ordered from this date's menu, quantities included. */
export function checkAvailability(menu: Menu, selections: Selection[]): AvailabilityCheck {
  const problems: string[] = [];
  const refreshed: Selection[] = [];
  for (const selection of selections) {
    const item = findMenuItem(menu, selection.item.itemKey);
    if (!item) {
      problems.push(`${selection.item.name} is not on the menu`);
      continue;
    }
    if (!item.inStock) {
      problems.push(item.unavailabilityMessage?.trim() || `${item.name} is sold out`);
      continue;
    }
    if (
      item.hasQuantitySellLimit &&
      item.quantityLeft !== null &&
      item.quantityLeft < selection.quantity
    ) {
      problems.push(`Only ${item.quantityLeft} of ${item.name} left`);
      continue;
    }
    const outOfStockOption = selection.options
      .map((choice) => findOption(item, choice.optionKey))
      .find((option) => option && !option.inStock);
    if (outOfStockOption) {
      problems.push(`${outOfStockOption.name} is sold out for ${item.name}`);
      continue;
    }
    if (item.itemPrice !== selection.item.itemPrice) {
      problems.push(`${item.name} is now $${item.itemPrice.toFixed(2)}`);
    }
    refreshed.push({ ...selection, item });
  }
  return { ok: problems.length === 0, problems, selections: refreshed };
}

export interface PlannedOrder {
  /** YYYY-MM-DD */
  date: string;
  /** Local date-time from the fulfilment dates call, e.g. 2026-09-10T12:40:00 */
  dueDate: string;
  selections: Selection[];
}

/** Chosen options, then every default the parent unticked flagged isExcluded, as the portal sends them. */
function orderOptions(selection: Selection): PlaceOrderOption[] {
  const chosen = selection.options.map((choice) => ({
    optionKey: choice.optionKey,
    quantity: choice.quantity,
    isExcluded: false,
    isDefault: findOption(selection.item, choice.optionKey)?.isDefault ?? false,
  }));
  const unticked = selection.item.optionSets
    .flatMap((set) => set.options)
    .filter((o) => o.isDefault && !selection.options.some((c) => c.optionKey === o.optionKey))
    .map((o) => ({ optionKey: o.optionKey, quantity: 1, isExcluded: true, isDefault: true }));
  return [...chosen, ...unticked];
}

export function toPlaceOrderRequest(
  student: Student,
  service: StudentService,
  order: PlannedOrder,
  orderRequestId: string,
): PlaceOrderRequest {
  return {
    orderRequestId,
    studentKey: student.studentKey,
    supplierServiceKey: service.supplierServiceKey,
    supplierKey: service.supplierKey,
    dueDate: order.dueDate,
    orderAmount: orderAmount(order.selections),
    items: order.selections.map((selection) => ({
      itemKey: selection.item.itemKey,
      quantity: selection.quantity,
      options: orderOptions(selection),
      questions: selection.questions.map((q) => ({ questionKey: q.questionKey, answer: q.answer })),
    })),
    orderOrigin: 'Normal',
  };
}

export function buildPlaceOrdersBody(params: {
  student: Student;
  service: StudentService;
  orders: PlannedOrder[];
  feePerOrder: number;
  cartKey: string;
  requestIds: string[];
}): PlaceOrdersBody {
  const placeOrderRequests = params.orders.map((order, index) =>
    toPlaceOrderRequest(params.student, params.service, order, params.requestIds[index]),
  );
  const totalCartAmount = round2(
    placeOrderRequests.reduce((sum, request) => sum + request.orderAmount + params.feePerOrder, 0),
  );
  return { cartKey: params.cartKey, totalCartAmount, placeOrderRequests };
}

export interface OrderOutcome {
  date: string;
  placed: boolean;
  message: string;
  orderKey?: string;
}

/** Pairs each planned order with what Flexischools said about it. */
export function summariseOutcomes(
  orders: PlannedOrder[],
  requestIds: string[],
  response: PlaceOrdersResponse,
): OrderOutcome[] {
  const byRequestId = new Map<string, PlacedOrderResponse>();
  for (const result of response.ordersResponse ?? []) {
    if (result.orderRequestId) byRequestId.set(result.orderRequestId, result);
  }
  return orders.map((order, index) => {
    const result = byRequestId.get(requestIds[index]) ?? response.ordersResponse?.[index];
    if (!result) {
      return {
        date: order.date,
        placed: false,
        message: describeOrderError(response.cartError),
      };
    }
    const orderKey =
      typeof result.orderKey === 'string' ? result.orderKey : (result.orderKey?.value ?? undefined);
    return {
      date: order.date,
      placed: result.orderPlaced,
      message: result.orderPlaced
        ? 'Placed'
        : describeOrderError(result.error ?? response.cartError),
      orderKey: result.orderPlaced ? orderKey : undefined,
    };
  });
}

/** Live (not cancelled) orders per date for this student and service. */
export function existingOrdersByDate(
  history: { presentOrders: Array<{ orders: HistoryOrder[] }> },
  studentKey: string,
  supplierServiceKey: string,
): Map<string, HistoryOrder[]> {
  const map = new Map<string, HistoryOrder[]>();
  for (const group of history.presentOrders) {
    for (const order of group.orders) {
      if (order.studentKey.value !== studentKey) continue;
      if (order.supplierServiceKey !== supplierServiceKey) continue;
      if (order.orderState.startsWith('Cancelled')) continue;
      const date = order.dueDate.slice(0, 10);
      map.set(date, [...(map.get(date) ?? []), order]);
    }
  }
  return map;
}
