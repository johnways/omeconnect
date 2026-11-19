const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const loginMessage = document.getElementById('loginMessage');

const appConfig = window.OMECO_CONFIG || { demoMode: true, appName: 'OMECOnnect Admin' };
const supabaseClient = window.OMECO_SUPABASE;
const demoMode = Boolean(appConfig.demoMode) || !supabaseClient;

// Demo mode only (config.js demoMode: true). Never used with a real database.
const demoAdmin = { email: 'admin@omeco.test', password: 'admin123' };
const demoCustomers = [
  { full_name: 'Sample Customer A', mobile_number: '+639170000001', email: '', municipality: 'Mamburao', barangay: 'Poblacion 3', customer_accounts: [{ account_number: 'DEMO-0001', verification_status: 'verified' }] },
  { full_name: 'Sample Customer B', mobile_number: '+639170000002', email: '', municipality: 'Sablayan', barangay: 'Buenavista', customer_accounts: [] },
  { full_name: 'Sample Customer C', mobile_number: '+639170000003', email: '', municipality: 'San Jose', barangay: 'Barangay 5', customer_accounts: [{ account_number: 'DEMO-0003', verification_status: 'unverified' }] },
  { full_name: 'Sample Customer D', mobile_number: '+639170000004', email: '', municipality: null, barangay: null, customer_accounts: [] }
];

// Session lives in memory (no tokens in localStorage). admin-ops.js keeps only
// the refresh token in sessionStorage (this tab) so an update reload stays signed in.
let session = null;
let coverage = new Map();      // municipality -> [barangays] in OMECO order
let customers = [];
const filters = { municipality: '', barangay: '', status: '', search: '' };
const NO_LOCATION = '__none__';
const paging = { page: 1, size: 50, sig: '' }; // customer table pages

function setScreen(screenName) {
  loginScreen.classList.toggle('active', screenName === 'login');
  dashboardScreen.classList.toggle('active', screenName === 'dashboard');
}

function showLoginMessage(text) {
  loginMessage.textContent = text;
  loginMessage.classList.toggle('hidden', !text);
}

function setView(viewId) {
  document.querySelectorAll('.content.view').forEach((view) => view.classList.toggle('active', view.id === viewId));
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === viewId));
  if (viewId === 'customersView' && !customers.length) void loadCustomers();
  if (window.adminViews && window.adminViews[viewId]) void window.adminViews[viewId]();
}

// ---------------------------------------------------------------- Sign in / out
async function loginUser(email, password) {
  if (demoMode) {
    if (email === demoAdmin.email && password === demoAdmin.password) {
      session = { demo: true };
      return;
    }
    throw new Error('Invalid demo credentials.');
  }

  const result = await supabaseClient.signInWithPassword({ email, password });
  if (!result || !result.access_token) throw new Error('Sign-in did not return a session.');

  const isAdminAccount = await supabaseClient.isAdminAccount(result.access_token);
  if (isAdminAccount !== true) {
    await supabaseClient.signOut(result.access_token).catch(() => {});
    throw new Error('This account is not an OMECO administrator.');
  }

  // Staff must always pass an authenticator code (two-step verification).
  const user = await supabaseClient.getUser(result.access_token);
  const factors = (user && user.factors) || [];
  const verified = factors.find((f) => f.factor_type === 'totp' && f.status === 'verified');
  if (verified) {
    startMfaStep({ session: result, factorId: verified.id, enrolling: false });
    return false;
  }
  // First time: remove unfinished setups, then show a new QR code.
  for (const stale of factors.filter((f) => f.status !== 'verified')) {
    await supabaseClient.unenrollFactor(result.access_token, stale.id).catch(() => {});
  }
  const enrollment = await supabaseClient.enrollTotp(result.access_token);
  startMfaStep({ session: result, factorId: enrollment.id, enrolling: true, enrollment });
  return false;
}

