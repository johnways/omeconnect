const screens = document.querySelectorAll('.app-screen');
const navButtons = document.querySelectorAll('[data-screen]');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const verifyAccountForm = document.getElementById('verifyAccountForm');
const notificationList = document.getElementById('notificationList');
const announcementList = document.getElementById('announcementList');
const billList = document.getElementById('billList');
const chatBox = document.getElementById('chatBox');
const aiInput = document.getElementById('aiInput');
const aiSendBtn = document.getElementById('aiSendBtn');
const authMessage = document.getElementById('authMessage');
const appConfig = window.OMECO_CONFIG || { demoMode: false };
const supabaseClient = window.OMECO_SUPABASE;
const demoAccount = {
  email: 'demo.customer@omeco.test',
  password: 'DemoCustomer123!'
};

const demoCustomer = {
  id: 'demo-customer',
  role: 'customer',
  fullName: 'Demo Customer',
  account: {
    account_number: 'DEMO-00001',
    service_area: 'Mamburao'
  },
  bills: [{
    billing_month: 'Demo billing period',
    due_date: '2026-06-30',
    total_amount: 4280,
    outstanding_balance: 4280,
    consumption_kwh: 142,
    status: 'unpaid'
  }],
  announcements: [{
    title: 'Sample scheduled maintenance',
    content: 'This is sample data for demonstration only. It is not an official OMECO notice.',
    affected_area: 'Mamburao',
    is_urgent: false
  }],
  notifications: [{
    title: 'Sample bill reminder',
    message: 'This is sample notification data only.',
    type: 'billing',
    is_read: false
  }],
  chatHistory: []
};

let currentCustomer = null;
let currentSession = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function setMessage(message, kind) {
  if (!authMessage) return;
  authMessage.textContent = message;
  authMessage.className = `form-message ${kind || ''} ${message ? '' : 'hidden'}`;
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(Number(value));
}

// Amounts count up smoothly to a new value (only when it changes).
const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
function countUpCurrency(element, value) {
  if (!element) return;
  const target = value === null || value === undefined || value === '' ? null : Number(value);
  const previous = element.dataset.amount === undefined || element.dataset.amount === '' ? null : Number(element.dataset.amount);
  element.dataset.amount = target === null || Number.isNaN(target) ? '' : String(target);
  if (target === null || Number.isNaN(target)) { element.textContent = formatCurrency(null); return; }
  const from = previous === null || Number.isNaN(previous) ? 0 : previous;
  if (from === target || reduceMotion.matches || document.visibilityState !== 'visible') {
    element.textContent = formatCurrency(target);
    return;
  }
  const start = performance.now();
  const duration = 650;
  const step = (now) => {
    if (element.dataset.amount !== String(target)) return; // a newer value took over
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    element.textContent = formatCurrency(from + (target - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function formatDate(value) {
  if (!value) return 'Not available';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Date and time of a notification, e.g. "Nov 20, 2026, 4:34 PM".
function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  return !date || Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function setScreen(screenId) {
  screens.forEach((screen) => {
    const opening = screen.id === screenId && !screen.classList.contains('active');
    screen.classList.toggle('active', screen.id === screenId);
    // Lists slide in only when a screen is opened, not on every refresh.
    if (opening) {
      screen.classList.add('entering');
      clearTimeout(screen.enteringTimer);
      screen.enteringTimer = setTimeout(() => screen.classList.remove('entering'), 900);
    }
  });

  // My Bills and the estimator open from Home (no own tab), so Home stays lit.
  const tabFor = { billsScreen: 'homeScreen', estimatorScreen: 'homeScreen' };
  const tab = tabFor[screenId] || screenId;
  document.querySelectorAll('.bottom-nav .nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.screen === tab);
  });

  // Sign-in screens show neither the bottom menu nor the AI button.
  const signedOutScreens = ['loginScreen', 'registerScreen', 'forgotScreen', 'otpScreen', 'mfaScreen', 'newPasswordScreen'];
  const signedOut = signedOutScreens.includes(screenId);
  document.querySelector('.bottom-nav').classList.toggle('hidden', signedOut);
  document.getElementById('aiFab').classList.toggle('hidden', signedOut || screenId === 'aiScreen');

  if (screenId === 'complaintsScreen' && typeof loadConcerns === 'function') void loadConcerns();
  // "Change password" (Profile) reuses the reset screen. When signed in, its
  // Back arrow must return to Profile: pointing at the sign-in screen signs
  // the customer out (see the navButtons handler).
  if (screenId === 'forgotScreen') {
    const back = document.querySelector('#forgotScreen .back-btn');
    if (back) back.dataset.screen = currentCustomer ? 'profileScreen' : 'loginScreen';
    const resetEmail = document.getElementById('resetEmail');
    if (currentCustomer && currentCustomer.email && resetEmail && !resetEmail.value) resetEmail.value = currentCustomer.email;
  }
  window.scrollTo({ top: 0 });
}

// Which linked OMECO account the customer is looking at (several can be linked).
const ACCOUNT_KEY = 'omeconnect.account';
function chosenAccountId() {
  try { return localStorage.getItem(ACCOUNT_KEY) || ''; } catch { return ''; }
}
function chooseAccount(accountId) {
  try { localStorage.setItem(ACCOUNT_KEY, accountId); } catch { /* private mode */ }
}

function renderDashboard() {
  renderAccountSummary();
  renderTwoStepCard();
  renderLocation();
  renderBills();
  renderAnnouncements();
  renderNotifications();
  renderChat(currentCustomer.chatHistory);
  if (window.OMECO_FEATURES) window.OMECO_FEATURES.onDashboard();
}

// ---------------------------------------------------------------- Profile photo
// Order: the customer's own uploaded photo, then their Google photo, then initials.
function customerInitials() {
  if (appConfig.demoMode) return 'DU';
  return ((currentCustomer && currentCustomer.fullName) || 'Customer')
    .split(/\s+/).filter((part) => /^[A-Za-z]/.test(part))
    .map((part) => part[0].toUpperCase()).slice(0, 2).join('') || 'C';
}

// Google profile picture from the sign-in identity (only Google's image host).
function googlePhotoFrom(user) {
  const identities = (user && user.identities) || [];
  const google = identities.find((identity) => identity.provider === 'google');
  const data = (google && google.identity_data) || {};
  const metadata = (user && user.user_metadata) || {};
  const candidate = data.avatar_url || data.picture || metadata.avatar_url || metadata.picture || '';
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || !/(^|\.)googleusercontent\.com$/.test(url.hostname)) return '';
    return url.href.replace(/=s\d+-c$/, '=s256-c'); // sharper than the default 96 px
  } catch {
    return '';
  }
}

let avatarLoading = '';
function renderAvatars() {
  const own = currentCustomer && currentCustomer.avatarPath;
  // The uploaded photo is private, so it is fetched with the sign-in (once per path).
  if (own && currentCustomer.ownPhotoFor !== own && avatarLoading !== own && currentSession) {
    avatarLoading = own;
    supabaseClient.downloadAvatar({ path: own, accessToken: currentSession.access_token })
      .then((dataUrl) => {
        if (currentCustomer && currentCustomer.avatarPath === own) {
          currentCustomer.ownPhoto = dataUrl;
          currentCustomer.ownPhotoFor = own;
          renderAvatars();
        }
      })
      .catch((error) => console.warn(error.message))
      .finally(() => { if (avatarLoading === own) avatarLoading = ''; });
  }
  const photo = own && currentCustomer.ownPhotoFor === own ? currentCustomer.ownPhoto
    : (currentCustomer && currentCustomer.googlePhoto) || '';
  const initials = customerInitials();
  document.querySelectorAll('.avatar').forEach((avatar) => {
    const existing = avatar.querySelector('img');
    if (photo) {
      if (!existing || existing.getAttribute('src') !== photo) {
        const img = document.createElement('img');
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.decoding = 'async';
        // If the Google photo cannot load, fall back to initials.
        img.addEventListener('error', () => { avatar.classList.remove('has-photo'); avatar.textContent = initials; });
        img.src = photo;
        avatar.replaceChildren(img);
      }
      avatar.classList.add('has-photo');
    } else {
      avatar.classList.remove('has-photo');
      avatar.textContent = initials;
    }
  });
  const removeButton = document.getElementById('removePhotoButton');
  if (removeButton) removeButton.classList.toggle('hidden', !own);
  const source = document.getElementById('photoSource');
  if (source) {
    source.textContent = own ? 'Your photo'
      : currentCustomer && currentCustomer.googlePhoto ? 'Photo from your Google account' : 'No photo yet';
  }
}

// Big photos (10, 20, 50 MB) are fine: only a small copy is uploaded.
const MAX_PHOTO_MB = 50;

// Fallback decoder: an <img> can open formats createImageBitmap cannot
// (e.g. iPhone HEIC photos in Safari). Uses a data: URL, which the page allows.
function decodeWithImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode failed'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Square-crops and shrinks the picture to a 512 px JPEG in the browser.
// Re-drawing also drops hidden data such as the phone's GPS location.
async function preparePhoto(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    try {
      bitmap = await decodeWithImage(file);
    } catch {
      throw new Error('This picture format is not supported. Please choose a JPG or PNG photo.');
    }
  }
  const width = bitmap.naturalWidth || bitmap.width;
  const height = bitmap.naturalHeight || bitmap.height;
  if (!width || !height) throw new Error('This picture could not be opened.');
  const side = Math.min(width, height);
  const size = Math.max(64, Math.min(512, side));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size);
  if (bitmap.close) bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('Could not prepare the photo.');
  return { blob, dataUrl: canvas.toDataURL('image/jpeg', 0.86) };
}

function setPhotoStatus(text, kind) {
  const status = document.getElementById('photoStatus');
  if (!status) return;
  status.textContent = text;
  status.className = `photo-status ${kind || ''}`.trim();
  status.classList.toggle('hidden', !text);
}

