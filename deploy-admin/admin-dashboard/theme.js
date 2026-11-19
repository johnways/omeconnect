// OMECOnnect light / dark mode (shared by the customer app and admin console).
// Loaded in <head> before the page draws, so there is no flash of the wrong
// theme. With no saved choice it follows the phone's / computer's own setting;
// once the user taps a theme button, that choice is remembered on this device.
(function () {
  const KEY = 'omeconnect.theme';
  const root = document.documentElement;
  const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function saved() {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null; // storage blocked (private mode): just follow the system
    }
  }

  function current() {
    return saved() || (systemDark && systemDark.matches ? 'dark' : 'light');
  }

  function syncButtons(theme) {
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const dark = theme === 'dark';
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      button.title = dark ? 'Light mode' : 'Dark mode';
    });
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute('content', theme === 'dark' ? '#0a1628' : '#0b2e6b');
    });
  }

  function apply(theme, animate) {
    if (animate) {
      root.classList.add('theme-changing');
      window.setTimeout(() => root.classList.remove('theme-changing'), 400);
    }
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    syncButtons(theme);
  }

  function toggle() {
    const next = current() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch { /* remembered for this visit only */ }
    apply(next, true);
  }

  // Apply immediately (this script runs before the stylesheet paints the page).
  apply(current(), false);

  // Follow the system setting live until the user picks a theme themselves.
  if (systemDark && systemDark.addEventListener) {
    systemDark.addEventListener('change', () => { if (!saved()) apply(current(), true); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    syncButtons(current());
    document.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-theme-toggle]') : null;
      if (button) toggle();
    });
  });

  window.OMECO_THEME = { toggle, current };
})();
