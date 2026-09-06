import { getIdToken } from './auth';
import type {
  AvailableService,
  FulfillmentDate,
  Menu,
  OrderDetail,
  OrderFee,
  OrderHistory,
  PlaceOrdersBody,
  PlaceOrdersResponse,
  Student,
  Wallet,
} from './types';

const BASE_URL = 'https://bffordering.flexischools.com.au/api';
const BRAND_ID = '8';
const CHANNEL = 'ORDERINGPORTAL';

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, url: string) {
    super(`Flexischools returned ${status} for ${url}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function uuid(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID();
  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b: number) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface CallOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  query?: Record<string, string>;
}

async function call<T>(
  version: 'v1.0' | 'v2.0',
  path: string,
  options: CallOptions = {},
): Promise<T> {
  const token = await getIdToken();
  const url = new URL(`${BASE_URL}/${version}/${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  const method = options.method ?? 'GET';
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-channel': CHANNEL,
      'x-brandid': BRAND_ID,
      'x-correlation-id': uuid(),
    },
    body: method === 'GET' ? undefined : JSON.stringify(options.body ?? ''),
  });
  const text = await response.text();
  if (!response.ok) throw new ApiError(response.status, text, url.pathname);
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Every student on the account, with the food services they can order from. */
export function getStudents(): Promise<Student[]> {
  return call('v2.0', 'service-categories/1/students');
}

export function getWallet(): Promise<Wallet> {
  return call('v1.0', 'payments/user-account');
}

/** Five consecutive days starting at startDate (YYYY-MM-DD), closures included. */
export function getFulfillmentDates(
  studentKey: string,
  supplierServiceKey: string,
  startDate: string,
): Promise<FulfillmentDate[]> {
  return call(
    'v1.0',
    `students/${studentKey}/supplierservices/${supplierServiceKey}/next-order-fulfillment-dates`,
    { method: 'POST', query: { startDate, includeUnavailableDates: 'true' } },
  );
}

export function getMenu(params: {
  supplierKey: string;
  supplierServiceKey: string;
  studentKey: string;
  schoolKey: string;
  /** Local date-time exactly as returned by getFulfillmentDates. */
  dueDate: string;
}): Promise<Menu> {
  return call(
    'v2.0',
    `suppliers/${params.supplierKey}/supplierservices/${params.supplierServiceKey}/itemlist`,
    {
      query: {
        studentKey: params.studentKey,
        dueDate: params.dueDate,
        schoolKey: params.schoolKey,
      },
    },
  );
}

export function getOrderFee(studentKey: string, supplierServiceKey: string): Promise<OrderFee> {
  return call('v2.0', `orders/${studentKey}/supplierservices/${supplierServiceKey}/orderfee`);
}

export function getOrderHistory(params: {
  fromDate: string | null;
  toDate: string | null;
  pageIndex?: number;
  pageSize?: number;
}): Promise<OrderHistory> {
  return call('v1.0', 'orders/order-history', {
    method: 'POST',
    body: {
      pageIndex: params.pageIndex ?? 1,
      pageSize: params.pageSize ?? 50,
      fromDate: params.fromDate,
      toDate: params.toDate,
    },
  });
}

export function getOrder(orderKey: string): Promise<OrderDetail> {
  return call('v1.0', `orders/${orderKey}`);
}

export function placeOrders(body: PlaceOrdersBody): Promise<PlaceOrdersResponse> {
  return call('v2.0', 'orders', { method: 'POST', body });
}

/** Cancels a placed order; Flexischools refunds it to the wallet. */
export function cancelOrder(orderKey: string): Promise<void> {
  return call('v1.0', `orders/${orderKey}`, { method: 'DELETE' });
}

/**
 * Which of a student's listed services are actually taking orders. Flexischools keeps finished
 * one-off event services (a "French Day" from last term) attached to the student; those come
 * back missing here.
 */
export function getAvailableServices(students: Student[]): Promise<AvailableService[]> {
  const seen = new Set<string>();
  const body = students.flatMap((student) =>
    student.services
      .filter((service) => {
        // Siblings at one school share services; ask about each service once.
        const key = `${student.schoolKey}|${service.supplierServiceKey}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((service) => ({
        supplierServiceKey: service.supplierServiceKey,
        supplierServiceName: service.supplierServiceName,
        supplierKey: service.supplierKey,
        supplierSiteKey: service.supplierSiteKey,
        supplierSiteTimeRegionKey: service.supplierSiteTimeRegionKey,
        schoolKey: student.schoolKey,
        schoolSiteKey: student.schoolSiteKey,
      })),
  );
  return call('v1.0', 'available-services', { method: 'POST', body });
}
