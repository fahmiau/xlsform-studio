import { beforeEach, describe, expect, it } from 'vitest';

import { usePrefsStore } from './prefsStore';

describe('prefsStore (Task 2.1)', () => {
  beforeEach(() => {
    localStorage.clear();
    usePrefsStore.setState({
      theme: 'system',
      layout: { left: 18, center: 64, right: 18 },
      leftPanel: true,
      rightPanel: true,
      hydrated: false,
    });
  });

  it('hydrates theme, layout, and panel visibility from localStorage', async () => {
    localStorage.setItem(
      'xlsform-studio.prefs',
      JSON.stringify({
        theme: 'dark',
        layout: { left: 25, center: 55, right: 20 },
        rightPanel: false,
      }),
    );
    await usePrefsStore.getState().hydrate();
    const state = usePrefsStore.getState();
    expect(state.theme).toBe('dark');
    expect(state.layout).toEqual({ left: 25, center: 55, right: 20 });
    expect(state.rightPanel).toBe(false);
    expect(state.leftPanel).toBe(true);
    expect(state.hydrated).toBe(true);
  });

  it('keeps defaults when nothing is stored and only hydrates once', async () => {
    await usePrefsStore.getState().hydrate();
    expect(usePrefsStore.getState().theme).toBe('system');
    usePrefsStore.getState().setTheme('light');
    await usePrefsStore.getState().hydrate();
    expect(usePrefsStore.getState().theme).toBe('light');
  });
});
