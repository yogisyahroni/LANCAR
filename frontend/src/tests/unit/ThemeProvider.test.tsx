import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeProvider, { useTheme } from '@/components/providers/ThemeProvider';

function ThemeHarness() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <output data-testid="theme">{theme}</output>
      <output data-testid="resolved-theme">{resolvedTheme}</output>
      <button type="button" onClick={() => setTheme('dark')}>Use dark</button>
      <button type="button" onClick={() => setTheme('system')}>Use system</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  let mediaListeners: Array<(event: MediaQueryListEvent) => void>;
  let matches = false;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    mediaListeners = [];
    matches = false;
    vi.spyOn(window, 'matchMedia').mockImplementation(() => ({
      matches,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        mediaListeners.push(listener as (event: MediaQueryListEvent) => void);
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as MediaQueryList));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to system, persists explicit choices, and applies the resolved class', async () => {
    render(<ThemeProvider><ThemeHarness /></ThemeProvider>);

    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('system'));
    expect(screen.getByTestId('resolved-theme')).toHaveTextContent('light');
    expect(document.documentElement.dataset.theme).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Use dark' }));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('tembus-theme')).toBe('dark');
  });

  it('reacts to OS theme changes while in system mode', async () => {
    localStorage.setItem('tembus-theme', 'system');
    render(<ThemeProvider><ThemeHarness /></ThemeProvider>);

    await waitFor(() => expect(screen.getByTestId('resolved-theme')).toHaveTextContent('light'));
    matches = true;
    for (const listener of mediaListeners) listener({ matches, media: '', type: 'change' } as MediaQueryListEvent);

    await waitFor(() => expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
