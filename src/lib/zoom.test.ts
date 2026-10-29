import { describe, expect, it } from 'vitest';

import { formatZoom, nearestZoom, nextZoom } from './zoom';

describe('nearestZoom', () => {
  it('keeps every preset as-is', () => {
    for (const level of [0.8, 0.9, 1, 1.1, 1.25, 1.5]) {
      expect(nearestZoom(level)).toBe(level);
    }
  });

  it('picks the nearest preset', () => {
    expect(nearestZoom(0.82)).toBe(0.8);
    expect(nearestZoom(1.12)).toBe(1.1);
    expect(nearestZoom(1.4)).toBe(1.5);
  });

  it('breaks ties toward the lower level', () => {
    expect(nearestZoom(1.05)).toBe(1);
    expect(nearestZoom(1.175)).toBe(1.1);
  });

  it('clamps outside 0.5–2 before snapping', () => {
    expect(nearestZoom(0.1)).toBe(0.8);
    expect(nearestZoom(0.5)).toBe(0.8);
    expect(nearestZoom(2)).toBe(1.5);
    expect(nearestZoom(99)).toBe(1.5);
  });

  it('falls back to 100% for a non-finite value', () => {
    expect(nearestZoom(Number.NaN)).toBe(1);
    expect(nearestZoom(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('nextZoom', () => {
  it('steps up and down through the presets', () => {
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(1, -1)).toBe(0.9);
    expect(nextZoom(1.1, 1)).toBe(1.25);
  });

  it('stops at both bounds', () => {
    expect(nextZoom(0.8, -1)).toBe(0.8);
    expect(nextZoom(1.5, 1)).toBe(1.5);
  });

  it('snaps an off-preset value before stepping', () => {
    expect(nextZoom(1.04, 1)).toBe(1.1);
    expect(nextZoom(1.04, -1)).toBe(0.9);
  });
});

describe('formatZoom', () => {
  it('renders whole percentages', () => {
    expect(formatZoom(0.8)).toBe('80%');
    expect(formatZoom(1)).toBe('100%');
    expect(formatZoom(1.25)).toBe('125%');
    expect(formatZoom(1.5)).toBe('150%');
  });
});
