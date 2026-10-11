import { LiveService } from './live.service.js';

describe('live events', () => {
  it('sends each user only their own events', () => {
    const live = new LiveService();
    const got: unknown[] = [];
    const sub = live.stream(2, 60_000).subscribe((e) => got.push(e));

    live.emit({ userId: 3, type: 'order', data: { orderId: 9, status: 'shipped' } });
    live.emit({ userId: 2, type: 'order', data: { orderId: 7, status: 'confirmed' } });
    sub.unsubscribe();
    live.emit({ userId: 2, type: 'order', data: { orderId: 7, status: 'shipped' } });

    expect(got).toEqual([{ type: 'order', data: { orderId: 7, status: 'confirmed' } }]);
  });
});