// ---------------------------------------------------------------- Two-step step
let pendingMfa = null;
const mfaForm = document.getElementById('mfaForm');

function startMfaStep(pending) {
  pendingMfa = pending;
  loginForm.classList.add('hidden');
  mfaForm.classList.remove('hidden');
  document.getElementById('mfaEnroll').classList.toggle('hidden', !pending.enrolling);
  document.getElementById('mfaTitle').textContent = pending.enrolling
    ? 'Set up two-step verification' : 'Two-step verification';
  document.getElementById('mfaIntro').textContent = pending.enrolling
    ? 'Staff accounts must use an authenticator app. This is a one-time setup.'
    : 'Open your authenticator app and enter the 6-digit code for OMECOnnect Admin.';
  if (pending.enrolling) {
    document.getElementById('mfaQr').src = pending.enrollment.qrCodeUrl || '';
    document.getElementById('mfaSecret').textContent = pending.enrollment.secret || '';
  }
  document.getElementById('mfaButton').textContent = pending.enrolling ? 'Verify and finish setup' : 'Verify';
  const code = document.getElementById('mfaCode');
  code.value = '';
  setTimeout(() => code.focus(), 50);
}

function endMfaStep() {
  pendingMfa = null;
  mfaForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
  document.getElementById('mfaQr').removeAttribute('src');
  document.getElementById('mfaSecret').textContent = '';
}

mfaForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pendingMfa) return;
  showLoginMessage('');
  const code = document.getElementById('mfaCode').value.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) {
    showLoginMessage('Enter the 6-digit code from your authenticator app.');
    return;
  }
  const button = document.getElementById('mfaButton');
  button.disabled = true;
  try {
    const upgraded = await supabaseClient.verifyTotp(pendingMfa.session.access_token, pendingMfa.factorId, code);
    if (!upgraded || !upgraded.access_token) throw new Error('Verification did not return a session.');
    if ((await supabaseClient.isAdmin(upgraded.access_token)) !== true) {
      throw new Error('Two-step verification passed, but admin access was not granted. Contact your system administrator.');
    }
    session = upgraded;
    endMfaStep();
    loginForm.reset();
    enterDashboard();
  } catch (error) {
    const text = String(error.message || '');
    showLoginMessage(/invalid|expired|code/i.test(text) ? 'That code is wrong or expired. Wait for a new code and try again.' : text || 'Verification failed.');
  } finally {
    button.disabled = false;
  }
});

document.getElementById('mfaCancel').addEventListener('click', async () => {
  const pending = pendingMfa;
  endMfaStep();
  loginForm.reset();
  showLoginMessage('');
  if (pending) {
    if (pending.enrolling) await supabaseClient.unenrollFactor(pending.session.access_token, pending.factorId).catch(() => {});
    await supabaseClient.signOut(pending.session.access_token).catch(() => {});
  }
});

function enterDashboard() {
  setScreen('dashboard');
  if (window.adminOnSignIn) void window.adminOnSignIn();
  setView('overviewView');
}

async function logoutUser() {
  if (session && !session.demo && supabaseClient) {
    await supabaseClient.signOut(session.access_token).catch(() => {});
  }
  if (window.adminOnSignOut) window.adminOnSignOut();
  session = null;
  customers = [];
  loginForm.reset();
  setView('overviewView');
  setScreen('login');
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showLoginMessage('');
  const button = document.getElementById('loginButton');
  button.disabled = true;
  try {
    const done = await loginUser(document.getElementById('email').value.trim(), document.getElementById('password').value);
    document.getElementById('password').value = '';
    if (done !== false) enterDashboard();
  } catch (error) {
    showLoginMessage(error.message || 'Unable to sign in.');
  } finally {
    button.disabled = false;
  }
});

logoutBtn.addEventListener('click', () => void logoutUser());

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', (event) => {
    event.preventDefault();
    if (item.dataset.view) setView(item.dataset.view);
  });
});

