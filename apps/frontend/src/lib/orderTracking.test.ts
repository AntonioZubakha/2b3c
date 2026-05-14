import { describe, expect, it } from 'vitest';
import {
  getOrderTrackingSteps,
  orderHasBespoke,
  orderListHintGroup,
} from './orderTracking';

describe('getOrderTrackingSteps', () => {
  it('PENDING: first step current, nothing completed', () => {
    const steps = getOrderTrackingSteps('PENDING');
    expect(steps[0]).toMatchObject({ id: 'PENDING', completed: false, current: true });
    expect(steps.every((s) => !s.completed || s.current)).toBe(true);
  });

  it('CONFIRMED: PENDING completed, CONFIRMED current; sequence has no PAID', () => {
    const steps = getOrderTrackingSteps('CONFIRMED');
    expect(steps.map((s) => s.id)).not.toContain('PAID');
    expect(steps.find((s) => s.id === 'PENDING')).toMatchObject({ completed: true, current: false });
    expect(steps.find((s) => s.id === 'CONFIRMED')).toMatchObject({ completed: false, current: true });
    expect(steps.find((s) => s.id === 'SHIPPED')?.completed).toBe(false);
  });

  it('PAID: uses PAID branch with PAID current', () => {
    const steps = getOrderTrackingSteps('PAID');
    expect(steps.map((s) => s.id)).toEqual(['PENDING', 'PAID', 'SHIPPED', 'DELIVERED']);
    expect(steps.find((s) => s.id === 'PENDING')).toMatchObject({ completed: true, current: false });
    expect(steps.find((s) => s.id === 'PAID')).toMatchObject({ completed: false, current: true });
  });

  it('SHIPPED: through CONFIRMED completed', () => {
    const steps = getOrderTrackingSteps('SHIPPED');
    expect(steps.find((s) => s.id === 'PENDING')?.completed).toBe(true);
    expect(steps.find((s) => s.id === 'CONFIRMED')?.completed).toBe(true);
    expect(steps.find((s) => s.id === 'SHIPPED')).toMatchObject({ completed: false, current: true });
  });

  it('DELIVERED: all prior legs completed', () => {
    const steps = getOrderTrackingSteps('DELIVERED');
    expect(steps.find((s) => s.id === 'DELIVERED')).toMatchObject({ completed: false, current: true });
    expect(steps.filter((s) => s.completed).map((s) => s.id)).toEqual(['PENDING', 'CONFIRMED', 'SHIPPED']);
  });

  it('CANCELLED: never marks DELIVERED completed; terminal is cancel', () => {
    const steps = getOrderTrackingSteps('CANCELLED');
    const delivered = steps.find((s) => s.id === 'DELIVERED');
    expect(delivered).toBeUndefined();
    expect(steps.every((s) => s.id !== 'DELIVERED' || !s.completed)).toBe(true);
    expect(steps.find((s) => s.id === 'CANCELLED')).toMatchObject({ completed: false, current: true });
    expect(steps.filter((s) => s.completed).length).toBe(0);
  });
});

describe('orderListHintGroup', () => {
  it('maps statuses to hint buckets', () => {
    expect(orderListHintGroup('PENDING')).toBe('prePay');
    expect(orderListHintGroup('CONFIRMED')).toBe('preShip');
    expect(orderListHintGroup('PAID')).toBe('preShip');
    expect(orderListHintGroup('SHIPPED')).toBe('inTransit');
    expect(orderListHintGroup('DELIVERED')).toBe('delivered');
    expect(orderListHintGroup('CANCELLED')).toBe('cancelled');
  });
});

describe('orderHasBespoke', () => {
  it('detects bespoke line', () => {
    expect(orderHasBespoke([{ type: 'diamond' }, { type: 'bespoke' }])).toBe(true);
    expect(orderHasBespoke([{ type: 'jewelry' }])).toBe(false);
  });
});