async function changeProfilePhoto(file) {
  if (!file || !currentCustomer) return;
  if (appConfig.demoMode || !currentSession) {
    setPhotoStatus('Photos need a real account (not demo mode).', 'error');
    return;
  }
  if (file.type && !/^image\//.test(file.type)) {
    setPhotoStatus('Please choose a picture file.', 'error');
    return;
  }
  if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
    setPhotoStatus(`That picture is too large (max ${MAX_PHOTO_MB} MB).`, 'error');
    return;
  }
  const button = document.getElementById('changePhotoButton');
  button.classList.add('busy');
  setPhotoStatus('Uploading…');
  try {
    const { blob, dataUrl } = await preparePhoto(file);
    const userId = currentSession.user.id;
    const accessToken = currentSession.access_token;
    const oldPath = currentCustomer.avatarPath;
    const path = await supabaseClient.uploadAvatar({ userId, blob, accessToken });
    await supabaseClient.setAvatarPath({ userId, path, accessToken });
    if (oldPath && oldPath !== path) void supabaseClient.deleteAvatarFile({ path: oldPath, accessToken }).catch(() => {});
    Object.assign(currentCustomer, { avatarPath: path, ownPhoto: dataUrl, ownPhotoFor: path });
    renderAvatars();
    setPhotoStatus('Profile photo updated.', 'success');
  } catch (error) {
    setPhotoStatus(`Could not update the photo: ${error.message}`, 'error');
  } finally {
    button.classList.remove('busy');
  }
}

async function removeProfilePhoto() {
  if (!currentCustomer || !currentCustomer.avatarPath || !currentSession) return;
  const oldPath = currentCustomer.avatarPath;
  try {
    await supabaseClient.setAvatarPath({ userId: currentSession.user.id, path: null, accessToken: currentSession.access_token });
    void supabaseClient.deleteAvatarFile({ path: oldPath, accessToken: currentSession.access_token }).catch(() => {});
    Object.assign(currentCustomer, { avatarPath: '', ownPhoto: '', ownPhotoFor: '' });
    renderAvatars();
    setPhotoStatus(currentCustomer.googlePhoto ? 'Photo removed. Showing your Google photo.' : 'Photo removed.', 'success');
  } catch (error) {
    setPhotoStatus(`Could not remove the photo: ${error.message}`, 'error');
  }
}

document.getElementById('photoInput').addEventListener('change', (event) => {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  void changeProfilePhoto(file);
});
document.getElementById('removePhotoButton').addEventListener('click', () => void removeProfilePhoto());

// Account card, balances and profile fields (safe to call on every refresh).
// Colored chip beside the due date: Paid / Due in N days / Due today / Overdue.
function renderDueChip(bill) {
  const chip = document.getElementById('heroDueChip');
  if (!chip) return;
  const paid = bill && (String(bill.status || '').toLowerCase() === 'paid' || Number(bill.outstanding_balance) === 0);
  const due = bill && bill.due_date ? new Date(`${bill.due_date}T00:00:00`) : null;
  if (!bill || (!paid && (!due || Number.isNaN(due.getTime())))) {
    chip.classList.add('hidden');
    return;
  }
  let text;
  let tone;
  if (paid) {
    text = 'Paid';
    tone = 'ok';
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((due - today) / 86400000);
    if (days < 0) { text = `Overdue · ${-days} ${-days === 1 ? 'day' : 'days'}`; tone = 'late'; }
    else if (days === 0) { text = 'Due today'; tone = 'soon'; }
    else if (days === 1) { text = 'Due tomorrow'; tone = 'soon'; }
    else { text = `Due in ${days} days`; tone = days <= 3 ? 'soon' : 'ok'; }
  }
  chip.textContent = text;
  chip.className = `due-chip ${tone}`;
}

function renderAccountSummary() {
  const account = currentCustomer.account;
  const latestBill = currentCustomer.bills[0];
  const outstanding = latestBill ? latestBill.outstanding_balance : null;
  const accountNumber = account && account.account_number;

  document.getElementById('customerName').textContent =
    currentCustomer.fullName || 'Customer';
  const hour = new Date().getHours();
  document.getElementById('homeGreeting').textContent =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  document.getElementById('heroDueDate').textContent =
    latestBill && latestBill.due_date ? `Due ${formatDate(latestBill.due_date)}` : 'No bill due';
  renderDueChip(latestBill);
  // Let add-on cards (insights.js) refresh with the latest data.
  setTimeout(() => document.dispatchEvent(new CustomEvent('omeco:data')), 0);
  document.getElementById('accountLabel').textContent =
    appConfig.demoMode ? 'Demo account' : (account ? 'Verified account' : 'Not linked yet');
  renderAvatars();
  document.getElementById('demoDashboardBanner').classList.toggle('hidden', !appConfig.demoMode);
  document.getElementById('maskedAccountNumber').textContent =
    accountNumber ? `•••• ${accountNumber.slice(-5)}` : 'Account pending verification';
  countUpCurrency(document.getElementById('currentBillAmount'), outstanding);
  countUpCurrency(document.getElementById('dashboardBalance'), outstanding);
  document.getElementById('dashboardUsage').textContent =
    latestBill && latestBill.consumption_kwh !== null
      ? `${latestBill.consumption_kwh} kWh`
      : '—';
  document.getElementById('dashboardStatus').textContent =
    latestBill ? (latestBill.status || 'Available') : 'No bill';
  countUpCurrency(document.getElementById('quickBillAmount'), outstanding);
  document.getElementById('billDueSummary').textContent =
    latestBill && latestBill.due_date ? `Due date: ${formatDate(latestBill.due_date)}` : 'Due date: —';
  // Total still owed across all unpaid bills (not a placeholder).
  const unpaidTotal = currentCustomer.bills
    .filter((bill) => String(bill.status || '').toLowerCase() !== 'paid')
    .reduce((sum, bill) => sum + (Number(bill.outstanding_balance) || 0), 0);
  countUpCurrency(document.getElementById('billOutstandingTotal'), currentCustomer.bills.length ? unpaidTotal : null);
  // Customers can link more than one OMECO account (house, store, …).
  document.getElementById('verifyAccountForm').classList.remove('hidden');
  document.getElementById('verifyAccountTitle').textContent = account ? 'Link another OMECO account' : 'Link your OMECO account';

  const profileName = document.getElementById('profileName');
  const profileEmail = document.getElementById('profileEmail');
  const profileAccount = document.getElementById('profileAccount');
  const profileArea = document.getElementById('profileArea');
  profileName.textContent = currentCustomer.fullName || 'Customer';
  profileEmail.textContent = currentCustomer.email || '';
  profileAccount.textContent = accountNumber || 'Pending verification';
  profileArea.textContent = (account && account.service_area) || 'Not linked';
}