// ---------------------------------------------------------------- Customers by location
// Account numbers customers asked to link and staff have not reviewed yet
// (filled by admin-ops.js from account_verification_requests).
window.pendingRequestsByUser = new Map();

function accountStatus(customer) {
  const accounts = customer.customer_accounts || [];
  const verified = accounts.find((account) => account.verification_status === 'verified');
  if (verified) return { key: 'verified', label: 'Verified', account: verified.account_number };
  const pendingRequest = window.pendingRequestsByUser.get(customer.id);
  if (pendingRequest) return { key: 'pending', label: 'Pending', account: pendingRequest };
  if (accounts.length) return { key: 'pending', label: 'Pending', account: accounts[0].account_number };
  return { key: 'none', label: 'Not linked', account: '' };
}

function matchesFilters(customer, ignore = {}) {
  if (!ignore.municipality && filters.municipality) {
    if (filters.municipality === NO_LOCATION ? customer.municipality : customer.municipality !== filters.municipality) return false;
  }
  if (!ignore.barangay && filters.barangay && customer.barangay !== filters.barangay) return false;
  if (filters.status && accountStatus(customer).key !== filters.status) return false;
  if (filters.search) {
    const haystack = [customer.full_name, customer.mobile_number, customer.email, accountStatus(customer).account]
      .filter(Boolean).join(' ').toLowerCase();
    if (!haystack.includes(filters.search)) return false;
  }
  return true;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value);
  });
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
}

function chip(label, count, active, onClick, extraClass = '') {
  const button = el('button', { type: 'button', class: `chip${active ? ' active' : ''}${count ? '' : ' empty'} ${extraClass}`.trim() },
    label, el('span', { class: 'count' }, String(count)));
  button.addEventListener('click', onClick);
  return button;
}

function fillSelect(select, placeholder, values, selected) {
  select.replaceChildren(new Option(placeholder, ''), ...values.map(([value, label]) => new Option(label, value)));
  select.value = selected || '';
}

function setMunicipality(municipality) {
  filters.municipality = municipality;
  filters.barangay = '';
  renderCustomers();
}

function setBarangay(barangay) {
  filters.barangay = barangay;
  renderCustomers();
}

