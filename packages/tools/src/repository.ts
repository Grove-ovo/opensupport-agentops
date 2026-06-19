export interface MockOrderRecord {
  tenant_id: string;
  contact_id: string;
  order_id: string;
  order_status: 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  logistics_status: 'not_shipped' | 'in_transit' | 'delivered' | 'exception';
  tracking_number: string | null;
  refund_eligible: boolean;
  refund_reason: string | null;
  failure_mode?: 'retryable' | undefined;
}

export class MockBusinessRepository {
  readonly orders: readonly MockOrderRecord[];
  readonly latencyByTool: Readonly<Record<string, number>>;

  constructor(
    orders: readonly MockOrderRecord[],
    latencyByTool: Readonly<Record<string, number>> = {},
  ) {
    this.orders = orders.map((order) => ({ ...order }));
    this.latencyByTool = { ...latencyByTool };
  }

  findOrder(orderId: string): MockOrderRecord | undefined {
    return this.orders.find((order) => order.order_id === orderId);
  }
}