// Bar chart of kWh per month (latest 12 bills, oldest on the left).
function renderUsageChart() {
  const card = document.getElementById('usageCard');
  const chart = document.getElementById('usageChart');
  const trend = document.getElementById('usageTrend');
  if (!card || !chart) return;
  const points = currentCustomer.bills
    .filter((bill) => bill.consumption_kwh !== null && bill.consumption_kwh !== undefined && !Number.isNaN(Number(bill.consumption_kwh)))
    .slice(0, 12)
    .reverse()
    .map((bill) => ({
      kwh: Number(bill.consumption_kwh),
      label: String(bill.billing_month || ''),
      short: String(bill.billing_month || '').slice(0, 3),
      amount: bill.outstanding_balance ?? bill.total_amount
    }));
  card.classList.toggle('hidden', points.length === 0);
  if (!points.length) return;

  const W = 320;
  const H = 150;
  const top = 18;
  const bottom = 22;
  const max = Math.max(...points.map((p) => p.kwh), 1);
  const slot = W / points.length;
  const barW = Math.min(28, slot * 0.6);
  const bars = points.map((p, i) => {
    const h = Math.max(2, ((H - top - bottom) * p.kwh) / max);
    const x = i * slot + (slot - barW) / 2;
    const y = H - bottom - h;
    const latest = i === points.length - 1;
    const tip = `${p.label}: ${p.kwh} kWh${p.amount !== null && p.amount !== undefined ? ` · ${formatCurrency(p.amount)}` : ''}`;
    return `<g class="bar-group"><title>${escapeHtml(tip)}</title>`
      + `<rect class="bar${latest ? ' latest' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="5" style="animation-delay:${i * 40}ms" />`
      + `<text class="val" x="${(x + barW / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}">${escapeHtml(Math.round(p.kwh))}</text>`
      + `<text class="mon" x="${(x + barW / 2).toFixed(1)}" y="${H - 6}">${escapeHtml(p.short)}</text></g>`;
  }).join('');
  chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><line class="base" x1="0" y1="${H - bottom}" x2="${W}" y2="${H - bottom}" />${bars}</svg>`;
  chart.setAttribute('aria-label', `Electricity use per month: ${points.map((p) => `${p.label} ${p.kwh} kWh`).join(', ')}`);

  // Compare the latest month with the one before.
  if (points.length >= 2 && points[points.length - 2].kwh > 0) {
    const now = points[points.length - 1];
    const before = points[points.length - 2];
    const change = Math.round(((now.kwh - before.kwh) / before.kwh) * 100);
    trend.textContent = change === 0 ? `Same as ${before.short}` : `${change > 0 ? '▲' : '▼'} ${Math.abs(change)}% vs ${before.short}`;
    trend.className = `trend ${change > 0 ? 'up' : change < 0 ? 'down' : 'same'}`;
  } else {
    trend.className = 'trend hidden';
  }
}

function renderBills() {
  if (!billList) return;
  renderUsageChart();

  if (!currentCustomer.bills.length) {
    billList.innerHTML = '<p class="empty-state">No bill is available for this verified account.</p>';
    return;
  }

  billList.innerHTML = currentCustomer.bills.map((bill) => `
    <div class="bill-item" role="button" tabindex="0" data-bill-id="${escapeHtml(bill.id || '')}" aria-label="Open bill details">
      <div>
        <strong>${escapeHtml(bill.billing_month || 'Electricity bill')}</strong>
        <small>Consumption: ${escapeHtml(bill.consumption_kwh ?? '—')} kWh</small>
      </div>
      <div class="bill-meta">
        <span class="amount">${escapeHtml(formatCurrency(bill.outstanding_balance))}</span>
        <span class="badge ${bill.status === 'paid' ? 'approved' : 'info'}">${escapeHtml(bill.status || 'Available')}</span>
        <small>Due ${escapeHtml(formatDate(bill.due_date))}</small>
      </div>
    </div>
  `).join('');
}

function renderAnnouncements() {
  if (!announcementList) return;

  if (!currentCustomer.announcements.length) {
    announcementList.innerHTML = '<p class="empty-state">No current announcements for your account.</p>';
    return;
  }

  announcementList.innerHTML = currentCustomer.announcements.map((announcement) => `
    <article class="announce-item ${announcement.is_urgent ? 'urgent' : ''}">
      <div class="tag-wrap neutral"><span>${escapeHtml(announcement.category || 'Service update')}</span></div>
      <h3>${escapeHtml(announcement.title)}</h3>
      <p>${escapeHtml(announcement.content)}</p>
      <small>${escapeHtml(announcement.affected_area || 'All service areas')}</small>
    </article>
  `).join('');
}

// Unread count on the Alerts tab of the bottom menu.
function renderAlertsBadge() {
  const badge = document.getElementById('navAlertsBadge');
  if (!badge) return;
  const unread = currentCustomer ? currentCustomer.notifications.filter((n) => !n.is_read).length : 0;
  badge.textContent = unread > 9 ? '9+' : String(unread);
  badge.classList.toggle('hidden', !unread);
}

function renderNotifications() {
  if (!notificationList) return;
  renderAlertsBadge();

  if (!currentCustomer.notifications.length) {
    notificationList.innerHTML = '<p class="empty-state">You have no notifications.</p>';
    return;
  }

  notificationList.innerHTML = currentCustomer.notifications.slice(0, 10).map((notification) => {
    const badgeClass = notification.is_read ? 'badge neutral' : 'badge warning';
    const badge = notification.is_read ? 'Read' : 'New';
    return `
      <button type="button" class="list-item notification-item${notification.is_read ? '' : ' unread'}" data-notification-id="${escapeHtml(notification.id)}" aria-haspopup="dialog">
        <div>
          <strong>${escapeHtml(notification.title)}</strong>
          <small class="note-preview">${escapeHtml(notification.message)}</small>
          <span class="note-when">${escapeHtml(formatDateTime(notification.created_at))}</span>
        </div>
        <span class="${badgeClass}">${badge}</span>
      </button>
    `;
  }).join('');
  const unread = currentCustomer.notifications.filter((n) => !n.is_read).length;
  const markAll = document.getElementById('markNotificationsRead');
  if (markAll) markAll.classList.toggle('hidden', !unread);
}

async function markNotificationsRead(notificationId) {
  if (!currentSession || !currentCustomer || appConfig.demoMode) return;
  try {
    await supabaseClient.markNotificationsRead({
      userId: currentSession.user.id,
      accessToken: currentSession.access_token,
      notificationId
    });
    currentCustomer.notifications.forEach((n) => {
      if (!notificationId || n.id === notificationId) n.is_read = true;
    });
    renderNotifications();
  } catch (error) {
    setMessage(`Could not update notifications: ${error.message}`, 'error');
  }
}

if (notificationList) {
  notificationList.addEventListener('click', (event) => {
    const item = event.target.closest('[data-notification-id]');
    if (!item) return;
    // Open the whole message, then mark it as read.
    const note = currentCustomer && currentCustomer.notifications.find((n) => String(n.id) === item.dataset.notificationId);
    if (note && window.OMECO_FEATURES && window.OMECO_FEATURES.openNotification) window.OMECO_FEATURES.openNotification(note);
    if (item.classList.contains('unread')) void markNotificationsRead(item.dataset.notificationId);
  });
}
document.getElementById('markNotificationsRead').addEventListener('click', () => void markNotificationsRead());

// Keep the signed-in customer's data fresh (approvals, new bills, alerts)
// without needing to sign out and back in.
const REFRESH_MS = 60000;
let refreshTimer = null;
let recoverySession = null;

async function refreshCustomerData() {
  if (!currentSession || !currentCustomer || appConfig.demoMode) return;
  try {
    const data = await supabaseClient.getCustomerData({
      userId: currentSession.user.id,
      accessToken: currentSession.access_token,
      accountId: chosenAccountId()
    });
    const knownIds = new Set(currentCustomer.notifications.map((n) => n.id));
    const fresh = (data.notifications || []).filter((n) => !knownIds.has(n.id) && !n.is_read);
    Object.assign(currentCustomer, {
      avatarPath: data.profile ? data.profile.avatar_path || '' : currentCustomer.avatarPath,
      account: data.account,
      accounts: data.accounts || [],
      bills: data.bills || [],
      announcements: data.announcements || [],
      notifications: data.notifications || []
    });
    renderAccountSummary();
    renderBills();
    renderAnnouncements();
    renderNotifications();
    if (window.OMECO_FEATURES) window.OMECO_FEATURES.onRefresh();
    // Pop up only what just arrived (not old unread items found on reopening).
    const recent = fresh
      .filter((n) => !n.created_at || Date.now() - new Date(n.created_at).getTime() < 5 * 60 * 1000)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    if (recent.length && window.OMECO_ALERTS && document.visibilityState === 'visible') {
      // When this phone gets real notifications, the phone itself rings; the
      // in-app pop-up then stays quiet so the sound is not heard twice.
      const phoneRings = pushSupported && Notification.permission === 'granted' && Boolean(savedPushEndpoint());
      window.OMECO_ALERTS.show(recent, { sound: !phoneRings });
    }
  } catch (error) {
    // Session expired or offline: keep what is on screen.
    console.warn('Refresh failed:', error.message);
  }
}

function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => void refreshCustomerData(), REFRESH_MS);
}

function stopAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = null;
}

// ---------------------------------------------------------------- Live session
// Realtime updates + keeping the sign-in valid. The refresh token is kept so
// a reload or app restart does not sign the customer out:
//  - "Keep me signed in" ticked (default): localStorage — survives closing the app.
//  - not ticked (shared phone): sessionStorage — forgotten when the app closes.
// Logout always removes it from both.
const SESSION_KEY = 'omeconnect.customer.session';
const REMEMBER_KEY = 'omeconnect.customer.remember';
const rememberMeBox = document.getElementById('rememberMe');

function wantsToStaySignedIn() {
  try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch { return false; }
}
function storeRememberChoice() {
  try { localStorage.setItem(REMEMBER_KEY, rememberMeBox.checked ? '1' : '0'); } catch { /* ignore */ }
}
rememberMeBox.checked = wantsToStaySignedIn();
rememberMeBox.addEventListener('change', storeRememberChoice);
const LIVE_TABLES = [
  'notifications', 'electricity_bills', 'payments', 'customer_accounts',
  'account_verification_requests', 'announcements', 'complaints', 'users'
];
let liveUpdates = null;
let sessionKeeperTimer = null;
let liveRefreshTimer = null;
let liveConcernsDue = false;

function saveSessionForReload() {
  try {
    if (currentSession && currentSession.refresh_token) {
      const keep = wantsToStaySignedIn();
      (keep ? localStorage : sessionStorage).setItem(SESSION_KEY, currentSession.refresh_token);
      (keep ? sessionStorage : localStorage).removeItem(SESSION_KEY);
    }
  } catch { /* storage unavailable: reload simply means signing in again */ }
}

function forgetSavedSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

function readSavedSession() {
  try {
    const fromDevice = localStorage.getItem(SESSION_KEY);
    if (fromDevice) return { token: fromDevice, store: localStorage };
    const fromTab = sessionStorage.getItem(SESSION_KEY);
    if (fromTab) return { token: fromTab, store: sessionStorage };
  } catch { /* storage blocked */ }
  return null;
}

function onLiveChange({ table }) {
  if (table === 'complaints' || table === '*') liveConcernsDue = true;
  // Several rows often change together (e.g. bill + notification): refresh once.
  clearTimeout(liveRefreshTimer);
  liveRefreshTimer = setTimeout(() => {
    void refreshCustomerData();
    if (liveConcernsDue) {
      liveConcernsDue = false;
      void loadConcerns();
    }
  }, 400);
}

async function keepSessionFresh(force = false) {
  if (!currentSession || !currentSession.refresh_token || appConfig.demoMode) return;
  const expiresAt = Number(currentSession.expires_at || 0) * 1000;
  if (!force && expiresAt && expiresAt - Date.now() > 5 * 60 * 1000) return;
  try {
    const fresh = await supabaseClient.refreshSession(currentSession.refresh_token);
    if (!fresh || !fresh.access_token) return;
    currentSession = { ...currentSession, ...fresh, user: { ...currentSession.user, ...(fresh.user || {}) } };
    saveSessionForReload();
    if (liveUpdates) liveUpdates.setToken(currentSession.access_token);
  } catch (error) {
    console.warn('Could not renew the sign-in:', error.message);
  }
}

// Phones pause timers in the background: renew and catch up when reopened.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !currentSession || !liveUpdates) return;
  void keepSessionFresh().then(() => refreshCustomerData());
});

function startLiveSession() {
  if (appConfig.demoMode || !currentSession || !window.OMECO_LIVE) return;
  saveSessionForReload();
  clearInterval(sessionKeeperTimer);
  sessionKeeperTimer = setInterval(() => void keepSessionFresh(), 60000);
  if (!liveUpdates) {
    liveUpdates = window.OMECO_LIVE.createLiveUpdates({ tables: LIVE_TABLES, onChange: onLiveChange });
  }
  liveUpdates.start(currentSession.access_token);
}

function stopLiveSession() {
  clearInterval(sessionKeeperTimer);
  sessionKeeperTimer = null;
  clearTimeout(liveRefreshTimer);
  if (liveUpdates) liveUpdates.stop();
  forgetSavedSession();
}

// ---------------------------------------------------------------- Phone pop-up notifications
// Web Push: OMECO announcements, bills, verification results and concern
// replies pop up on the phone, even when the app is closed. Every step reports
// its result inside the card, so the customer always sees what happened.
const pushCard = document.getElementById('pushCard');
const pushText = document.getElementById('pushText');
const pushStatus = document.getElementById('pushStatus');
const pushEnableButton = document.getElementById('pushEnableButton');
const pushTestButton = document.getElementById('pushTestButton');
const pushOpenBrowser = document.getElementById('pushOpenBrowser');
const pushSettingButton = document.getElementById('pushSettingButton');
const pushTestSettingButton = document.getElementById('pushTestSettingButton');
const PUSH_DEFAULT_TEXT = pushText.textContent;
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
const onIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
const inAndroidWebView = /; wv\)/.test(navigator.userAgent);
const openedFromHomeScreen = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
let pushJustEnabled = false;
// The pop-up settings panel opens only from the small bell button at the top
// of the dashboard (or from Profile), so the dashboard stays clean.
const pushToggleButton = document.getElementById('pushToggleButton');
const pushToggleLabel = document.getElementById('pushToggleLabel');
const pushToggleDot = document.getElementById('pushToggleDot');
let pushPanelOpen = false;

function setPushPanel(open) {
  pushPanelOpen = Boolean(open) && Boolean(currentSession);
  pushCard.classList.toggle('hidden', !pushPanelOpen);
  pushToggleButton.setAttribute('aria-expanded', String(pushPanelOpen));
  pushToggleButton.classList.toggle('open', pushPanelOpen);
}

// state: 'on' | 'off' | 'blocked' | 'unavailable'
function setPushToggleState(state) {
  pushToggleButton.classList.toggle('on', state === 'on');
  pushToggleDot.classList.toggle('hidden', state === 'on' || state === 'unavailable');
  pushToggleLabel.textContent = state === 'on' ? 'Pop-ups on' : 'Pop-ups';
  pushToggleButton.title = {
    on: 'Pop-up alerts are on for this phone',
    off: 'Turn on pop-up alerts for this phone',
    blocked: 'Pop-up alerts are blocked on this phone',
    unavailable: 'Pop-up alerts are not available in this window'
  }[state];
}

function showPushStatus(text, kind = '') {
  pushStatus.textContent = text;
  pushStatus.className = `push-status ${kind}`;
  pushStatus.classList.toggle('hidden', !text);
}

function base64UrlToBytes(value) {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function getThisPhonesSubscription() {
  if (!pushSupported) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration ? registration.pushManager.getSubscription() : null;
}

async function renderPushControls() {
  if (!currentSession || appConfig.demoMode) {
    setPushPanel(false);
    pushToggleButton.classList.add('hidden');
    return;
  }
  pushToggleButton.classList.remove('hidden');
  pushOpenBrowser.classList.add('hidden');
  if (!pushSupported) {
    pushEnableButton.classList.add('hidden');
    pushTestButton.classList.add('hidden');
    pushTestSettingButton.classList.add('hidden');
    pushSettingButton.disabled = true;
    pushSettingButton.textContent = 'Phone notifications: not available in this window';
    setPushToggleState('unavailable');
    if (onIphone && !openedFromHomeScreen) {
      pushText.textContent = 'On iPhone: open this page in Safari, tap Share → Add to Home Screen, then open OMECOnnect from your home screen to turn on alerts.';
    } else {
      pushText.textContent = inAndroidWebView
        ? 'This app window cannot show pop-up alerts. Open OMECOnnect in Chrome or Samsung Internet, sign in, and turn notifications on there.'
        : 'This browser cannot show pop-up alerts. Open OMECOnnect in Chrome or Samsung Internet to turn them on.';
      pushOpenBrowser.classList.remove('hidden');
    }
    return;
  }
  const permission = Notification.permission;
  const subscription = await getThisPhonesSubscription();
  const isOn = permission === 'granted' && Boolean(subscription);
  pushSettingButton.disabled = false;
  pushSettingButton.textContent = isOn ? 'Phone notifications: On (tap to turn off)' : 'Phone notifications: Off (tap to turn on)';
  pushTestSettingButton.classList.toggle('hidden', !isOn);
  pushTestButton.classList.toggle('hidden', !isOn);
  setPushToggleState(isOn ? 'on' : permission === 'denied' ? 'blocked' : 'off');
  if (permission === 'denied') {
    pushText.textContent = 'Notifications are blocked for OMECOnnect on this phone. To allow them: tap the ⓘ or lock icon next to the web address → Permissions (or Notifications) → Allow. Or: phone Settings → Apps → your browser → Notifications → Sites. Then tap Turn on again.';
    pushEnableButton.classList.remove('hidden');
    return;
  }
  pushText.textContent = isOn
    ? 'Pop-up alerts are ON for this phone. You will be notified about OMECO announcements, bills and updates.'
    : PUSH_DEFAULT_TEXT;
  pushEnableButton.classList.toggle('hidden', isOn);
}

async function sendTestPopUp() {
  if (!currentSession) return;
  showPushStatus('Sending a test notification…');
  try {
    const result = await supabaseClient.sendTestPush(currentSession.access_token);
    if (result && result.sent) {
      showPushStatus('✅ Test sent! A pop-up should appear within a few seconds. If you are looking at the app, check your notification bar.', 'ok');
    } else if (result && result.reason === 'wait') {
      showPushStatus('A test was just sent. Please wait 30 seconds before sending another.');
    } else {
      showPushStatus('This phone is not registered yet. Tap "Turn on notifications" first.', 'error');
    }
  } catch (error) {
    showPushStatus(`Could not send a test: ${error.message}`, 'error');
  }
}

// Registers this phone for pop-ups (permission must already be granted).
async function subscribeThisPhone(report = () => {}) {
  report('Step 2 of 3: registering this phone…');
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const publicKey = await supabaseClient.getPushPublicKey();
  if (!publicKey) throw new Error('Notifications are not set up on the server yet.');
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    // Re-create it only if it was clearly made with a different key. (Some
    // browsers, e.g. Samsung Internet, do not report the key: keep it then —
    // re-creating it on every open kills the registration the server holds.)
    const current = subscription.options && subscription.options.applicationServerKey;
    const wanted = base64UrlToBytes(publicKey);
    const currentBytes = current ? new Uint8Array(current) : null;
    const different = currentBytes && currentBytes.length > 0 &&
      !(currentBytes.length === wanted.length && currentBytes.every((b, i) => b === wanted[i]));
    if (different) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  if (subscription && savedPushEndpoint() === subscription.endpoint) {
    // This phone was registered before. If the server has since dropped it
    // (Google said it expired), throw it away and make a fresh one.
    const known = await supabaseClient.hasPushSubscription(currentSession.access_token, subscription.endpoint).catch(() => true);
    if (known === false) {
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey)
    });
  }
  report('Step 3 of 3: linking this phone to your account…');
  await supabaseClient.savePushSubscription(currentSession.access_token, subscription);
  try { localStorage.setItem(PUSH_ENDPOINT_KEY, subscription.endpoint); } catch { /* ignore */ }
  lastPushCheck = Date.now();
  return subscription;
}

const PUSH_ENDPOINT_KEY = 'omeconnect.pushEndpoint';
let lastPushCheck = 0;
function savedPushEndpoint() {
  try { return localStorage.getItem(PUSH_ENDPOINT_KEY); } catch { return null; }
}

// Each time the app comes back to the front (at most every 10 minutes), make
// sure this phone is still registered, so pop-ups never silently stop.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !currentSession || appConfig.demoMode) return;
  if (!pushSupported || Notification.permission !== 'granted') return;
  if (Date.now() - lastPushCheck < 10 * 60 * 1000) return;
  lastPushCheck = Date.now();
  subscribeThisPhone().then(() => renderPushControls()).catch((error) => console.warn('Pop-up check failed:', error.message));
});

// Notifications are on by default: right after sign-in the app asks the phone
// once. The installed Android app shows the system "Allow notifications?"
// dialog straight away; a browser tab asks on the customer's first tap
// (browsers only allow that question after a tap).
const AUTO_ASK_KEY = 'omeconnect.pushAsked';
let autoAskArmed = false;

let autoAskedThisOpen = false;

async function autoAskForNotifications() {
  if (!currentSession || !pushSupported || Notification.permission !== 'default') return 'skip';
  try { localStorage.setItem(AUTO_ASK_KEY, String(Date.now())); } catch { /* ignore */ }
  let permission = 'default';
  try { permission = await Notification.requestPermission(); } catch { /* ignore */ }
  if (permission === 'granted' && currentSession) {
    try {
      // No banner: once allowed, notifications simply work (keeps the screen clean).
      await subscribeThisPhone();
    } catch (error) {
      console.warn('Could not turn on notifications:', error.message);
    }
  }
  void renderPushControls();
  return permission;
}

function armAutoAsk() {
  // Asks once per app opening while the phone has not decided yet (Android
  // itself stops showing the question if the customer refuses it twice).
  if (autoAskArmed || autoAskedThisOpen || !pushSupported || Notification.permission !== 'default') return;
  autoAskedThisOpen = true;
  autoAskArmed = true;
  const onFirstTap = () => {
    window.removeEventListener('pointerup', onFirstTap, true);
    autoAskArmed = false;
    void autoAskForNotifications();
  };
  if (openedFromHomeScreen) {
    // Installed app: ask now; if the phone wants a tap first, ask on the first tap.
    void autoAskForNotifications().then((result) => {
      if (result === 'default' && currentSession) {
        try { localStorage.removeItem(AUTO_ASK_KEY); } catch { /* ignore */ }
        window.addEventListener('pointerup', onFirstTap, true);
      } else {
        autoAskArmed = false;
      }
    });
  } else {
    window.addEventListener('pointerup', onFirstTap, true);
  }
}

async function turnOnPhoneNotifications() {
  if (!currentSession) return;
  if (!pushSupported) {
    void renderPushControls();
    return;
  }
  pushEnableButton.disabled = true;
  showPushStatus('Step 1 of 3: asking your phone for permission…');
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showPushStatus(permission === 'denied'
        ? 'Notifications are blocked. Allow them in your browser settings (see the steps above), then tap Turn on again.'
        : 'You did not allow notifications. Tap "Turn on notifications" again and choose Allow.', 'error');
      return;
    }
    await subscribeThisPhone(showPushStatus);
    pushJustEnabled = true;
    await renderPushControls();
    await sendTestPopUp();
  } catch (error) {
    const reason = String((error && error.message) || error);
    const hint = /push service|registration failed|abort|not supported/i.test(reason)
      ? ' Your browser could not reach its notification service. Make sure Google Play services are up to date, or try Chrome.'
      : '';
    showPushStatus(`Could not turn on notifications: ${reason}.${hint}`, 'error');
  } finally {
    pushEnableButton.disabled = false;
  }
}

async function turnOffPhoneNotifications(accessToken) {
  const subscription = await getThisPhonesSubscription().catch(() => null);
  if (!subscription) return;
  if (accessToken) await supabaseClient.removePushSubscription(accessToken, subscription.endpoint).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
  try { localStorage.removeItem(PUSH_ENDPOINT_KEY); } catch { /* ignore */ }
}

// After sign-in: if this phone already allows notifications, link it to this customer.
async function syncPhoneNotifications() {
  pushJustEnabled = false;
  showPushStatus('');
  try {
    if (pushSupported && currentSession && !appConfig.demoMode) {
      if (Notification.permission === 'granted') {
        // Allowed before (or by the Android app at install): make sure this
        // phone is registered and linked to this customer — no button needed.
        await subscribeThisPhone();
      } else if (Notification.permission === 'default') {
        armAutoAsk();
      }
    }
  } catch (error) {
    console.warn('Could not link notifications to this account:', error.message);
  }
  void renderPushControls();
}

pushToggleButton.addEventListener('click', () => {
  setPushPanel(!pushPanelOpen);
  if (!pushPanelOpen) showPushStatus('');
});
document.getElementById('pushCloseButton').addEventListener('click', () => {
  setPushPanel(false);
  showPushStatus('');
  pushToggleButton.focus();
});
pushEnableButton.addEventListener('click', () => void turnOnPhoneNotifications());
pushTestButton.addEventListener('click', () => void sendTestPopUp());
pushTestSettingButton.addEventListener('click', () => {
  setScreen('homeScreen');
  setPushPanel(true);
  void sendTestPopUp();
});
pushSettingButton.addEventListener('click', async () => {
  if (!currentSession || !pushSupported) return;
  const subscription = await getThisPhonesSubscription();
  if (Notification.permission === 'granted' && subscription) {
    if (!window.confirm('Turn off pop-up notifications on this phone? You will still see updates inside the app.')) return;
    await turnOffPhoneNotifications(currentSession.access_token);
    pushJustEnabled = false;
    showPushStatus('');
    setMessage('Phone notifications are off.', 'success');
    void renderPushControls();
  } else {
    // Open the panel so the steps and any problem are visible.
    setScreen('homeScreen');
    setPushPanel(true);
    await turnOnPhoneNotifications();
  }
});

// After a reload, an app update or reopening the app, sign back in with the saved token.
let resumingSession = false;
async function resumeSavedSession() {
  if (appConfig.demoMode || !supabaseClient || currentSession || resumingSession) return false;
  const saved = readSavedSession();
  if (!saved) return false;
  resumingSession = true;
  setMessage('Signing you back in…', 'success');
  let session;
  try {
    session = await supabaseClient.refreshSession(saved.token);
  } catch (error) {
    resumingSession = false;
    setMessage('', '');
    // No signal: keep the saved sign-in and try again when the phone is back online.
    // Server said no (expired / signed out elsewhere): forget it.
    if (!(error instanceof TypeError)) forgetSavedSession();
    return false;
  }
  forgetSavedSession(); // the old token is used up; the new one is saved on success
  try {
    const signedIn = await completeSignIn(() => loadCustomerFromSession(session));
    if (signedIn) setMessage('', '');
    return signedIn;
  } finally {
    resumingSession = false;
  }
}

document.getElementById('newPasswordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('', '');
  const password = document.getElementById('newPassword').value;
  const confirm = document.getElementById('newPasswordConfirm').value;
  if (password.length < 10) {
    setMessage('Use at least 10 characters.', 'error');
    return;
  }
  if (password !== confirm) {
    setMessage('The two passwords do not match.', 'error');
    return;
  }
  if (!recoverySession) {
    setMessage('This reset link has expired. Request a new one from "Forgot password?".', 'error');
    return;
  }
  const button = document.getElementById('newPasswordButton');
  button.disabled = true;
  try {
    await supabaseClient.updateUser(recoverySession.access_token, { password });
    const session = { ...recoverySession };
    recoverySession = null;
    document.getElementById('newPasswordForm').reset();
    const signedIn = await completeSignIn(async () => {
      const user = await supabaseClient.getUser(session.access_token);
      return loadCustomerFromSession({ ...session, user });
    });
    if (signedIn) setMessage('Password changed. You are now signed in.', 'success');
  } catch (error) {
    setMessage(`Could not change the password: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
  }
});

