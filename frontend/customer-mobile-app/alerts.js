// OMECOnnect in-app alerts: a heads-up banner at the top of the screen with a
// chime and a short vibration, shown the moment a new notification arrives
// while the app is open. (When the app is closed, the phone's own notification
// does this job; see sw.js.)
(function () {
  'use strict';

  // ------------------------------------------------------------ sound
  let audio = null;
  function audioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audio) {
      try { audio = new Ctx(); } catch { return null; }
    }
    return audio;
  }
  // Phones only allow sound after the user has touched the app once.
  function unlockSound() {
    const ctx = audioContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach((type) =>
    window.addEventListener(type, unlockSound, { passive: true, capture: true }));

  // A short two-note "ding-dong" made in code (no sound file to download).
  function chime() {
    const ctx = audioContext();
    if (!ctx || ctx.state !== 'running') return false;
    const start = ctx.currentTime + 0.02;
    [[987.77, 0], [1318.51, 0.17]].forEach(([frequency, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.4, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.65);
    });
    return true;
  }

  function buzz() {
    try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch { /* not allowed */ }
  }

  // ------------------------------------------------------------ banner
  let banner = null;
  let hideTimer = null;

  function openAlertsScreen() {
    const tab = document.querySelector('.nav-item[data-screen="announcementsScreen"]');
    if (tab) tab.click();
  }

  function hide() {
    clearTimeout(hideTimer);
    if (!banner) return;
    banner.classList.remove('show');
  }

  function build() {
    banner = document.createElement('div');
    banner.className = 'alert-pop';
    banner.setAttribute('role', 'alert');
    banner.innerHTML =
      '<img class="alert-pop-icon" src="/icons/icon-192.png" alt="" width="40" height="40" />' +
      '<div class="alert-pop-body">' +
      '<span class="alert-pop-app">OMECOnnect · now</span>' +
      '<strong class="alert-pop-title"></strong>' +
      '<span class="alert-pop-text"></span>' +
      '<span class="alert-pop-more"></span>' +
      '</div>' +
      '<button class="alert-pop-close" type="button" aria-label="Close">×</button>';
    banner.addEventListener('click', (event) => {
      if (event.target.closest('.alert-pop-close')) { hide(); return; }
      hide();
      openAlertsScreen();
    });
    // Swipe up to dismiss, like a phone notification.
    let startY = null;
    banner.addEventListener('touchstart', (event) => { startY = event.touches[0].clientY; }, { passive: true });
    banner.addEventListener('touchmove', (event) => {
      if (startY !== null && startY - event.touches[0].clientY > 30) { startY = null; hide(); }
    }, { passive: true });
    banner.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    banner.addEventListener('mouseleave', () => { hideTimer = setTimeout(hide, 3000); });
    document.body.appendChild(banner);
  }

  // notes: [{ title, message }] newest first.
  function show(notes, options = {}) {
    if (!notes || !notes.length) return;
    if (!banner) build();
    const first = notes[0];
    banner.querySelector('.alert-pop-title').textContent = first.title || 'OMECOnnect';
    banner.querySelector('.alert-pop-text').textContent = first.message || '';
    banner.querySelector('.alert-pop-more').textContent =
      notes.length > 1 ? `+${notes.length - 1} more — tap to see all` : '';
    banner.classList.remove('show');
    void banner.offsetWidth; // restart the slide-in animation
    banner.classList.add('show');
    if (options.sound !== false) {
      chime();
      buzz();
    }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 7000);
  }

  window.OMECO_ALERTS = { show, hide, chime, unlockSound };
})();
