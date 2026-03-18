import { describe, it, expect } from 'vitest';
import { deriveRuntimeTemplate } from './series';

describe('deriveRuntimeTemplate', () => {
  it('returns half-hour for 22 min', () => {
    expect(deriveRuntimeTemplate(22)).toBe('half-hour');
  });
  it('returns half-hour for exactly 30 min', () => {
    expect(deriveRuntimeTemplate(30)).toBe('half-hour');
  });
  it('returns one-hour for 44 min', () => {
    expect(deriveRuntimeTemplate(44)).toBe('one-hour');
  });
  it('returns premium-one-hour for 60 min', () => {
    expect(deriveRuntimeTemplate(60)).toBe('premium-one-hour');
  });
  it('returns limited for 90 min', () => {
    expect(deriveRuntimeTemplate(90)).toBe('limited');
  });
});