function renderChat(history) {
  if (!chatBox) return;
  chatBox.innerHTML = history.map((entry) => `
    <div class="message ${entry.role === 'user' ? 'user' : 'bot'}">${escapeHtml(entry.text)}</div>
  `).join('');
}

function buildAiResponse(input) {
  const query = input.toLowerCase();
  const latestBill = currentCustomer.bills[0];

  if (query.includes('bill') || query.includes('amount') || query.includes('payment')) {
    return latestBill
      ? `Your latest outstanding balance is ${formatCurrency(latestBill.outstanding_balance)}.`
      : 'I cannot see a bill for a verified account yet. Please contact OMECO support if you believe this is incorrect.';
  }

  if (query.includes('due') || query.includes('deadline')) {
    return latestBill && latestBill.due_date
      ? `The due date shown on your latest bill is ${formatDate(latestBill.due_date)}.`
      : 'I cannot confirm a due date because no bill is available for your verified account.';
  }

  if (query.includes('announce') || query.includes('outage') || query.includes('maintenance')) {
    const announcement = currentCustomer.announcements[0];
    return announcement
      ? `Latest announcement: ${announcement.title}. ${announcement.content}`
      : 'There are no current announcements available for your service area.';
  }

  if (query.includes('usage') || query.includes('kwh') || query.includes('consumption')) {
    return latestBill && latestBill.consumption_kwh !== null
      ? `The latest bill records ${latestBill.consumption_kwh} kWh of consumption.`
      : 'I cannot see consumption data for your verified account yet.';
  }

  if (query.includes('complaint') || query.includes('concern')) {
    return 'You can submit a concern from the Concerns section. For an emergency or immediate safety issue, contact OMECO through its official channels.';
  }

  return 'I can help explain bill information, due dates, announcements, and how to submit a concern. I only answer using information available to your signed-in account.';
}

