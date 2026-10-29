/**
 * Ctrl+F focus is one-shot: the nonce only grows and both outline inputs
 * remount on sheet/panel changes, so `nonce > 0` alone would steal focus long
 * after the shortcut. A changed nonce still covers the panel-hidden case,
 * where mounting happens because of Ctrl+F.
 */
let lastHandledNonce = 0;

export function handleOutlineSearchNonce(nonce: number): boolean {
  if (nonce === 0 || nonce === lastHandledNonce) return false;
  lastHandledNonce = nonce;
  return true;
}

/** Test-only reset for the module-scope guard. */
export function __resetOutlineSearchFocusForTests(): void {
  lastHandledNonce = 0;
}
