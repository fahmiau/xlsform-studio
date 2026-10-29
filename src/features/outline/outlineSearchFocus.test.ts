import { beforeEach, describe, expect, it } from 'vitest';

import { __resetOutlineSearchFocusForTests, handleOutlineSearchNonce } from './outlineSearchFocus';

describe('handleOutlineSearchNonce', () => {
  beforeEach(() => {
    __resetOutlineSearchFocusForTests();
  });

  it('ignores the initial zero nonce', () => {
    expect(handleOutlineSearchNonce(0)).toBe(false);
  });

  it('handles a new nonce once, even across remounts', () => {
    expect(handleOutlineSearchNonce(1)).toBe(true);
    // A remounted outline re-runs its effect with the same stale nonce.
    expect(handleOutlineSearchNonce(1)).toBe(false);
  });

  it('handles the next shortcut as a new nonce', () => {
    expect(handleOutlineSearchNonce(1)).toBe(true);
    expect(handleOutlineSearchNonce(2)).toBe(true);
  });

  it('starts over after the test reset', () => {
    expect(handleOutlineSearchNonce(1)).toBe(true);
    __resetOutlineSearchFocusForTests();
    expect(handleOutlineSearchNonce(1)).toBe(true);
  });
});