function renderCustomers() {
  // Counts per municipality respect the status/search filters but not the location ones.
  const base = customers.filter((customer) => matchesFilters(customer, { municipality: true, barangay: true }));
  const countBy = (key) => base.reduce((map, customer) => map.set(customer[key], (map.get(customer[key]) || 0) + 1), new Map());
  const perMunicipality = countBy('municipality');
  const noLocation = base.filter((customer) => !customer.municipality).length;

  // Service-area cards: one per municipality, with a bar relative to the busiest area.
  const maxCount = Math.max(1, noLocation, ...perMunicipality.values());
  const areaCard = (label, count, meta, active, onClick, extraClass = '') => {
    const button = el('button', {
      type: 'button',
      class: `area-card${active ? ' active' : ''}${count ? '' : ' empty'} ${extraClass}`.trim(),
      'aria-pressed': String(active)
    },
    el('span', { class: 'area-top' }, el('span', { class: 'area-name' }, label), el('span', { class: 'area-count' }, String(count))),
    el('span', { class: 'area-meta' }, meta),
    el('span', { class: 'area-bar' }, el('span', { style: `width:${Math.round((count / maxCount) * 100)}%` })));
    button.addEventListener('click', onClick);
    return button;
  };
  document.getElementById('municipalityChips').replaceChildren(
    areaCard('All areas', base.length, `${coverage.size} municipalities`, !filters.municipality, () => setMunicipality(''), 'all'),
    ...[...coverage.keys()].map((municipality) =>
      areaCard(municipality, perMunicipality.get(municipality) || 0, `${coverage.get(municipality).length} barangays`,
        filters.municipality === municipality, () => setMunicipality(municipality))),
    areaCard('No location', noLocation, 'not set yet', filters.municipality === NO_LOCATION, () => setMunicipality(NO_LOCATION), 'unset')
  );

  // Summary numbers (all consumers, ignoring filters).
  const statusCount = (key) => customers.filter((customer) => accountStatus(customer).key === key).length;
  document.getElementById('kpiTotal').textContent = customers.length;
  document.getElementById('kpiVerified').textContent = statusCount('verified');
  document.getElementById('kpiPending').textContent = statusCount('pending');
  document.getElementById('kpiNoLocation').textContent = customers.filter((customer) => !customer.municipality).length;

  const barangaySection = document.getElementById('barangaySection');
  const realMunicipality = filters.municipality && filters.municipality !== NO_LOCATION ? filters.municipality : '';
  barangaySection.classList.toggle('hidden', !realMunicipality);
  if (realMunicipality) {
    const inMunicipality = base.filter((customer) => customer.municipality === realMunicipality);
    const perBarangay = inMunicipality.reduce((map, customer) => map.set(customer.barangay, (map.get(customer.barangay) || 0) + 1), new Map());
    document.getElementById('barangaySectionTitle').textContent = realMunicipality;
    document.getElementById('barangayChips').replaceChildren(
      chip('All barangays', inMunicipality.length, !filters.barangay, () => setBarangay('')),
      ...(coverage.get(realMunicipality) || []).map((barangay) =>
        chip(barangay, perBarangay.get(barangay) || 0, filters.barangay === barangay, () => setBarangay(barangay)))
    );
  }

  fillSelect(document.getElementById('filterMunicipality'), 'All municipalities',
    [...[...coverage.keys()].map((m) => [m, m]), [NO_LOCATION, 'No location set']], filters.municipality);
  const barangaySelect = document.getElementById('filterBarangay');
  fillSelect(barangaySelect, 'All barangays', (coverage.get(realMunicipality) || []).map((b) => [b, b]), filters.barangay);
  barangaySelect.disabled = !realMunicipality;

  const rows = customers.filter((customer) => matchesFilters(customer));
  // Page through long lists; any filter change goes back to page 1.
  const sig = JSON.stringify(filters);
  if (sig !== paging.sig) { paging.sig = sig; paging.page = 1; }
  const pageCount = Math.max(1, Math.ceil(rows.length / paging.size));
  paging.page = Math.min(Math.max(1, paging.page), pageCount);
  const firstIndex = (paging.page - 1) * paging.size;
  const pageRows = rows.slice(firstIndex, firstIndex + paging.size);
  const pinIcon = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>';
    return svg;
  };
  const initialsOf = (name) => (name || '?').split(/\s+/).filter((part) => /^[A-Za-zÀ-ÿ]/.test(part))
    .map((part) => part[0].toUpperCase()).slice(0, 2).join('') || '?';
  document.getElementById('customerRows').replaceChildren(...pageRows.map((customer) => {
    const status = accountStatus(customer);
    const badgeClass = { verified: 'approved', pending: 'pending', none: 'none' }[status.key];
    const location = customer.municipality
      ? el('div', { class: 'location' }, pinIcon(),
        el('div', {}, el('span', { class: 'location-barangay' }, customer.barangay),
          el('span', { class: 'location-municipality' }, customer.municipality)))
      : el('span', { class: 'not-set' }, 'Location not set');
    return el('tr', {},
      el('td', {}, el('div', { class: 'person' },
        el('span', { class: 'avatar', 'aria-hidden': 'true' }, initialsOf(customer.full_name)),
        el('div', {}, el('div', { class: 'person-name' }, customer.full_name || '—'),
          customer.email ? el('div', { class: 'person-email' }, customer.email) : null))),
      el('td', { class: 'mono' }, customer.mobile_number || '—'),
      el('td', {}, location),
      el('td', { class: 'mono' }, status.account || '—'),
      el('td', {}, el('span', { class: `badge ${badgeClass}` }, status.label))
    );
  }));

  const place = [filters.barangay, realMunicipality].filter(Boolean).join(', ');
  const where = filters.municipality === NO_LOCATION ? 'with no location set'
    : place ? `in ${place}` : 'in all service areas';
  document.getElementById('customerSummary').textContent =
    `Showing ${rows.length} of ${customers.length} consumer${customers.length === 1 ? '' : 's'} ${where}`;
  document.getElementById('customersEmptyText').textContent = customers.length
    ? 'No consumers match these filters.'
    : 'No customers have registered yet. They will appear here after signing up in the OMECOnnect app.';
  document.getElementById('customersEmpty').classList.toggle('hidden', rows.length > 0);

  const pager = document.getElementById('customerPager');
  pager.classList.toggle('hidden', rows.length <= 25);
  document.getElementById('customerPageInfo').textContent = rows.length
    ? `Rows ${firstIndex + 1}–${firstIndex + pageRows.length} of ${rows.length} · page ${paging.page} of ${pageCount}`
    : '';
  document.getElementById('customerPrev').disabled = paging.page <= 1;
  document.getElementById('customerNext').disabled = paging.page >= pageCount;
}

