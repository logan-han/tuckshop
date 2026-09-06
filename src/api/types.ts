// Shapes observed from the Flexischools ordering portal (bffordering.flexischools.com.au)
// on 2026-09-07. Nothing here is documented by Flexischools; treat every field as "as seen".

export interface Keyed {
  id: number;
  value: string;
}

export interface StudentService {
  supplierServiceKey: string;
  supplierServiceName: string;
  supplierKey: string;
  supplierSiteKey: string;
  supplierSiteTimeRegionKey: string;
}

export interface Student {
  studentKey: string;
  studentId: number;
  isClassValid: boolean;
  studentFirstName: string;
  studentLastName: string;
  schoolKey: string;
  schoolName: string;
  schoolSiteKey: string;
  services: StudentService[];
}

export interface FulfillmentDate {
  /** Local date-time, e.g. "2026-09-10T12:40:00". Used verbatim as an order's dueDate. */
  fulfillmentDate: string;
  hasCutOffTimePassed: boolean;
  supplierDistributionTimeKey: Keyed;
  closureReason: string | null;
}

export interface MenuOption {
  optionKey: string;
  name: string;
  isActive: boolean;
  inStock: boolean;
  isDefault: boolean;
  optionSequence: number;
  optionTax: number;
  optionPrice: number;
  hasQuantitySellLimit: boolean;
  quantityLeft: number | null;
}

export interface MenuOptionSet {
  optionSetKey: string;
  name: string;
  maxQuantity: number | null;
  minQuantity: number | null;
  sequence: number;
  /** 1 = choose one, 2 = choose any */
  optionSetRenderType: number;
  options: MenuOption[];
}

export interface MenuQuestion {
  questionKey: string;
  name: string;
  isMandatory?: boolean;
}

export interface MenuQuestionSet {
  questionSetKey?: string;
  name?: string;
  questions: MenuQuestion[];
}

export interface MenuItem {
  itemKey: string;
  name: string;
  itemPrice: number;
  itemTax: number;
  isDefaultInOrder: boolean;
  sequence: number;
  inStock: boolean;
  unavailabilityMessage: string;
  imageUrl: string | null;
  description: string | null;
  hasQuantitySellLimit: boolean;
  quantityLeft: number | null;
  optionSets: MenuOptionSet[];
  questionSets: MenuQuestionSet[];
  labels: Array<{ name?: string } | string>;
  allergens: unknown[];
  priceOption: number;
  requiresQuantitySellLimitCheck: boolean;
}

export interface MenuCategory {
  key: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sequence: number;
  serviceCategory: number;
  items: MenuItem[];
}

export interface Menu {
  supplierServiceKey: string;
  serviceItemDescription: string;
  supplierServiceName: string;
  dueDate: string;
  itemCategories: MenuCategory[];
  supplierDistributionTimeKey: string;
  currencyCode: string;
  currencySymbol: string;
}

export interface OrderFee {
  fee: number;
  feeTax: number;
}

export interface Wallet {
  accountKey: string;
  availableBalance: number;
  defaultPaymentMethodName: string | null;
  defaultPaymentMethodReference: string | null;
  topUpAmountOptions: number[];
}

export interface HistoryOrderItem {
  orderItemId: number;
  itemId: number;
  itemDisplayName: string;
  quantityOrdered: number;
  predefined: boolean;
}

export type OrderState = 'Placed' | 'Closed' | 'CancelledByUser' | 'CancelledBySupplier' | string;

export interface HistoryOrder {
  orderKey: Keyed;
  studentKey: Keyed;
  studentName: string;
  supplierServiceKey: string;
  supplierServiceName: string;
  supplierServiceCategory: string;
  orderItems: HistoryOrderItem[];
  orderTotal: number;
  dueDate: string;
  orderState: OrderState;
  supplierKey: string;
  currencyCode: string;
  currencySymbol: string;
}

export interface OrderHistoryGroup {
  dueDate: string;
  orders: HistoryOrder[];
}

export interface OrderHistory {
  hasMoreOrders: boolean;
  orderCount: number;
  presentOrders: OrderHistoryGroup[];
  pastOrders: OrderHistoryGroup[];
}

export interface OrderDetail {
  orderKey: Keyed;
  studentName: string;
  studentKey: Keyed;
  serviceName: string;
  items: Array<{ itemDisplayName: string; itemTotalPrice: number }>;
  totalPrice: number;
  fulfillmentDate: string;
  canCancelOrder: boolean;
  orderState: OrderState;
  orderFee: number;
  totalGst: number;
}

export interface PlaceOrderOption {
  optionKey: string;
  quantity: number;
  isExcluded: boolean;
  isDefault: boolean;
}

export interface PlaceOrderQuestion {
  questionKey: string;
  answer: string;
}

export interface PlaceOrderItem {
  itemKey: string;
  quantity: number;
  options: PlaceOrderOption[];
  questions: PlaceOrderQuestion[];
}

export interface PlaceOrderRequest {
  orderRequestId: string;
  studentKey: string;
  supplierServiceKey: string;
  supplierKey: string;
  dueDate: string;
  /** Item total for this order, before the per-order fee. */
  orderAmount: number;
  items: PlaceOrderItem[];
  orderOrigin: 'Normal';
}

export interface PlaceOrdersBody {
  cartKey: string;
  /** Sum of every order's items plus its order fee. */
  totalCartAmount: number;
  placeOrderRequests: PlaceOrderRequest[];
}

export interface PlaceOrderError {
  errorCode: number;
  errorTitle: string | null;
  errorMessage: string | null;
  multiOrderErrorMessage: string | null;
  renderType: string | null;
  params: Array<{ itemKey: string; quantityLeft: number | null }> | null;
}

export interface PlacedOrderResponse {
  orderRequestId?: string;
  orderPlaced: boolean;
  orderId?: number;
  orderKey?: string | Keyed;
  fulfillmentDate?: string;
  orderTotal?: number;
  error: PlaceOrderError | null;
}

export interface PlaceOrdersResponse {
  isSuccessful: boolean;
  ordersResponse: PlacedOrderResponse[];
  cartError: PlaceOrderError | null;
}
