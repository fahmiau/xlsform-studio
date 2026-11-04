/**
 * Preferences → Updates (RELEASING.md).
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
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'The update server could not be reached.';
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
      <p className="text-muted-foreground">
        Installed builds only — the dev server has no update feed to check.
      </p>
    </section>
  );
}
