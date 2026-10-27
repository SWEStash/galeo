import { describe, expect, it } from 'vitest';
import { FocusOrder } from '../../../src/main/window/focus-order';

describe('FocusOrder', () => {
  it('puts a new or focused window first, once', () => {
    const order = new FocusOrder();
    order.front(1);
    order.front(2);
    order.front(3);
    order.front(1);
    expect(order.ids()).toEqual([1, 3, 2]);
  });

  it('drops a closed window', () => {
    const order = new FocusOrder();
    order.front(1);
    order.front(2);
    order.remove(1);
    expect(order.ids()).toEqual([2]);
  });

  it("hands out the order as it was: a later focus doesn't change it", () => {
    const order = new FocusOrder();
    order.front(1);
    order.front(2);
    const seen = order.ids();
    order.front(1);
    expect(seen).toEqual([2, 1]);
  });
});
