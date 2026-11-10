import { describe, expect, it } from 'vitest';
import { isVersionBelow } from './version';

describe('isVersionBelow', () => {
  it('detects an older major, minor or patch', () => {
    expect(isVersionBelow('1.0.0', '1.0.1')).toBe(true);
    expect(isVersionBelow('1.0.9', '1.1.0')).toBe(true);
    expect(isVersionBelow('1.9.9', '2.0.0')).toBe(true);
  });
  it('accepts equal or newer versions', () => {
    expect(isVersionBelow('1.0.0', '1.0.0')).toBe(false);
    expect(isVersionBelow('1.2.0', '1.1.9')).toBe(false);
    expect(isVersionBelow('2.0.0', '1.9.9')).toBe(false);
  });
  it('treats missing parts as zero and compares numerically', () => {
    expect(isVersionBelow('1.1', '1.1.0')).toBe(false);
    expect(isVersionBelow('1.10.0', '1.9.0')).toBe(false);
  });
});