async function handleAiSubmit() {
  const prompt = aiInput.value.trim();
  if (!prompt || !currentCustomer) return;

  aiInput.value = '';
  currentCustomer.chatHistory.push({ role: 'user', text: prompt });

  // Real AI assistant (Claude) when OMECO has switched it on; it saves the chat itself.
  if (window.OMECO_FEATURES && await window.OMECO_FEATURES.aiEnabled()) {
    const pending = { role: 'bot', text: 'Thinking…' };
    currentCustomer.chatHistory.push(pending);
    renderChat(currentCustomer.chatHistory);
    try {
      pending.text = await window.OMECO_FEATURES.askAi(prompt);
      renderChat(currentCustomer.chatHistory);
      return;
    } catch (error) {
      currentCustomer.chatHistory.pop();
      console.warn('AI assistant unavailable, using simple replies:', error.message);
    }
  }

  const response = buildAiResponse(prompt);
  currentCustomer.chatHistory.push({ role: 'bot', text: response });
  renderChat(currentCustomer.chatHistory);

  if (currentSession && supabaseClient) {
    try {
      await supabaseClient.saveChatEntry({
        userId: currentSession.user.id,
        prompt,
        response,
        accessToken: currentSession.access_token
      });
    } catch (error) {
      setMessage(`Chat displayed, but history could not be saved: ${error.message}`, 'error');
    }
  }
}

async function loadCustomerData(email, password) {
  if (appConfig.demoMode) {
    if (email.toLowerCase() !== demoAccount.email || password !== demoAccount.password) {
      throw new Error('Demo login did not match. Use the test credentials shown on this screen.');
    }

    return { ...demoCustomer, email: demoAccount.email };
  }

  if (!supabaseClient) {
    throw new Error('Supabase is not configured. Add the project URL and anon key to customer-mobile-app/config.js.');
  }

  let session;
  try {
    session = await supabaseClient.signInWithPassword({ email, password });
  } catch (error) {
    const text = String(error.message || '').toLowerCase();
    if (text.includes('email not confirmed')) {
      throw new Error(`Please confirm your email first: open the link we sent to ${email}, then sign in again.`);
    }
    if (text.includes('invalid login credentials')) {
      throw new Error('Wrong email or password. Check them and try again, or use "Forgot password?".');
    }
    throw error;
  }
  return loadCustomerFromSession(session, email);
}

// Thrown when the customer turned on an authenticator app but this session
// has not passed its code yet (JWT "aal" is still aal1).
class TwoStepRequired extends Error {
  constructor(session, factorId) {
    super('Enter your authenticator code to continue.');
    this.session = session;
    this.factorId = factorId;
  }
}

function sessionAssuranceLevel(accessToken) {
  try {
    const payload = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).aal || 'aal1';
  } catch {
    return 'aal1';
  }
}

function verifiedTotpFactors(user) {
  return ((user && user.factors) || []).filter(
    (factor) => factor.factor_type === 'totp' && factor.status === 'verified'
  );
}

// Shared by password and Google sign-in, and by the OTP step.
async function loadCustomerFromSession(session, fallbackEmail) {
  if (!session || !session.access_token || !session.user || !session.user.id) {
    throw new Error('Sign-in did not return a valid session.');
  }

  currentSession = session;
  const isAdmin = await supabaseClient.isAdmin(session.access_token);
  if (isAdmin === true) {
    await supabaseClient.signOut(session.access_token);
    currentSession = null;
    throw new Error('This is an administrator account. Please use the admin dashboard.');
  }

  // Re-read the user so phone status and authenticator factors are current.
  const authUser = await supabaseClient.getUser(session.access_token);
  session = { ...session, user: { ...session.user, ...authUser } };
  currentSession = session;

  const totpFactors = verifiedTotpFactors(session.user);
  if (totpFactors.length && sessionAssuranceLevel(session.access_token) !== 'aal2') {
    throw new TwoStepRequired(session, totpFactors[0].id);
  }

  try {
    await submitPendingAccountNumber(session);
  } catch (error) {
    // Not fatal: the customer can still submit it from Profile.
    console.warn('Could not submit the saved account number:', error.message);
  }

  const data = await supabaseClient.getCustomerData({
    userId: session.user.id,
    accessToken: session.access_token,
    accountId: chosenAccountId()
  });

  if (!data.profile) {
    throw new Error('Your profile is not ready yet. Please contact support.');
  }

  return {
    id: session.user.id,
    email: data.profile.email || fallbackEmail || data.profile.mobile_number || '',
    fullName: data.profile.full_name || 'Customer',
    avatarPath: data.profile.avatar_path || '',
    googlePhoto: googlePhotoFrom(session.user),
    accounts: data.accounts || [],
    privacyConsentAt: data.profile.privacy_consent_at || null,
    signupConsent: Boolean(session.user && session.user.user_metadata && session.user.user_metadata.privacy_consent),
    municipality: data.profile.municipality || '',
    barangay: data.profile.barangay || '',
    totpFactors,
    account: data.account,
    bills: data.bills || [],
    announcements: data.announcements || [],
    notifications: data.notifications || [],
    chatHistory: data.chatHistory.length ? data.chatHistory : [{
      role: 'bot',
      text: 'I can help explain account information, bills, and announcements available to your signed-in account.'
    }]
  };
}

