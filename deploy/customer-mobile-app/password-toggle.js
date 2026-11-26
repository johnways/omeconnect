// OMECOnnect show / hide password (eye button) — used by both apps.
// Adds an eye button inside every password field, including fields added to
// the page later. Accessible toggle button: a fixed label ("Show password")
// plus aria-pressed, so screen readers announce "on/off" and the
// English/Filipino switch can translate the label safely.
(function () {
  'use strict';

  const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
    '<path class="pw-eye" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
    '<circle class="pw-eye" cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<path class="pw-slash" d="M4 4l16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '</svg>';

  function setVisible(input, button, visible) {
    // Keep the cursor where it was when switching between text and password.
    let start = null;
    let end = null;
    try { start = input.selectionStart; end = input.selectionEnd; } catch { /* not supported */ }
    input.type = visible ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(visible));
    button.classList.toggle('on', visible);
    if (start !== null && document.activeElement === input) {
      try { input.setSelectionRange(start, end); } catch { /* ignore */ }
    }
  }

  function enhance(input) {
    if (input.dataset.pwToggle) return;
    input.dataset.pwToggle = '1';

    const wrap = document.createElement('span');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pw-toggle';
    button.setAttribute('aria-label', 'Show password');
    button.setAttribute('title', 'Show password');
    button.setAttribute('aria-pressed', 'false');
    if (input.id) button.setAttribute('aria-controls', input.id);
    button.innerHTML = EYE;
    wrap.appendChild(button);

    // Do not steal focus from the field on mouse/touch, so the keyboard stays open.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
      event.preventDefault();
      setVisible(input, button, input.type === 'password');
    });

    // Never leave a password showing after the form is sent or cleared.
    const form = input.form;
    if (form) {
      const hide = () => setVisible(input, button, false);
      form.addEventListener('submit', hide, true);
      form.addEventListener('reset', hide);
    }
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('input[type="password"]')) enhance(root);
    root.querySelectorAll('input[type="password"]').forEach(enhance);
  }

  function start() {
    scan(document);
    new MutationObserver((changes) => {
      changes.forEach((change) => change.addedNodes.forEach((node) => {
        if (node.nodeType === 1) scan(node);
      }));
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
