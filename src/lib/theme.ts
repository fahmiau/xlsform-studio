/** Theme resolution and application (Task 2.1). */
import { useEffect, useState } from 'react';

import type { ThemeMode } from '@/state/prefsStore';

const MEDIA = '(prefers-color-scheme: dark)';

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(MEDIA).matches === true;
}

export function resolveDark(mode: ThemeMode): boolean {
  return mode === 'dark' || (mode === 'system' && systemPrefersDark());
}

/** Toggle Tailwind's `dark` class on the document root. */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolveDark(mode));
}

/** Reactive dark-mode flag, including system changes while the app runs. */
export function useIsDark(mode: ThemeMode): boolean {
  const [systemDark, setSystemDark] = useState(() => systemPrefersDark());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia?.(MEDIA);
    if (!media) return;
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return mode === 'system' ? systemDark : mode === 'dark';
}

export function nextTheme(mode: ThemeMode): ThemeMode {
  if (mode === 'system') return 'light';
  if (mode === 'light') return 'dark';
  return 'system';
}
