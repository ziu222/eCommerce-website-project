import { quarterEnd } from './penalties.service.js';

describe('quarter end (Vietnam time)', () => {
  it('ends each quarter on its last day at 23:59:59.999 UTC+7', () => {
    expect(quarterEnd(new Date('2026-10-12T05:00:00Z')).toISOString()).toBe('2026-12-31T16:59:59.999Z');
    expect(quarterEnd(new Date('2026-02-01T00:00:00Z')).toISOString()).toBe('2026-03-31T16:59:59.999Z');
    expect(quarterEnd(new Date('2026-06-30T10:00:00Z')).toISOString()).toBe('2026-06-30T16:59:59.999Z');
  });

  it('uses the Vietnam date near midnight', () => {
    // 30 Sep 18:00 UTC is already 1 Oct in Vietnam, so the next quarter
    expect(quarterEnd(new Date('2026-09-30T18:00:00Z')).toISOString()).toBe('2026-12-31T16:59:59.999Z');
  });
});