async function handleRegistration(event) {
  event.preventDefault();
  setMessage('', '');
  if (!supabaseClient) {
    setMessage('Supabase is not configured. Add the project URL and anon key to customer-mobile-app/config.js.', 'error');
    return;
  }

  const fullName = document.getElementById('registerFullName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const mobileNumber = document.getElementById('registerMobile').value.trim();
  const accountNumber = document.getElementById('registerAccountNumber').value.trim();
  const password = document.getElementById('registerPassword').value;
  const municipality = document.getElementById('registerMunicipality').value;
  const barangay = document.getElementById('registerBarangay').value;
  if (!municipality || !barangay) {
    setMessage('Choose your municipality and barangay.', 'error');
    return;
  }
  const consentBox = document.getElementById('registerConsent');
  if (consentBox && !consentBox.checked) {
    setMessage('Please read and agree to the Privacy Notice to create an account.', 'error');
    consentBox.focus();
    return;
  }

  if (appConfig.demoMode) {
    setMessage('Registration is disabled in demo mode.', 'error');
    return;
  }

  const submitButton = registerForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const phone = supabaseClient.normalizePhoneNumber(mobileNumber);
    const result = await supabaseClient.signUp({
      email,
      password,
      emailRedirectTo: appReturnUrl(),
      metadata: {
        full_name: fullName,
        mobile_number: phone,
        municipality,
        barangay,
        // Sent to OMECO staff for review on the customer's first sign-in.
        account_number: accountNumber,
        privacy_consent: true
      }
    });

    registerForm.reset();
    if (registerLocation) void registerLocation.setValue('', '');

    // When "Confirm email" is off in Supabase, sign-up returns a session:
    // take the customer straight into the app.
    if (result && result.access_token) {
      const signedIn = await completeSignIn(() => loadCustomerFromSession(result, email));
      if (signedIn) setMessage('Welcome to OMECOnnect! Your account is ready.', 'success');
      return;
    }

    setScreen('loginScreen');
    setMessage(`Account created. We sent a confirmation link to ${email}. Open it, then sign in.`, 'success');
  } catch (error) {
    const text = String(error.message || '').toLowerCase();
    if (text.includes('already registered') || text.includes('already been registered')) {
      setMessage('This email already has an account. Sign in instead, or use "Forgot password?".', 'error');
    } else if (text.includes('rate limit')) {
      setMessage('Too many sign-ups right now. Please wait a few minutes and try again.', 'error');
    } else {
      setMessage(error.message, 'error');
    }
  } finally {
    submitButton.disabled = false;
  }
}

// The account number typed at sign-up is sent for staff review once, the first
// time the customer has a session (sign-up happens before the email is confirmed).
async function submitPendingAccountNumber(session) {
  const metadata = (session.user && session.user.user_metadata) || {};
  const accountNumber = String(metadata.account_number || '').trim();
  if (!accountNumber) return;

  const alreadySent = await supabaseClient.hasVerificationRequest({
    userId: session.user.id,
    accessToken: session.access_token
  });
  if (!alreadySent) {
    await supabaseClient.createAccountVerificationRequest({
      userId: session.user.id,
      accountNumber,
      accessToken: session.access_token
    });
  }
  // Clear it so this check does not run on every sign-in.
  await supabaseClient.updateUser(session.access_token, { data: { account_number: null } }).catch(() => {});
}

async function handleAccountVerification(event) {
  event.preventDefault();
  if (!currentSession || !currentCustomer || appConfig.demoMode) {
    setMessage('Sign in with a real customer account before requesting account verification.', 'error');
    return;
  }

  const accountNumber = document.getElementById('verifyAccountNumber').value.trim();
  if (!accountNumber) return;

  try {
    await supabaseClient.createAccountVerificationRequest({
      userId: currentSession.user.id,
      accountNumber,
      accessToken: currentSession.access_token
    });
    verifyAccountForm.reset();
    // The database checks the request right away (phase26): complete
    // requests are approved and linked automatically.
    await refreshCustomerData();
    const linked = (currentCustomer.accounts || []).some((a) => String(a.account_number || '').toUpperCase() === accountNumber.toUpperCase());
    setMessage(linked
      ? 'Approved automatically. Your OMECO account is now linked and your bills are ready.'
      : 'Request sent. It needs a quick check by OMECO staff; see Alerts for anything you can add to your Profile.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

// Runs a sign-in step; on any failure, signs the half-open session out.
async function completeSignIn(loadCustomer) {
  try {
    currentCustomer = await loadCustomer();
    renderDashboard();
    setScreen('homeScreen');
    startAutoRefresh();
    startLiveSession();
    void syncPhoneNotifications();
    return true;
  } catch (error) {
    if (error instanceof TwoStepRequired) {
      openTwoStepScreen(error.session, error.factorId);
      return false;
    }
    if (currentSession && supabaseClient) {
      try {
        await supabaseClient.signOut(currentSession.access_token);
      } catch (signOutError) {
        setMessage(`${error.message} Also, sign-out failed: ${signOutError.message}`, 'error');
        currentSession = null;
        currentCustomer = null;
        return false;
      }
    }
    currentSession = null;
    currentCustomer = null;
    setMessage(error.message, 'error');
    return false;
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('', '');

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  storeRememberChoice();
  await completeSignIn(() => loadCustomerData(email, password));
});

// ---------- Google sign-in ----------
function appReturnUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

document.getElementById('googleSignInButton').addEventListener('click', async () => {
  setMessage('', '');
  if (appConfig.demoMode || !supabaseClient) {
    setMessage('Google sign-in is unavailable in demo mode.', 'error');
    return;
  }
  if (window.location.protocol === 'file:') {
    setMessage('Open the app over http(s) (e.g. VS Code Live Server) to use Google sign-in.', 'error');
    return;
  }
  try {
    if (!(await supabaseClient.isProviderEnabled('google'))) {
      setMessage('Google sign-in is not set up yet. Please use email or try again later.', 'error');
      return;
    }
    storeRememberChoice(); // Google sign-in leaves the page, so remember the choice first
    await supabaseClient.startGoogleSignIn(appReturnUrl());
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

// Handles the redirect back from Google (?code=... or ?error=...).
async function handleOAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = params.get('code');
  const oauthError = params.get('error_description') || hashParams.get('error_description');

  // Password-reset link from the email: #access_token=…&type=recovery
  if (hashParams.get('type') === 'recovery' && hashParams.get('access_token')) {
    window.history.replaceState(null, '', appReturnUrl());
    recoverySession = {
      access_token: hashParams.get('access_token'),
      refresh_token: hashParams.get('refresh_token')
    };
    setScreen('newPasswordScreen');
    setMessage('Choose a new password to finish resetting your account.', 'success');
    return;
  }

  if (!code && !oauthError) return;

  // Remove the code from the address bar so it is not reused or shared.
  window.history.replaceState(null, '', appReturnUrl());

  if (oauthError) {
    setMessage(`Google sign-in failed: ${oauthError}`, 'error');
    return;
  }
  if (appConfig.demoMode || !supabaseClient) return;

  setMessage('Finishing Google sign-in…', 'success');
  const signedIn = await completeSignIn(async () => {
    const session = await supabaseClient.exchangeCodeForSession(code);
    return loadCustomerFromSession(session);
  });
  if (signedIn) setMessage('', '');
}

// ---------- Mobile number verification (SMS OTP) ----------
// Used in two places:
//  - 'register': creating a new account. The account exists only after the
//    code is verified; then the email/password are attached to it.
//  - 'link': an existing account (e.g. Google) with no verified number.
// Codes are valid for 5 minutes. Supabase enforces this on the server
// (Auth > Phone > SMS OTP Expiry = 300); the app also refuses expired codes.
const OTP_VALID_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_S = 60;

const otpPhoneForm = document.getElementById('otpPhoneForm');
const otpCodeForm = document.getElementById('otpCodeForm');
const otpPhoneInput = document.getElementById('otpPhone');
const otpCodeInput = document.getElementById('otpCode');
const otpTimer = document.getElementById('otpTimer');
const otpSendButton = document.getElementById('otpSendButton');
const otpVerifyButton = document.getElementById('otpVerifyButton');
const otpResendButton = document.getElementById('otpResendButton');

let otpState = null;
let otpExpiryTimer = null;
let otpResendTimer = null;

function stopOtpTimers() {
  clearInterval(otpExpiryTimer);
  clearInterval(otpResendTimer);
  otpExpiryTimer = null;
  otpResendTimer = null;
}

function resetOtp() {
  stopOtpTimers();
  otpState = null;
  otpPhoneForm.reset();
  otpCodeForm.reset();
  otpPhoneForm.classList.remove('hidden');
  otpCodeForm.classList.add('hidden');
}

function openOtpScreen({ mode, phone, session, registration }) {
  resetOtp();
  otpState = { mode, phone: phone || '', session, registration, expiresAt: 0 };
  document.getElementById('otpIntro').textContent = mode === 'register'
    ? 'Last step: confirm your mobile number. Your account is created once the code is verified.'
    : 'For your security, every OMECOnnect account must verify a mobile number before continuing.';
  otpPhoneInput.value = phone || '';
  setMessage('', '');
  setScreen('otpScreen');
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function isOtpExpired() {
  return !otpState || !otpState.expiresAt || Date.now() >= otpState.expiresAt;
}

function updateOtpExpiry() {
  if (!otpState) return;
  const remaining = otpState.expiresAt - Date.now();
  if (remaining <= 0) {
    clearInterval(otpExpiryTimer);
    otpExpiryTimer = null;
    otpTimer.textContent = 'This code has expired. Tap "Resend code" to get a new one.';
    otpTimer.classList.add('expired');
    setMessage('', '');
    otpCodeInput.value = '';
    otpCodeInput.disabled = true;
    otpVerifyButton.disabled = true;
    return;
  }
  otpTimer.textContent = `Code expires in ${formatRemaining(remaining)}`;
  otpTimer.classList.remove('expired');
}

function startResendCooldown() {
  clearInterval(otpResendTimer);
  let remaining = OTP_RESEND_COOLDOWN_S;
  otpResendButton.disabled = true;
  otpResendButton.textContent = `Resend code (${remaining}s)`;
  otpResendTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(otpResendTimer);
      otpResendTimer = null;
      otpResendButton.disabled = false;
      otpResendButton.textContent = 'Resend code';
    } else {
      otpResendButton.textContent = `Resend code (${remaining}s)`;
    }
  }, 1000);
}

async function sendOtpCode() {
  if (!otpState) return;
  if (!(await supabaseClient.isProviderEnabled('phone'))) {
    throw new Error('Mobile verification is not available yet, so this step cannot be completed. Please try again later.');
  }

  const phone = otpState.phone;
  if (otpState.mode === 'register') {
    await supabaseClient.sendSignupOtp(phone, {
      full_name: otpState.registration.fullName,
      mobile_number: phone,
      municipality: otpState.registration.municipality,
      barangay: otpState.registration.barangay
    });
  } else {
    await supabaseClient.requestPhoneVerification(otpState.session.access_token, phone);
  }

  // A new code always replaces the old one and restarts the 5-minute window.
  otpState.expiresAt = Date.now() + OTP_VALID_MS;
  document.getElementById('otpSentTo').textContent = phone;
  otpPhoneForm.classList.add('hidden');
  otpCodeForm.classList.remove('hidden');
  otpCodeInput.disabled = false;
  otpVerifyButton.disabled = false;
  otpCodeInput.value = '';
  otpCodeInput.focus();
  clearInterval(otpExpiryTimer);
  updateOtpExpiry();
  otpExpiryTimer = setInterval(updateOtpExpiry, 1000);
  startResendCooldown();
  setMessage(`We sent a 6-digit code to ${phone}. It is valid for 5 minutes.`, 'success');
}

async function finishRegistration(session) {
  const { fullName, email, password, accountNumber } = otpState.registration;
  const user = session.user || {};

  // The number already belongs to a finished account: do not overwrite it.
  if (user.email || user.new_email) {
    await supabaseClient.signOut(session.access_token);
    throw new Error('This mobile number already has an OMECOnnect account. Please sign in with your email and password.');
  }

  try {
    await supabaseClient.updateUser(
      session.access_token,
      { email, password, data: { full_name: fullName } },
      appReturnUrl()
    );
    if (accountNumber) {
      await supabaseClient.createAccountVerificationRequest({
        userId: user.id,
        accountNumber,
        accessToken: session.access_token
      });
    }
  } finally {
    await supabaseClient.signOut(session.access_token).catch(() => {});
  }

  resetOtp();
  registerForm.reset();
  if (registerLocation) void registerLocation.setValue('', '');
  setScreen('loginScreen');
  setMessage(`Mobile number verified and account created. We sent a confirmation link to ${email}. Open it, then sign in.`, 'success');
}

async function verifyOtpCode() {
  if (!otpState) return;
  if (isOtpExpired()) {
    updateOtpExpiry();
    throw new Error('This code has expired. Please request a new one.');
  }

  const token = otpCodeInput.value.trim();
  if (!/^\d{6}$/.test(token)) {
    throw new Error('Enter the 6-digit code from the SMS.');
  }

  const phone = otpState.phone;
  if (otpState.mode === 'register') {
    const session = await supabaseClient.verifyPhoneOtp({ phone, token, type: 'sms' });
    if (!session || !session.access_token) throw new Error('Verification did not return a session.');
    await finishRegistration(session);
    return;
  }

  const result = await supabaseClient.verifyPhoneOtp({ phone, token, type: 'phone_change' });
  const session = result && result.access_token
    ? result
    : { ...otpState.session, user: (result && (result.user || result)) || otpState.session.user };
  stopOtpTimers();
  otpState = null;
  await completeSignIn(() => loadCustomerFromSession(session));
}

otpPhoneForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('', '');
  otpSendButton.disabled = true;
  try {
    otpState.phone = supabaseClient.normalizePhoneNumber(otpPhoneInput.value);
    await sendOtpCode();
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    otpSendButton.disabled = false;
  }
});

otpCodeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('', '');
  otpVerifyButton.disabled = true;
  try {
    await verifyOtpCode();
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    if (otpState && !isOtpExpired()) otpVerifyButton.disabled = false;
  }
});

