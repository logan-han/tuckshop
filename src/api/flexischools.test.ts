import { saveSession } from './auth';
import {
  ApiError,
  cancelOrder,
  getAvailableServices,
  getFulfillmentDates,
  getMenu,
  getOrderHistory,
  getStudents,
  getWallet,
  placeOrders,
  uuid,
} from './flexischools';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  saveSession({
    idToken: 'id-token',
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 3_600_000,
    email: 'p@example.com',
    givenName: 'Pat',
    userKey: 'k',
  });
});

afterEach(() => vi.unstubAllGlobals());

function ok(body: unknown, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

describe('flexischools client', () => {
  it('sends the headers the ordering portal sends', async () => {
    fetchMock.mockResolvedValueOnce(ok([]));
    await getStudents();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe(
      'https://bffordering.flexischools.com.au/api/v2.0/service-categories/1/students',
    );
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toMatchObject({
      authorization: 'Bearer id-token',
      'content-type': 'application/json',
      'x-channel': 'ORDERINGPORTAL',
      'x-brandid': '8',
    });
    expect(init.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('posts fulfilment date lookups with query parameters and an empty JSON body', async () => {
    fetchMock.mockResolvedValueOnce(ok([{ fulfillmentDate: '2026-10-08T12:40:00' }]));
    const dates = await getFulfillmentDates('s1', 'svc', '2026-10-05');
    expect(dates[0].fulfillmentDate).toBe('2026-10-08T12:40:00');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe(
      'https://bffordering.flexischools.com.au/api/v1.0/students/s1/supplierservices/svc/next-order-fulfillment-dates?startDate=2026-10-05&includeUnavailableDates=true',
    );
    expect(init.method).toBe('POST');
    expect(init.body).toBe('""');
  });

  it('encodes the menu lookup and the history filter', async () => {
    fetchMock.mockResolvedValueOnce(ok({ itemCategories: [] }));
    await getMenu({
      supplierKey: 'sup',
      supplierServiceKey: 'svc',
      studentKey: 's1',
      schoolKey: 'sch',
      dueDate: '2026-10-08T12:40:00',
    });
    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      'https://bffordering.flexischools.com.au/api/v2.0/suppliers/sup/supplierservices/svc/itemlist?studentKey=s1&dueDate=2026-10-08T12%3A40%3A00&schoolKey=sch',
    );

    fetchMock.mockResolvedValueOnce(ok({ presentOrders: [], pastOrders: [] }));
    await getOrderHistory({ fromDate: '2026-10-01', toDate: '2026-12-31' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      pageIndex: 1,
      pageSize: 50,
      fromDate: '2026-10-01',
      toDate: '2026-12-31',
    });
  });

  it('places and cancels orders on the versions the portal uses', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ isSuccessful: true, ordersResponse: [], cartError: null }),
    );
    const body = { cartKey: 'c', totalCartAmount: 5.23, placeOrderRequests: [] };
    await placeOrders(body);
    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      'https://bffordering.flexischools.com.au/api/v2.0/orders',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(body);

    fetchMock.mockResolvedValueOnce(ok(undefined, 204));
    await expect(cancelOrder('order-1')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[1][0].toString()).toBe(
      'https://bffordering.flexischools.com.au/api/v1.0/orders/order-1',
    );
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
  });

  it('throws an ApiError carrying the status and body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401 }));
    const error = await getWallet().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.body).toBe('nope');
    expect(error.message).toContain('/api/v1.0/payments/user-account');
  });

  it('generates RFC 4122 v4 ids with or without randomUUID', () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(uuid()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});

describe('getAvailableServices', () => {
  it('asks about every listed service with the student’s school keys', async () => {
    fetchMock.mockResolvedValueOnce(ok([{ supplierServiceKey: 'lunch' }]));
    const student = {
      studentKey: 's1',
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
      ],
    };
    const result = await getAvailableServices([student]);
    expect(result).toEqual([{ supplierServiceKey: 'lunch' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe(
      'https://bffordering.flexischools.com.au/api/v1.0/available-services',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual([
      {
        supplierServiceKey: 'lunch',
        supplierServiceName: 'Lunch',
        supplierKey: 'canteen',
        supplierSiteKey: 'canteen-site',
        supplierSiteTimeRegionKey: 'melbourne',
        schoolKey: 'school-1',
        schoolSiteKey: 'site-1',
      },
    ]);
  });

  it('asks about a shared service once for siblings at the same school', async () => {
    fetchMock.mockResolvedValueOnce(ok([]));
    const lunch = {
      supplierServiceKey: 'lunch',
      supplierServiceName: 'Lunch',
      supplierKey: 'canteen',
      supplierSiteKey: 'canteen-site',
      supplierSiteTimeRegionKey: 'melbourne',
    };
    const base = {
      studentId: 1,
      isClassValid: true,
      studentLastName: 'Example',
      schoolKey: 'school-1',
      schoolName: 'Example Grammar',
      schoolSiteKey: 'site-1',
      services: [lunch],
    };
    await getAvailableServices([
      { ...base, studentKey: 's1', studentFirstName: 'Sam' },
      { ...base, studentKey: 's2', studentFirstName: 'Alex' },
      {
        ...base,
        studentKey: 's3',
        studentFirstName: 'Kim',
        schoolKey: 'school-2',
        schoolSiteKey: 'site-2',
      },
    ]);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.map((entry: { schoolKey: string }) => entry.schoolKey)).toEqual([
      'school-1',
      'school-2',
    ]);
  });
});
