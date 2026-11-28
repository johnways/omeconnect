// OMECO Staff Console as a computer app.
//   - Phones and tablets get a notice instead of the console (computers only).
//   - "Install app" button (Chrome / Edge on Windows, macOS, Linux, ChromeOS):
//     the console opens in its own window with its own icon, like a program.
//   - Registers admin-sw.js (needed for installing; it stores no data).
// The installed app is the same website, so sign-in, two-step codes, staff
// roles and every feature work exactly as in the browser.
(function () {
  'use strict';

  const ua = navigator.userAgent || '';
  const isPhoneOrTablet = (navigator.userAgentData && navigator.userAgentData.mobile)
    || /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i.test(ua)
    // iPadOS reports itself as a Mac; a touch-only "Mac" is an iPad.
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

  const standalone = () => window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true;

  // ---------------------------------------------------------------- computers only
  if (isPhoneOrTablet) {
    document.documentElement.classList.add('computer-only');
    document.addEventListener('DOMContentLoaded', () => {
      const notice = document.createElement('section');
      notice.className = 'computer-only-notice';
      notice.setAttribute('role', 'alert');
      notice.innerHTML = `
        <div class="con-card">
          <img src="staff-icon-192.png" alt="" width="72" height="72" />
          <h1>Please use a computer</h1>
          <p>The OMECO Staff Console is made for computers (Windows, Mac or Chromebook) so staff can work with large tables, reports and imports safely.</p>
          <ol>
            <li>Open this page on a computer in <b>Google Chrome</b> or <b>Microsoft Edge</b>.</li>
            <li>Click <b>Install app</b> at the top right (or the install icon in the address bar).</li>
            <li>Open <b>OMECO Staff</b> from the Start menu or desktop and sign in.</li>
          </ol>
          <p class="con-note">Customers use the OMECOnnect phone app instead.</p>
        </div>`;
      document.body.prepend(notice);
    });
    return; // no install button and no service worker on phones
  }

  // ---------------------------------------------------------------- service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('admin-sw.js', { scope: './' }).catch((error) => console.warn('Staff app worker:', error.message));
    });
  }

  // ---------------------------------------------------------------- install button
  let deferred = null;
  const buttons = () => document.querySelectorAll('[data-install-app]');
  const show = (on) => buttons().forEach((b) => b.classList.toggle('hidden', !on));

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // use our own button instead of the mini bar
    deferred = event;
    if (!standalone()) show(true);
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    show(false);
  });
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-install-app]');
    if (!button || !deferred) return;
    button.disabled = true;
    try {
      deferred.prompt();
      await deferred.userChoice;
    } finally {
      deferred = null;
      button.disabled = false;
      show(false);
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    show(Boolean(deferred) && !standalone());
    if (standalone()) document.documentElement.classList.add('as-app');
  });
})();