function goToCustomerPage(delta) {
  paging.page += delta;
  renderCustomers();
  document.getElementById('customerRows').closest('.table-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
document.getElementById('customerPrev').addEventListener('click', () => goToCustomerPage(-1));
document.getElementById('customerNext').addEventListener('click', () => goToCustomerPage(1));
document.getElementById('customerPageSize').addEventListener('change', (event) => {
  paging.size = Number(event.target.value) || 50;
  paging.page = 1;
  renderCustomers();
});

async function loadCustomers() {
  const summary = document.getElementById('customerSummary');
  summary.textContent = 'Loading…';
  try {
    if (demoMode) {
      coverage = new Map([
        ['Mamburao', ['Poblacion 3']], ['Sablayan', ['Buenavista']], ['San Jose', ['Barangay 5']]
      ]);
      customers = demoCustomers;
    } else {
      [coverage, customers] = await Promise.all([
        supabaseClient.getServiceAreas(),
        supabaseClient.getCustomers(session.access_token)
      ]);
    }
    renderCustomers();
  } catch (error) {
    summary.textContent = `Could not load customers: ${error.message}`;
  }
}

document.getElementById('filterMunicipality').addEventListener('change', (event) => setMunicipality(event.target.value));
document.getElementById('filterBarangay').addEventListener('change', (event) => setBarangay(event.target.value));
document.getElementById('filterStatus').addEventListener('change', (event) => {
  filters.status = event.target.value;
  renderCustomers();
});
document.getElementById('filterSearch').addEventListener('input', (event) => {
  filters.search = event.target.value.trim().toLowerCase();
  renderCustomers();
});
document.getElementById('refreshCustomers').addEventListener('click', () => void loadCustomers());

document.getElementById('exportCustomers').addEventListener('click', () => {
  const rows = customers.filter((customer) => matchesFilters(customer));
  const csvCell = (value) => {
    const text = String(value ?? '');
    // Quote every cell; neutralise spreadsheet formulas.
    return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
  };
  const lines = [['Name', 'Mobile', 'Email', 'Barangay', 'Municipality', 'OMECO account', 'Status']]
    .concat(rows.map((customer) => {
      const status = accountStatus(customer);
      return [customer.full_name, customer.mobile_number, customer.email, customer.barangay, customer.municipality, status.account, status.label];
    }))
    .map((line) => line.map(csvCell).join(','));
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const link = el('a', { href: URL.createObjectURL(blob), download: 'omeco-consumers-by-location.csv' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

// ---------------------------------------------------------------- Start
document.getElementById('demoNote').classList.toggle('hidden', !demoMode);
setScreen('login');
