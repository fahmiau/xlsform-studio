/**
 * The only place the WebView opens a URL (Q-AI1).
 *
 * The capability in `src-tauri/capabilities/default.json` enforces the same
 * allow-list in Rust; this check keeps the frontend from even trying another
 * URL (custom providers and model-supplied links are plain text).
 */
import { PROVIDER_PRESETS, presetUrls } from './providers';

const ALLOWED_URLS = new Set(PROVIDER_PRESETS.flatMap((preset) => presetUrls(preset)));

export function isAllowedExternalUrl(url: string): boolean {
  return ALLOWED_URLS.has(url);
}

export async function openExternalUrl(url: string): Promise<boolean> {
  if (!isAllowedExternalUrl(url)) return false;
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return true;
  } catch {
    return false;
  }
}