otpResendButton.addEventListener('click', async () => {
  setMessage('', '');
  try {
    await sendOtpCode();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

document.getElementById('otpChangeNumberButton').addEventListener('click', () => {
  setMessage('', '');
  if (otpState && otpState.mode === 'register') {
    resetOtp();
    setScreen('registerScreen');
    return;
  }
  stopOtpTimers();
  otpState.expiresAt = 0;
  otpCodeForm.classList.add('hidden');
  otpPhoneForm.classList.remove('hidden');
  otpPhoneInput.focus();
});

document.getElementById('otpBackButton').addEventListener('click', () => {
  setMessage('', '');
  if (otpState && otpState.mode === 'link') {
    void logout(); // Leaving without a verified number signs the account out.
    return;
  }
  resetOtp();
  setScreen('registerScreen');
});

// ---------- Authenticator app two-step verification (TOTP) ----------
// Optional extra protection. Free and works offline: codes come from an app
// such as Google Authenticator. Once turned on, the database itself refuses
// this customer's data to any session that skipped the code
// (database/phase6_authenticator_app_2fa.sql).
let twoStepPending = null; // { session, factorId } while at the sign-in code step
let enrollingFactorId = null;

const mfaChallengeForm = document.getElementById('mfaChallengeForm');
const mfaChallengeCode = document.getElementById('mfaChallengeCode');
const mfaChallengeButton = document.getElementById('mfaChallengeButton');
const mfaSetupButton = document.getElementById('mfaSetupButton');
const mfaEnrollPanel = document.getElementById('mfaEnrollPanel');
const mfaEnrollForm = document.getElementById('mfaEnrollForm');
const mfaEnrollCode = document.getElementById('mfaEnrollCode');
const mfaDisableButton = document.getElementById('mfaDisableButton');

function readSixDigits(input) {
  const code = input.value.replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit code from your authenticator app.');
  return code;
}

function openTwoStepScreen(session, factorId) {
  twoStepPending = { session, factorId };
  mfaChallengeForm.reset();
  setMessage('', '');
  setScreen('mfaScreen');
  mfaChallengeCode.focus();
}

mfaChallengeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('', '');
  if (!twoStepPending) return;
  mfaChallengeButton.disabled = true;
  try {
    const code = readSixDigits(mfaChallengeCode);
    const { session, factorId } = twoStepPending;
    const upgraded = await supabaseClient.verifyTotp(session.access_token, factorId, code);
    twoStepPending = null;
    await completeSignIn(() => loadCustomerFromSession({ ...session, ...upgraded }));
  } catch (error) {
    mfaChallengeCode.value = '';
    setMessage(error.message, 'error');
  } finally {
    mfaChallengeButton.disabled = false;
  }
});

document.getElementById('mfaBackButton').addEventListener('click', () => {
  twoStepPending = null;
  void logout(); // Leaving the code step signs the half-finished session out.
});

function resetTwoStepEnrollment() {
  enrollingFactorId = null;
  mfaEnrollForm.reset();
  mfaEnrollPanel.classList.add('hidden');
  document.getElementById('mfaQr').removeAttribute('src');
  document.getElementById('mfaSecret').textContent = '';
}

function renderTwoStepCard() {
  const card = document.getElementById('mfaCard');
  card.classList.toggle('hidden', Boolean(appConfig.demoMode));
  const enabled = Boolean(currentCustomer && currentCustomer.totpFactors && currentCustomer.totpFactors.length);
  document.getElementById('mfaStatusText').textContent = enabled
    ? 'On. After signing in, you will be asked for the code from your authenticator app.'
    : 'Off. Add an authenticator app (Google Authenticator, Microsoft Authenticator) for extra protection. It is free and works without signal.';
  mfaSetupButton.classList.toggle('hidden', enabled || Boolean(enrollingFactorId));
  mfaDisableButton.classList.toggle('hidden', !enabled);
}

mfaSetupButton.addEventListener('click', async () => {
  setMessage('', '');
  if (!currentSession) return;
  mfaSetupButton.disabled = true;
  try {
    // Remove leftovers from an abandoned setup so they don't pile up.
    const user = await supabaseClient.getUser(currentSession.access_token);
    for (const factor of (user.factors || [])) {
      if (factor.factor_type === 'totp' && factor.status !== 'verified') {
        await supabaseClient.unenrollFactor(currentSession.access_token, factor.id).catch(() => {});
      }
    }
    const enrollment = await supabaseClient.enrollTotp(currentSession.access_token);
    enrollingFactorId = enrollment.id;
    document.getElementById('mfaQr').src = enrollment.qrCodeUrl;
    document.getElementById('mfaSecret').textContent = enrollment.secret || '';
    mfaEnrollPanel.classList.remove('hidden');
    renderTwoStepCard();
    mfaEnrollCode.focus();
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    mfaSetupButton.disabled = false;
  }
});

mfaEnrollForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('', '');
  if (!enrollingFactorId || !currentSession) return;
  const verifyButton = document.getElementById('mfaEnrollVerifyButton');
  verifyButton.disabled = true;
  try {
    const code = readSixDigits(mfaEnrollCode);
    const factorId = enrollingFactorId;
    const upgraded = await supabaseClient.verifyTotp(currentSession.access_token, factorId, code);
    currentSession = { ...currentSession, ...upgraded };
    saveSessionForReload();
    if (liveUpdates && currentSession.access_token) liveUpdates.setToken(currentSession.access_token);
    currentCustomer.totpFactors = [{ id: factorId, factor_type: 'totp', status: 'verified' }];
    resetTwoStepEnrollment();
    renderTwoStepCard();
    setMessage('Two-step verification is on. Keep your authenticator app on your phone.', 'success');
  } catch (error) {
    mfaEnrollCode.value = '';
    setMessage(error.message, 'error');
  } finally {
    verifyButton.disabled = false;
  }
});

document.getElementById('mfaEnrollCancelButton').addEventListener('click', async () => {
  const factorId = enrollingFactorId;
  resetTwoStepEnrollment();
  renderTwoStepCard();
  if (factorId && currentSession) {
    await supabaseClient.unenrollFactor(currentSession.access_token, factorId).catch(() => {});
  }
});

