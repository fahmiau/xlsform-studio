import { useEffect, useState } from 'react';

import { commands, type AppInfo } from '@/ipc/bindings';
import { useIsDirty } from '@/state/workbookStore';

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Status bar (Tasks 1.2/1.10, extended in 2.1): encoding, offline posture,
 * saved state, and the version reported by the Rust `app_info` command.
 */
export function StatusBar() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDirty = useIsDirty();

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    let cancelled = false;
    commands
      .appInfo()
      .then((value) => {
        if (!cancelled) setInfo(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer
      className="text-muted-foreground flex items-center gap-4 border-t px-4 py-1 text-xs"
      data-testid="status-bar"
    >
      <span>UTF-8</span>
      <span>Offline</span>
      <span data-testid="save-state">{isDirty ? 'Unsaved' : 'Saved'}</span>
      {info ? (
        <span data-testid="app-version">
          v{info.version} · {info.platform}/{info.arch}
        </span>
      ) : null}
      {error ? <span className="text-destructive">{error}</span> : null}
    </footer>
  );
}
