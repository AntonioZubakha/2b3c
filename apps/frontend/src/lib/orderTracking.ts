import type { OrderItem, OrderStatus } from './contracts';

export type TrackingStep = {
  id: OrderStatus;
  completed: boolean;
  current: boolean;
};

/** Legacy / manual path: PAID as the paid node instead of CONFIRMED. */
const SEQUENCE_PAID = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED'] as const satisfies readonly OrderStatus[];

/** Standard buyer flow after pay (finalize → CONFIRMED). */
const SEQUENCE_CONFIRMED = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED'] as const satisfies readonly OrderStatus[];

/** Cancelled orders: no DELIVERED node; we do not infer prior progress (no manufacturing history in API). */
const SEQUENCE_CANCELLED = ['PENDING', 'CONFIRMED', 'SHIPPED', 'CANCELLED'] as const satisfies readonly OrderStatus[];

function forwardSequence(status: OrderStatus): readonly OrderStatus[] {
  if (status === 'CANCELLED') return SEQUENCE_CANCELLED;
  if (status === 'PAID') return SEQUENCE_PAID;
  return SEQUENCE_CONFIRMED;
}

/**
 * Steps for buyer timeline UI. Step ids are only `OrderStatus` literals (D-03-01).
 * For `CANCELLED`, earlier steps are neither completed nor current — only cancellation is current.
 */
export function getOrderTrackingSteps(status: OrderStatus): TrackingStep[] {
  if (status === 'CANCELLED') {
    return SEQUENCE_CANCELLED.map((id) => ({
      id,
      completed: false,
      current: id === 'CANCELLED',
    }));
  }

  const seq = forwardSequence(status);
  const pos = seq.indexOf(status);
  const safePos = pos === -1 ? 0 : pos;

  return seq.map((id, i) => ({
    id,
    completed: i < safePos,
    current: i === safePos,
  }));
}

export type OrderListHintGroup = 'prePay' | 'preShip' | 'inTransit' | 'delivered' | 'cancelled';

/** Short list hint under the badge — avoids fixed SLA when shipped/delivered/cancelled (TRK-02). */
export function orderListHintGroup(status: OrderStatus): OrderListHintGroup {
  if (status === 'PENDING') return 'prePay';
  if (status === 'SHIPPED') return 'inTransit';
  if (status === 'DELIVERED') return 'delivered';
  if (status === 'CANCELLED') return 'cancelled';
  return 'preShip';
}

/** Detail-page copy group for processing / progress footnotes (same buckets as list hints). */
export function orderDetailProgressHintGroup(status: OrderStatus): OrderListHintGroup {
  return orderListHintGroup(status);
}

export function orderHasBespoke(items: Pick<OrderItem, 'type'>[]): boolean {
  return items.some((i) => i.type === 'bespoke');
}