mfaDisableButton.addEventListener('click', async () => {
  setMessage('', '');
  if (!currentSession || !currentCustomer || !currentCustomer.totpFactors.length) return;
  if (!window.confirm('Turn off two-step verification? Your account will only be protected by your sign-in and mobile number.')) return;
  mfaDisableButton.disabled = true;
  try {
    for (const factor of currentCustomer.totpFactors) {
      await supabaseClient.unenrollFactor(currentSession.access_token, factor.id);
    }
    currentCustomer.totpFactors = [];
    renderTwoStepCard();
    setMessage('Two-step verification is off.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    mfaDisableButton.disabled = false;
  }
});

// ---------- Location (OMECO service coverage, Occidental Mindoro) ----------
let coveragePromise = null;

function loadCoverage() {
  if (!coveragePromise) {
    coveragePromise = supabaseClient.getServiceAreas().catch((error) => {
      coveragePromise = null; // allow a retry next time
      throw error;
    });
  }
  return coveragePromise;
}

function fillOptions(select, placeholder, values) {
  select.replaceChildren(new Option(placeholder, ''), ...values.map((value) => new Option(value, value)));
}

// Municipality dropdown drives the barangay dropdown.
function createLocationPicker(municipalitySelect, barangaySelect) {
  let coverage = new Map();

  function showBarangays(municipality, selected) {
    const barangays = coverage.get(municipality) || [];
    fillOptions(barangaySelect, municipality ? 'Choose your barangay' : 'Choose a municipality first', barangays);
    barangaySelect.disabled = !municipality;
    if (selected && barangays.includes(selected)) barangaySelect.value = selected;
  }

  municipalitySelect.addEventListener('change', () => showBarangays(municipalitySelect.value));

  const ready = loadCoverage().then((loaded) => {
    coverage = loaded;
    fillOptions(municipalitySelect, 'Choose your municipality', [...coverage.keys()]);
  }).catch(() => {
    fillOptions(municipalitySelect, 'Could not load service areas. Check your connection.', []);
  });

  return {
    async setValue(municipality, barangay) {
      await ready;
      municipalitySelect.value = coverage.has(municipality) ? municipality : '';
      showBarangays(municipalitySelect.value, barangay);
    }
  };
}

const registerLocation = supabaseClient
  ? createLocationPicker(document.getElementById('registerMunicipality'), document.getElementById('registerBarangay'))
  : null;
const profileLocation = supabaseClient
  ? createLocationPicker(document.getElementById('profileMunicipality'), document.getElementById('profileBarangay'))
  : null;

function renderLocation() {
  const form = document.getElementById('locationForm');
  form.classList.toggle('hidden', Boolean(appConfig.demoMode) || !profileLocation);
  const { municipality, barangay } = currentCustomer || {};
  document.getElementById('profileLocation').textContent =
    municipality ? `${barangay}, ${municipality}` : 'Not set';
  document.getElementById('locationHint').textContent = municipality
    ? 'Moved? Update your municipality and barangay here.'
    : 'Please set your location. OMECO uses it for outage and maintenance notices in your area.';
  if (profileLocation) void profileLocation.setValue(municipality, barangay);
}

document.getElementById('locationForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('', '');
  if (!currentSession || !currentCustomer) return;
  const municipality = document.getElementById('profileMunicipality').value;
  const barangay = document.getElementById('profileBarangay').value;
  if (!municipality || !barangay) {
    setMessage('Choose your municipality and barangay.', 'error');
    return;
  }
  const button = document.getElementById('locationSaveButton');
  button.disabled = true;
  try {
    await supabaseClient.updateLocation({
      userId: currentSession.user.id,
      municipality,
      barangay,
      accessToken: currentSession.access_token
    });
    currentCustomer.municipality = municipality;
    currentCustomer.barangay = barangay;
    renderLocation();
    setMessage(`Location saved: ${barangay}, ${municipality}.`, 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

// ---------- Concerns ----------
const concernForm = document.getElementById('concernForm');
const concernDetails = document.getElementById('concernDetails');
const concernCounter = document.getElementById('concernCounter');
const CONCERN_MIN = 10;
let concerns = [];
let highlightTracking = '';

const CONCERN_STATUS = {
  submitted: { label: 'Submitted', badge: 'info' },
  under_review: { label: 'Under review', badge: 'warning' },
  in_progress: { label: 'In progress', badge: 'warning' },
  resolved: { label: 'Resolved', badge: 'approved' },
  closed: { label: 'Closed', badge: 'neutral' },
  rejected: { label: 'Not accepted', badge: 'danger' }
};

function formatConcernDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function renderConcerns() {
  const list = document.getElementById('concernList');
  if (!concerns.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'You have not submitted any concerns yet.';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...concerns.map((concern) => {
    const status = CONCERN_STATUS[String(concern.status || '').toLowerCase()] ||
      { label: concern.status || 'Submitted', badge: 'info' };
    const item = document.createElement('article');
    item.className = `concern-item${concern.tracking_number === highlightTracking ? ' new' : ''}`;

    const top = document.createElement('div');
    top.className = 'concern-top';
    const titleWrap = document.createElement('div');
    const type = document.createElement('span');
    type.className = 'concern-type';
    type.textContent = concern.complaint_type;
    const tracking = document.createElement('span');
    tracking.className = 'concern-tracking';
    tracking.textContent = `${concern.tracking_number} · ${formatConcernDate(concern.created_at)}`;
    titleWrap.append(type, tracking);
    const badge = document.createElement('span');
    badge.className = `badge ${status.badge}`;
    badge.textContent = status.label;
    top.append(titleWrap, badge);

    const text = document.createElement('p');
    text.className = 'concern-text';
    text.textContent = concern.description || '';

    item.append(top, text);
    if (window.OMECO_FEATURES) window.OMECO_FEATURES.decorateConcern(item, concern);
    return item;
  }));
}

async function loadConcerns() {
  if (appConfig.demoMode || !currentSession || !supabaseClient) {
    concerns = [];
    renderConcerns();
    return;
  }
  try {
    concerns = await supabaseClient.getConcerns({
      userId: currentSession.user.id,
      accessToken: currentSession.access_token
    }) || [];
    renderConcerns();
  } catch (error) {
    setMessage(`Could not load your concerns: ${error.message}`, 'error');
  }
}

function updateConcernCounter() {
  const length = concernDetails.value.trim().length;
  concernCounter.textContent = length < CONCERN_MIN
    ? `At least ${CONCERN_MIN} characters · ${length}/2000`
    : `${length}/2000`;
  concernCounter.classList.toggle('ok', length >= CONCERN_MIN);
}

concernDetails.addEventListener('input', updateConcernCounter);

concernForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('', '');
  if (appConfig.demoMode || !currentSession) {
    setMessage('Sign in with a real customer account to submit a concern.', 'error');
    return;
  }
  const description = concernDetails.value.trim();
  if (description.length < CONCERN_MIN) {
    setMessage(`Please describe the concern in at least ${CONCERN_MIN} characters.`, 'error');
    concernDetails.focus();
    return;
  }

  const button = document.getElementById('concernSubmitButton');
  button.disabled = true;
  button.textContent = 'Submitting…';
  try {
    const photoPaths = window.OMECO_FEATURES ? await window.OMECO_FEATURES.uploadConcernPhotos() : [];
    const saved = await supabaseClient.submitConcern({
      userId: currentSession.user.id,
      type: document.getElementById('concernType').value,
      description,
      photoPaths,
      municipality: currentCustomer && currentCustomer.municipality,
      barangay: currentCustomer && currentCustomer.barangay,
      accessToken: currentSession.access_token
    });
    concernForm.reset();
    if (window.OMECO_FEATURES) window.OMECO_FEATURES.clearConcernPhotos();
    updateConcernCounter();
    highlightTracking = saved ? saved.tracking_number : '';
    await loadConcerns();
    setMessage(saved
      ? `Concern submitted. Your tracking number is ${saved.tracking_number}.`
      : 'Concern submitted.', 'success');
  } catch (error) {
    setMessage(`Could not submit your concern: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Submit concern';
  }
});

registerForm.addEventListener('submit', handleRegistration);
verifyAccountForm.addEventListener('submit', handleAccountVerification);

document.getElementById('logoutButton').addEventListener('click', () => void logout());
document.getElementById('resetPasswordButton').addEventListener('click', async () => {
  const email = document.getElementById('resetEmail').value.trim();
  if (!email || appConfig.demoMode || !supabaseClient) {
    setMessage('Enter your registered email and configure Supabase to request a reset link.', 'error');
    return;
  }

  try {
    await supabaseClient.sendPasswordReset(email, appReturnUrl());
    setMessage('If this email has an account, we sent a reset link. Open it on this device to choose a new password.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const screenId = button.dataset.screen;
    if (!screenId) return;
    if (screenId === 'loginScreen' && currentCustomer) {
      void logout();
      return;
    }
    setScreen(screenId);
  });
});

async function logout() {
  // Always sign out locally, even if the server call fails (expired session,
  // no internet); the server session then simply expires on its own.
  // Unlink this phone first so the next person here gets no alerts meant for this customer.
  if (currentSession) await turnOffPhoneNotifications(currentSession.access_token);
  setPushPanel(false);
  try {
    if (currentSession && supabaseClient) {
      await supabaseClient.signOut(currentSession.access_token);
    }
  } catch (error) {
    console.warn('Server sign-out failed; signing out locally:', error.message);
  }

  currentSession = null;
  currentCustomer = null;
  stopAutoRefresh();
  stopLiveSession();
  loginForm.reset();
  concerns = [];
  highlightTracking = '';
  resetOtp();
  twoStepPending = null;
  resetTwoStepEnrollment();
  setMessage('', '');
  setScreen('loginScreen');
}

if (aiSendBtn) aiSendBtn.addEventListener('click', () => void handleAiSubmit());
if (aiInput) {
  aiInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleAiSubmit();
    }
  });
}

if (appConfig.demoMode) {
  const demoNote = document.getElementById('demoNote');
  demoNote.textContent = `Local demo only — ${demoAccount.email} / ${demoAccount.password}. Do not use for real accounts.`;
  demoNote.classList.remove('hidden');
  document.querySelectorAll('.avatar').forEach((avatar) => { avatar.textContent = 'DU'; });
}

// ---------------------------------------------------------------- Mobile app
// Lets the site work as an installable app, and drives the "Get the app" card.
(function setUpMobileApp() {
  const card = document.getElementById('getAppCard');
  const installButton = document.getElementById('installAppButton');
  const runningAsApp =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.startsWith('android-app://');
  if (runningAsApp && card) card.classList.add('hidden');

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // The app still works without offline support.
      });
    });
  }

  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.classList.remove('hidden');
  });

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      try {
        await installPrompt.userChoice;
      } finally {
        installPrompt = null;
        installButton.classList.add('hidden');
      }
    });
  }

  window.addEventListener('appinstalled', () => {
    if (installButton) installButton.classList.add('hidden');
  });

  if (window.OMECO_LIVE) {
    // The app needs the internet: block it with a notice while offline.
    window.OMECO_LIVE.requireOnline({
      appName: 'OMECOnnect',
      onBackOnline: () => {
        if (!currentSession) { void resumeSavedSession(); return; }
        void keepSessionFresh();
        void refreshCustomerData();
        void loadConcerns();
      }
    });
    // Pick up newly published versions of the app automatically.
    window.OMECO_LIVE.watchForNewVersion();
  }
})();

setScreen('loginScreen');
(async () => {
  const params = new URLSearchParams(window.location.search);
  const isRedirect = params.has('code') || params.has('error') || /access_token|error_description/.test(window.location.hash);
  if (isRedirect) {
    forgetSavedSession();
    await handleOAuthRedirect();
  } else {
    await resumeSavedSession();
  }
})();
