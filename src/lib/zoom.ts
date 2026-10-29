/**
 * Whole-app zoom (native webview zoom, persisted as a preference). The pure
 * helpers stay free of Tauri imports because `prefsStore` imports this module.
 */
export const ZOOM_LEVELS = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

/** Clamp to the supported range and pick the nearest preset. Ties pick the lower level. */
export function nearestZoom(value: number): ZoomLevel {
  if (!Number.isFinite(value)) return 1;
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  let best: ZoomLevel = ZOOM_LEVELS[0];
  for (const level of ZOOM_LEVELS) {
    if (Math.abs(clamped - level) < Math.abs(clamped - best)) best = level;
  }
  return best;
}

/** Move one preset up or down; at a bound the level stays put. */
export function nextZoom(value: number, direction: -1 | 1): ZoomLevel {
  const current = nearestZoom(value);
  const next = ZOOM_LEVELS[ZOOM_LEVELS.indexOf(current) + direction];
  return next ?? current;
}

export function formatZoom(level: number): string {
  return `${Math.round(level * 100)}%`;
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Native zoom is best effort: a missing webview must not break editing. */
export async function applyZoom(scale: number): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const { commands } = await import('@/ipc/bindings');
    await commands.setZoom(nearestZoom(scale));
  } catch {
    // best effort
  }
}
