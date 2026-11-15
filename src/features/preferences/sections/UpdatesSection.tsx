/**
 * Preferences → Updates.
 *
 * The check is user-initiated on purpose: a startup check would break the
 * README's "no background request" promise. The network call itself happens in
 * Rust, so the WebView CSP and R4 are untouched.
 */
import { useState } from 'react';
import { toast } from 'sonner';

import { check } from '@tauri-apps/plugin-updater';

type Phase = 'idle' | 'checking' | 'downloading';

function describe(error: unknown): string {
  const raw =
    error instanceof Error && error.message
      ? error.message
      : typeof error === 'string' && error
        ? error
        : '';
  if (!raw) return 'The update server could not be reached.';
  const lower = raw.toLowerCase();
  if (lower.includes('valid release json') || /\b404\b/.test(lower)) {
    return 'No published update was found yet. Check back later or verify your connection.';
  }
  if (
    lower.includes('error sending request') ||
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('dns') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('offline') ||
    lower.includes('connection') ||
    lower.includes('connect')
  ) {
    return 'Could not reach the update server. Check your internet connection and try again.';
  }
  return raw;
}

export function UpdatesSection() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState<string | null>(null);

  const checkForUpdates = async () => {
    setPhase('checking');
    setStatus('Checking for updates…');
    try {
      const update = await check();
      if (!update) {
        setStatus('You are on the newest version.');
        return;
      }
      setPhase('downloading');
      setStatus(`Downloading ${update.version}… the app restarts when it finishes.`);
      await update.downloadAndInstall();
      // On Windows the installer exits the app before this resolves, so the
      // message below is mostly for the platforms that keep it alive.
      setStatus(`${update.version} installed. Reopen the app if it did not restart.`);
    } catch (error) {
      const detail = describe(error);
      setStatus(`Could not check for updates: ${detail}`);
      toast.error('Could not check for updates', { description: detail });
    } finally {
      setPhase('idle');
    }
  };

  return (
    <section className="space-y-1.5">
      <h3 className="text-muted-foreground font-medium">Updates</h3>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="border-input rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={phase !== 'idle'}
          onClick={() => void checkForUpdates()}
          data-testid="check-for-updates"
        >
          {phase === 'checking' ? 'Checking…' : 'Check for updates'}
        </button>
      </div>
      {status ? (
        <p className="text-muted-foreground" role="status" data-testid="update-status">
          {status}
        </p>
      ) : null}
      {!import.meta.env.PROD ? (
        <p className="text-muted-foreground" data-testid="updates-dev-note">
          Installed builds only — the dev server has no update feed to check.
        </p>
      ) : null}
    </section>
  );
}
