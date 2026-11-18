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

/** Toggle Tailwind's `dark` class on the document root without transition smear. */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const nextDark = resolveDark(mode);
  const changed = root.classList.contains('dark') !== nextDark;
  if (!changed) return;

  let style: HTMLStyleElement | null = null;
  if (document.head && typeof requestAnimationFrame === 'function') {
    style = document.createElement('style');
    style.append(document.createTextNode('*,*::before,*::after{transition:none !important}'));
    document.head.append(style);
  }

  root.classList.toggle('dark', nextDark);

  if (style) {
    void document.body?.offsetHeight;
    const node = style;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => node.remove());
    });
  }
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
