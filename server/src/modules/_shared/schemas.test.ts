import { describe, it, expect } from 'vitest';
import { PerfRangeQuery, toPerfRange } from './schemas.js';

/**
 * specs/16-agent-performance-dashboard.md — `PerfRangeQuery`'s four `.refine()`
 * validations. Each must reject the input it targets so a bad range query
 * 422s at the edge instead of reaching the (potentially unbounded) service
 * layer — see `toPerfRange`'s day-by-day trend loop.
 */
describe('PerfRangeQuery', () => {
  it('accepts a bare preset range_days', () => {
    expect(PerfRangeQuery.safeParse({ range_days: 30 }).success).toBe(true);
  });

  it('accepts a valid custom from/to pair', () => {
    const result = PerfRangeQuery.safeParse({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-08T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts neither range_days nor from/to (defaults resolved by toPerfRange)', () => {
    expect(PerfRangeQuery.safeParse({}).success).toBe(true);
  });

  it('rejects from without to', () => {
    const result = PerfRangeQuery.safeParse({ from: '2026-01-01T00:00:00.000Z' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('from and to must both be provided together'))).toBe(
        true,
      );
    }
  });

  it('rejects to without from', () => {
    const result = PerfRangeQuery.safeParse({ to: '2026-01-01T00:00:00.000Z' });
    expect(result.success).toBe(false);
  });

  it('rejects a range_days value outside the preset set', () => {
    const result = PerfRangeQuery.safeParse({ range_days: 14 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('range_days must be one of'))).toBe(true);
    }
  });

  it('rejects an inverted range (from >= to)', () => {
    const result = PerfRangeQuery.safeParse({
      from: '2026-01-08T00:00:00.000Z',
      to: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('from must be before to'))).toBe(true);
    }
  });

  it('rejects a from === to span', () => {
    const same = '2026-01-01T00:00:00.000Z';
    const result = PerfRangeQuery.safeParse({ from: same, to: same });
    expect(result.success).toBe(false);
  });

  it('rejects a custom span exceeding MAX_RANGE_DAYS', () => {
    const result = PerfRangeQuery.safeParse({
      from: '2020-01-01T00:00:00.000Z',
      to: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('custom range may not exceed'))).toBe(true);
    }
  });

  it('rejects a malformed datetime string', () => {
    const result = PerfRangeQuery.safeParse({ from: 'not-a-date', to: '2026-01-08T00:00:00.000Z' });
    expect(result.success).toBe(false);
  });
});

describe('toPerfRange', () => {
  it('prefers from/to over range_days when both are present', () => {
    const range = toPerfRange({
      range_days: 90,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-08T00:00:00.000Z',
    });
    expect(range).toEqual({
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-01-08T00:00:00.000Z'),
    });
  });

  it('falls back to the preset range_days when from/to are absent', () => {
    expect(toPerfRange({ range_days: 7 })).toEqual({ days: 7 });
  });

  it('defaults to 30 days when neither is supplied', () => {
    expect(toPerfRange({})).toEqual({ days: 30 });
  });
});
