// OMECOnnect customer features (loaded after script.js and uses its globals:
// currentSession, currentCustomer, appConfig, supabaseClient, setScreen,
// refreshCustomerData, loadConcerns, chooseAccount, formatCurrency, formatDate,
// escapeHtml, decodeWithImage, logout).
//   - Power status for the customer's barangay + one-tap "Report no power"
//   - Switch between several linked OMECO accounts
//   - Bill details: charge breakdown, comparison with last month, print / PDF
//   - Meter reading with photo
//   - Concern photos, update timeline and satisfaction rating
//   - Privacy: consent, download my data, delete my account
//   - Pay now (shown only when online payment is switched on)
(function () {
  const cfg = window.OMECO_CONFIG || {};
  const BASE = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  const KEY = cfg.supabaseAnonKey || '';
  const $ = (id) => document.getElementById(id);
  const signedIn = () => Boolean(currentSession && currentCustomer && !appConfig.demoMode && BASE);
  const token = () => currentSession.access_token;
  const uid = () => currentSession.user.id;

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    children.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) node.append(c); });
    return node;
  }

  async function api(path, { method = 'GET', body, headers, raw } = {}) {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${token()}`,
        ...(body !== undefined && !(body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body)
    });
    if (raw) return response;
    const text = await response.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    if (!response.ok) {
      const msg = (data && (data.message || data.msg || data.error_description || data.error)) || `Request failed (${response.status}).`;
      const error = new Error(msg);
      error.status = response.status;
      error.code = data && data.code;
      throw error;
    }
    return data;
  }
  const rpc = (name, args) => api(`/rest/v1/rpc/${name}`, { method: 'POST', body: args || {} });

  // ------------------------------------------------------------ photos
  async function shrinkPhoto(file, maxSide = 1280) {
    let image;
    try { image = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
      try { image = await decodeWithImage(file); } catch { throw new Error('This picture format is not supported. Please use a JPG or PNG photo.'); }
    }
    const w = image.naturalWidth || image.width;
    const h = image.naturalHeight || image.height;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const canvas = el('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (image.close) image.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error('Could not prepare the photo.');
    return { blob, preview: canvas.toDataURL('image/jpeg', 0.6) };
  }

  async function uploadPhoto(folder, blob) {
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const path = `${uid()}/${folder}/${name}`;
    await api(`/storage/v1/object/customer-uploads/${path}`, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
    return path;
  }

  const photoCache = new Map();
  async function photoUrl(path) {
    if (photoCache.has(path)) return photoCache.get(path);
    const response = await api(`/storage/v1/object/authenticated/customer-uploads/${path}`, { raw: true });
    if (!response.ok) throw new Error('Could not load the photo.');
    const blob = await response.blob();
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read the photo.'));
      reader.readAsDataURL(blob);
    });
    photoCache.set(path, url);
    return url;
  }

  function thumb(src, onRemove) {
    const img = el('img', { src, alt: '' });
    const box = el('span', { class: 'thumb' }, img);
    if (onRemove) box.append(el('button', { type: 'button', class: 'thumb-x', 'aria-label': 'Remove photo', onclick: onRemove }, '×'));
    return box;
  }

  function photoViewer(paths) {
    const row = el('div', { class: 'thumb-row' });
    paths.forEach((path) => {
      const box = el('button', { type: 'button', class: 'thumb loading', 'aria-label': 'Open photo' });
      row.append(box);
      photoUrl(path).then((src) => {
        box.classList.remove('loading');
        box.append(el('img', { src, alt: '' }));
        box.addEventListener('click', () => openSheet('Photo', [el('img', { class: 'sheet-photo', src, alt: 'Attached photo' })]));
      }).catch(() => { box.classList.remove('loading'); box.textContent = '!'; });
    });
    return row;
  }

  // ------------------------------------------------------------ bottom sheet
  function openSheet(title, content, { wide = false } = {}) {
    const close = () => {
      backdrop.classList.add('closing');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => backdrop.remove(), 180);
    };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    const sheet = el('div', { class: `sheet${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div', { class: 'sheet-head' }, el('h3', { text: title }),
        el('button', { type: 'button', class: 'sheet-close', 'aria-label': 'Close', onclick: close }, '×')),
      el('div', { class: 'sheet-body' }, content));
    const backdrop = el('div', { class: 'sheet-backdrop', onclick: (event) => { if (event.target === backdrop) close(); } }, sheet);
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey);
    setTimeout(() => { const first = sheet.querySelector('input, textarea, button:not(.sheet-close)'); if (first) first.focus(); }, 50);
    return { close, sheet };
  }

  // ------------------------------------------------------------ settings (payments / AI switches)
  let settings = null;
  async function loadSettings() {
    if (settings) return settings;
    try {
      const bearer = currentSession && currentSession.access_token ? currentSession.access_token : KEY;
      const rows = await fetch(`${BASE}/rest/v1/app_settings?select=key,value`, { headers: { apikey: KEY, Authorization: `Bearer ${bearer}` } }).then((r) => r.json());
      settings = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
    } catch { settings = {}; }
    return settings;
  }

  // ------------------------------------------------------------ account switcher
  function renderAccountSwitch() {
    const wrap = $('accountSwitchWrap');
    const select = $('accountSwitch');
    const accounts = (currentCustomer && currentCustomer.accounts) || [];
    wrap.classList.toggle('hidden', accounts.length < 2);
    if (accounts.length < 2) return;
    const current = currentCustomer.account && currentCustomer.account.id;
    select.replaceChildren(...accounts.map((a) => {
      const option = new Option(`${a.account_number}${a.service_area ? ` · ${a.service_area}` : ''}`, a.id);
      option.selected = a.id === current;
      return option;
    }));
  }
  $('accountSwitch').addEventListener('change', async (event) => {
    chooseAccount(event.target.value);
    event.target.disabled = true;
    try { await refreshCustomerData(); } finally { event.target.disabled = false; }
    loadMeterHistory();
  });

  // ------------------------------------------------------------ power status
  let powerLoadedAt = 0;
  let reportArmed = null;
  async function loadPowerStatus(force = false) {
    const card = $('powerCard');
    if (!signedIn()) { card.classList.add('hidden'); return; }
    if (!force && Date.now() - powerLoadedAt < 60000) return;
    powerLoadedAt = Date.now();
    let status;
    try { status = await rpc('get_power_status'); } catch (error) { console.warn('Power status:', error.message); return; }
    card.classList.remove('hidden');
    card.dataset.state = status.status;
    const place = status.barangay ? `Brgy. ${status.barangay}, ${status.municipality}` : '';
    $('powerArea').textContent = place || 'Location not set';
    const text = $('powerText');
    const report = $('reportOutageButton');
    report.classList.toggle('hidden', !status.barangay || Boolean(status.my_report));
    if (!status.barangay) {
      text.replaceChildren('Set your barangay in Profile to see outages in your area. ',
        el('button', { type: 'button', class: 'link-btn', onclick: () => setScreen('profileScreen') }, 'Set location'));
    } else if (status.my_report) {
      text.textContent = `You reported no power (${status.my_report}). We will notify you when it is restored.`;
    } else if (status.reports > 0) {
      text.textContent = `${status.reports} ${status.reports === 1 ? 'neighbor has' : 'neighbors have'} reported no power in the last 12 hours. OMECO is checking.`;
    } else if (status.status === 'advisory') {
      text.textContent = 'There is an OMECO advisory for your area.';
    } else {
      text.textContent = 'No outage reports in your barangay. Power should be normal.';
    }
    $('powerAdvisories').replaceChildren(...(status.advisories || []).slice(0, 2).map((a) =>
      el('div', { class: `power-adv${a.urgent ? ' urgent' : ''}` },
        el('strong', { text: a.title }), el('small', { text: `${a.category} · ${new Date(a.at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` }))));
  }

  $('reportOutageButton').addEventListener('click', async () => {
    const button = $('reportOutageButton');
    const note = $('powerNote');
    if (!signedIn()) return;
    if (!reportArmed) {
      button.textContent = 'Tap again to confirm';
      button.classList.add('armed');
      note.textContent = 'This sends an outage report for your barangay.';
      reportArmed = setTimeout(() => { reportArmed = null; button.textContent = 'Report no power'; button.classList.remove('armed'); note.textContent = ''; }, 5000);
      return;
    }
    clearTimeout(reportArmed);
    reportArmed = null;
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      const saved = await supabaseClient.submitConcern({
        userId: uid(),
        type: 'Power interruptions',
        description: `No power at my home in Brgy. ${currentCustomer.barangay}, ${currentCustomer.municipality}. Reported with one tap from the app.`,
        municipality: currentCustomer.municipality,
        barangay: currentCustomer.barangay,
        accessToken: token()
      });
      note.textContent = saved ? `Report sent. Tracking number ${saved.tracking_number}.` : 'Report sent.';
      await loadPowerStatus(true);
      if (typeof loadConcerns === 'function') void loadConcerns();
    } catch (error) {
      note.textContent = `Could not send: ${error.message}`;
    } finally {
      button.disabled = false;
      button.textContent = 'Report no power';
      button.classList.remove('armed');
    }
  });

  // ------------------------------------------------------------ bill details
  const CHARGE_LABELS = {
    generation: 'Generation charge', transmission: 'Transmission charge', system_loss: 'System loss charge',
    distribution: 'Distribution charge', supply: 'Supply & metering', subsidies: 'Subsidies / lifeline',
    universal: 'Universal charges', taxes: 'Taxes (VAT, local)', other_charges: 'Other charges'
  };

  function billCompare(bill, previous) {
    if (!previous || bill.consumption_kwh == null || previous.consumption_kwh == null || Number(previous.consumption_kwh) <= 0) return null;
    const now = Number(bill.consumption_kwh);
    const before = Number(previous.consumption_kwh);
    const diff = now - before;
    const pct = Math.round((diff / before) * 100);
    const month = String(previous.billing_month || '').split(' ')[0];
    if (pct === 0) return { kind: 'same', text: `Same usage as ${month} (${now} kWh).` };
    if (diff > 0) {
      return { kind: 'up', text: `You used ${Math.abs(pct)}% more electricity than ${month} (+${Math.round(diff)} kWh).`,
        tip: 'Hot months, aircon, electric fans running all day, a refrigerator with a worn door seal, or new appliances usually explain a higher bill.' };
    }
    return { kind: 'down', text: `You used ${Math.abs(pct)}% less electricity than ${month} (${Math.round(diff)} kWh). Nice!` };
  }

  function openBill(billId) {
    const bills = (currentCustomer && currentCustomer.bills) || [];
    const index = bills.findIndex((b) => String(b.id) === String(billId));
    if (index < 0) return;
    const bill = bills[index];
    const previous = bills[index + 1];
    const account = currentCustomer.account || {};
    const paid = String(bill.status || '').toLowerCase() === 'paid' || Number(bill.outstanding_balance) === 0;
    const rows = [
      ['Account', account.account_number || '—'],
      ['Billing month', bill.billing_month || '—'],
      ['Consumption', bill.consumption_kwh != null ? `${bill.consumption_kwh} kWh` : '—'],
      ['Total amount', formatCurrency(bill.total_amount)],
      ['Amount still due', formatCurrency(bill.outstanding_balance)],
      ['Due date', formatDate(bill.due_date)],
      ['Status', paid ? 'Paid' : 'Unpaid']
    ];
    const charges = bill.charges && typeof bill.charges === 'object' ? Object.entries(bill.charges).filter(([, v]) => v !== null && v !== '' && !Number.isNaN(Number(v))) : [];
    const compare = billCompare(bill, previous);
    const payBtn = el('button', { type: 'button', class: 'primary-btn pay-btn hidden', onclick: () => startPayment(bill) }, 'Pay now');
    loadSettings().then((s) => payBtn.classList.toggle('hidden', !(s.payments_enabled === true && !paid)));

    const content = [
      el('dl', { class: 'bill-dl' }, rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
      charges.length ? el('div', { class: 'bill-charges' },
        el('h4', { text: 'Where your money goes' }),
        el('table', {}, el('tbody', {}, charges.map(([k, v]) =>
          el('tr', {}, el('td', { text: CHARGE_LABELS[k] || k.replace(/_/g, ' ') }), el('td', { class: 'num', text: formatCurrency(v) })))))) : null,
      compare ? el('div', { class: `bill-compare ${compare.kind}` }, el('strong', { text: compare.text }), compare.tip ? el('p', { text: compare.tip }) : null) : null,
      el('div', { class: 'sheet-actions' }, payBtn,
        el('button', { type: 'button', class: 'primary-btn', onclick: () => openStatement(bill) }, 'View statement (receipt)'),
        el('button', { type: 'button', class: 'secondary-btn', onclick: () => printBill(bill, rows, charges) }, 'Print short summary'))
    ];
    openSheet(`${bill.billing_month || 'Bill'} details`, content);
  }

  // Online Statement of Account (looks like the printed OMECO bill).
  async function openStatement(bill) {
    if (!signedIn() || !window.OMECO_STATEMENT) return;
    const holder = el('div', { class: 'soa-viewer' }, el('p', { class: 'soa-loading', text: 'Loading your statement…' }));
    openSheet(`Statement · ${bill.billing_month || ''}`, [holder], { wide: true });
    try {
      const data = await rpc('get_statement', { p_bill_id: bill.id });
      const statement = window.OMECO_STATEMENT.render(data);
      const ref = data.bill && data.bill.payment_reference;
      const copy = el('button', { type: 'button', class: 'secondary-btn' }, 'Copy payment ref.');
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(ref); copy.textContent = 'Copied ✓'; } catch { copy.textContent = ref; }
        setTimeout(() => { copy.textContent = 'Copy payment ref.'; }, 2500);
      });
      copy.disabled = !ref;
      holder.replaceChildren(statement,
        el('div', { class: 'soa-actions' },
          el('button', { type: 'button', class: 'primary-btn', onclick: () => window.OMECO_STATEMENT.print(statement) }, 'Print / Save as PDF'),
          copy));
    } catch (error) {
      holder.replaceChildren(el('p', { class: 'soa-loading', text: `Could not load the statement: ${error.message}` }));
    }
  }

  function printBill(bill, rows, charges) {
    document.getElementById('printArea')?.remove();
    const area = el('div', { id: 'printArea', class: 'print-area' },
      el('h1', { text: 'OMECO – Electricity Bill Summary' }),
      el('p', { text: `Occidental Mindoro Electric Cooperative · Printed ${new Date().toLocaleString('en-PH')}` }),
      el('p', { text: `Customer: ${currentCustomer.fullName || ''}` }),
      el('table', {}, el('tbody', {}, rows.map(([k, v]) => el('tr', {}, el('th', { text: k }), el('td', { text: v }))))),
      charges.length ? el('h2', { text: 'Charge breakdown' }) : null,
      charges.length ? el('table', {}, el('tbody', {}, charges.map(([k, v]) => el('tr', {}, el('th', { text: CHARGE_LABELS[k] || k }), el('td', { text: formatCurrency(v) }))))) : null,
      el('p', { class: 'print-note', text: 'This summary is from the OMECOnnect app. The official bill from OMECO prevails in case of differences.' }));
    document.body.append(area);
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); area.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 60000);
  }

  $('billList').addEventListener('click', (event) => {
    const item = event.target.closest('[data-bill-id]');
    if (item && item.dataset.billId) openBill(item.dataset.billId);
  });
  $('billList').addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-bill-id]')) {
      event.preventDefault();
      openBill(event.target.dataset.billId);
    }
  });

  // ------------------------------------------------------------ payments
  async function startPayment(bill) {
    if (!signedIn()) return;
    const target = bill || ((currentCustomer.bills || []).find((b) => Number(b.outstanding_balance) > 0));
    if (!target) { setMessage('You have no unpaid bill.', 'success'); return; }
    try {
      const result = await api('/functions/v1/create-payment', { method: 'POST', body: { bill_id: target.id, return_url: location.href.split('#')[0] } });
      if (result && result.checkout_url && /^https:\/\//.test(result.checkout_url)) location.href = result.checkout_url;
      else throw new Error('The payment page did not open.');
    } catch (error) {
      setMessage(`Online payment is not available right now: ${error.message}`, 'error');
    }
  }
  $('payNowButton').addEventListener('click', () => void startPayment());

  async function refreshPayButton() {
    const s = await loadSettings();
    const owed = ((currentCustomer && currentCustomer.bills) || []).some((b) => Number(b.outstanding_balance) > 0);
    $('payNowButton').classList.toggle('hidden', !(signedIn() && s.payments_enabled === true && owed));
  }

  // ------------------------------------------------------------ meter reading
  let meterPhoto = null;
  function renderMeterCard() {
    const form = $('meterForm');
    form.classList.toggle('hidden', !(signedIn() && currentCustomer.account));
  }
  async function loadMeterHistory() {
    const box = $('meterHistory');
    if (!signedIn() || !currentCustomer.account) { box.replaceChildren(); return; }
    try {
      const rows = await api(`/rest/v1/meter_readings?customer_account_id=eq.${currentCustomer.account.id}&select=reading_date,kwh_value,status,review_note&order=created_at.desc&limit=5`);
      const label = { submitted: ['Checking', 'warning'], accepted: ['Accepted', 'approved'], rejected: ['Not accepted', 'danger'] };
      box.replaceChildren(...(rows.length ? [el('h4', { text: 'Your recent readings' })] : []), ...rows.map((r) => {
        const [text, kind] = label[r.status] || [r.status, 'info'];
        return el('div', { class: 'meter-row' },
          el('span', { text: `${formatDate(r.reading_date)} · ${r.kwh_value} kWh` }),
          el('span', { class: `badge ${kind}`, text }),
          r.review_note ? el('small', { text: r.review_note }) : null);
      }));
    } catch (error) { console.warn('Meter history:', error.message); }
  }
  $('meterPhoto').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      meterPhoto = await shrinkPhoto(file);
      $('meterPhotoPreview').replaceChildren(thumb(meterPhoto.preview, () => { meterPhoto = null; $('meterPhotoPreview').replaceChildren(); }));
    } catch (error) { showStatus('meterStatus', error.message, 'error'); }
  });
  $('meterForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!signedIn() || !currentCustomer.account) return;
    const value = Number($('meterValue').value);
    if (!$('meterValue').value || !(value >= 0)) { showStatus('meterStatus', 'Enter the number shown on your meter.', 'error'); return; }
    if (!meterPhoto) { showStatus('meterStatus', 'Please add a photo of your meter so staff can check it.', 'error'); return; }
    const button = $('meterSubmit');
    button.disabled = true;
    showStatus('meterStatus', 'Sending…');
    try {
      const photoPath = await uploadPhoto('meter', meterPhoto.blob);
      const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      await api('/rest/v1/meter_readings', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: { customer_account_id: currentCustomer.account.id, reading_date: today, kwh_value: value,
          meter_number: currentCustomer.account.meter_number || null, submitted_by: uid(), status: 'submitted', photo_path: photoPath }
      });
      $('meterForm').reset();
      meterPhoto = null;
      $('meterPhotoPreview').replaceChildren();
      showStatus('meterStatus', 'Reading sent. You will be notified when staff checks it.', 'success');
      void loadMeterHistory();
    } catch (error) {
      showStatus('meterStatus', error.code === '23505' ? 'You already sent a reading for this account today.' : `Could not send: ${error.message}`, 'error');
    } finally { button.disabled = false; }
  });

  function showStatus(id, text, kind) {
    const node = $(id);
    node.textContent = text;
    node.className = `photo-status ${kind || ''}`.trim();
    node.classList.toggle('hidden', !text);
  }

  // ------------------------------------------------------------ concerns: photos, timeline, rating
  let concernPhotos = [];
  function renderConcernPhotoPreview() {
    $('concernPhotoPreview').replaceChildren(...concernPhotos.map((p, i) =>
      thumb(p.preview, () => { concernPhotos.splice(i, 1); renderConcernPhotoPreview(); })));
  }
  $('concernPhotos').addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    for (const file of files) {
      if (concernPhotos.length >= 3) break;
      try { concernPhotos.push(await shrinkPhoto(file)); } catch (error) { setMessage(error.message, 'error'); }
    }
    renderConcernPhotoPreview();
  });

  const STATUS_LABEL = { submitted: 'Submitted', under_review: 'Under review', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed', rejected: 'Not accepted' };

  async function showTimeline(concern, box, button) {
    if (!box.classList.contains('hidden')) { box.classList.add('hidden'); button.textContent = 'View updates'; return; }
    button.textContent = 'Loading…';
    try {
      const rows = await api(`/rest/v1/complaint_status_history?complaint_id=eq.${concern.id}&select=new_status,note,updated_at&order=updated_at.asc`);
      const steps = [{ new_status: 'submitted', note: 'We received your concern.', updated_at: concern.created_at }, ...rows];
      box.replaceChildren(el('ol', { class: 'timeline' }, steps.map((s) =>
        el('li', { class: `tl-${s.new_status}` },
          el('strong', { text: STATUS_LABEL[s.new_status] || s.new_status }),
          el('small', { text: new Date(s.updated_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }),
          s.note ? el('p', { text: s.note }) : null))));
      box.classList.remove('hidden');
      button.textContent = 'Hide updates';
    } catch (error) {
      button.textContent = 'View updates';
      setMessage(`Could not load updates: ${error.message}`, 'error');
    }
  }

  function ratingBlock(concern) {
    const status = String(concern.status || '').toLowerCase();
    if (!['resolved', 'closed'].includes(status)) return null;
    if (concern.rated_at) {
      return el('p', { class: 'rated', text: `You rated this ${'★'.repeat(concern.rating || 0)}${'☆'.repeat(5 - (concern.rating || 0))} · Thank you!` });
    }
    let chosen = 0;
    const stars = el('div', { class: 'stars', role: 'radiogroup', 'aria-label': 'Rate our service' });
    const paint = () => stars.querySelectorAll('button').forEach((b, i) => {
      b.classList.toggle('on', i < chosen);
      b.setAttribute('aria-checked', String(i + 1 === chosen));
    });
    for (let i = 1; i <= 5; i += 1) {
      stars.append(el('button', { type: 'button', role: 'radio', 'aria-label': `${i} star${i > 1 ? 's' : ''}`, onclick: () => { chosen = i; paint(); send.disabled = false; } }, '★'));
    }
    const comment = el('input', { type: 'text', maxlength: '500', placeholder: 'Optional comment', class: 'rate-comment' });
    const send = el('button', { type: 'button', class: 'secondary-btn rate-send', disabled: true }, 'Send rating');
    const wrap = el('div', { class: 'rate-box' }, el('span', { class: 'rate-q', text: 'How did we do?' }), stars, comment, send);
    send.addEventListener('click', async () => {
      send.disabled = true;
      try {
        await rpc('rate_complaint', { p_tracking_number: concern.tracking_number, p_rating: chosen, p_comment: comment.value || null });
        concern.rated_at = new Date().toISOString();
        concern.rating = chosen;
        wrap.replaceWith(ratingBlock(concern));
      } catch (error) {
        send.disabled = false;
        setMessage(error.message, 'error');
      }
    });
    return wrap;
  }

  // ------------------------------------------------------------ notification details
  // Tapping a notification opens it in full: what it is about, when it came,
  // the whole message, and a shortcut to the bill / concern / advisory.
  const NOTE_KINDS = {
    billing: { label: 'Bill', tone: 'blue' },
    service: { label: 'OMECO advisory', tone: 'amber' },
    complaint: { label: 'Concern update', tone: 'green' },
    account: { label: 'Account', tone: 'violet' },
    test: { label: 'Test notification', tone: 'neutral' }
  };

  function fullDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });
  }

  function openNotification(note) {
    if (!note) return;
    const kind = NOTE_KINDS[note.type] || { label: 'Notification', tone: 'neutral' };
    const announcement = note.announcement_id && currentCustomer
      ? (currentCustomer.announcements || []).find((a) => String(a.id) === String(note.announcement_id))
      : null;

    let sheet = null;
    const goTo = (action) => () => { if (sheet) sheet.close(); setTimeout(action, 190); };
    const actions = [];
    if (note.bill_id && (currentCustomer.bills || []).some((b) => String(b.id) === String(note.bill_id))) {
      actions.push(el('button', { type: 'button', class: 'primary-btn', onclick: goTo(() => openBill(note.bill_id)) }, 'View bill details'));
    }
    if (note.type === 'complaint') {
      actions.push(el('button', { type: 'button', class: 'primary-btn', onclick: goTo(() => setScreen('complaintsScreen')) }, 'Open my concerns'));
    }
    if (note.type === 'service' || announcement) {
      actions.push(el('button', { type: 'button', class: 'secondary-btn', onclick: goTo(() => {
        const list = document.getElementById('announcementList');
        if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }) }, 'See all OMECO advisories'));
    }

    sheet = openSheet(kind.label, [
      el('div', { class: 'note-detail-meta' },
        el('span', { class: `note-kind ${kind.tone}`, text: kind.label }),
        announcement && announcement.is_urgent ? el('span', { class: 'note-kind red', text: 'Urgent' }) : null,
        announcement && announcement.category ? el('span', { class: 'note-kind neutral', text: announcement.category }) : null),
      el('h4', { class: 'note-detail-title', text: note.title || 'OMECOnnect' }),
      el('p', { class: 'note-detail-time', text: fullDateTime(note.created_at) }),
      el('p', { class: 'note-detail-message', text: note.message || '' }),
      actions.length ? el('div', { class: 'note-detail-actions' }, actions) : null
    ]);
    return sheet;
  }

  window.OMECO_FEATURES = {
    openNotification,
    onDashboard() {
      renderAccountSwitch();
      renderMeterCard();
      void loadPowerStatus(true);
      void refreshPayButton();
      void loadMeterHistory();
      void ensureConsent();
    },
    onRefresh() {
      renderAccountSwitch();
      renderMeterCard();
      void loadPowerStatus();
      void refreshPayButton();
    },
    decorateConcern(item, concern) {
      const status = String(concern.status || '').toLowerCase();
      const open = !['resolved', 'closed', 'rejected'].includes(status);
      if (open && concern.due_by) {
        item.append(el('p', { class: 'concern-target', text: `Target: done by ${new Date(concern.due_by).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` }));
      }
      if (concern.photo_paths && concern.photo_paths.length && signedIn()) item.append(photoViewer(concern.photo_paths));
      if (concern.id) {
        const box = el('div', { class: 'timeline-box hidden' });
        const button = el('button', { type: 'button', class: 'link-btn', text: 'View updates' });
        button.addEventListener('click', () => void showTimeline(concern, box, button));
        item.append(button, box);
      }
      const rating = ratingBlock(concern);
      if (rating) item.append(rating);
    },
    async uploadConcernPhotos() {
      if (!concernPhotos.length || !signedIn()) return [];
      const paths = [];
      for (const p of concernPhotos) paths.push(await uploadPhoto('concerns', p.blob));
      return paths;
    },
    clearConcernPhotos() {
      concernPhotos = [];
      renderConcernPhotoPreview();
    },
    async aiEnabled() {
      if (!signedIn()) return false;
      const s = await loadSettings();
      return s.ai_assistant_enabled === true;
    },
    async askAi(question) {
      const result = await api('/functions/v1/ai-assistant', { method: 'POST', body: { question } });
      if (!result || !result.answer) throw new Error('No answer.');
      return result.answer;
    },
    openSheet
  };

  // Back from the PayMongo payment page.
  (function paymentReturn() {
    const params = new URLSearchParams(location.search);
    const result = params.get('payment');
    if (!result) return;
    params.delete('payment');
    history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}${location.hash}`);
    setTimeout(() => {
      if (result === 'success') setMessage('Payment sent! Your bill will update in a moment and you will get a receipt notification.', 'success');
      else setMessage('Payment was cancelled. You were not charged.', 'error');
      if (typeof refreshCustomerData === 'function') setTimeout(() => void refreshCustomerData(), 4000);
    }, 1500);
  })();

  // ------------------------------------------------------------ privacy
  let consentAsked = false;
  async function ensureConsent() {
    if (!signedIn() || currentCustomer.privacyConsentAt || consentAsked) return;
    consentAsked = true;
    if (currentCustomer.signupConsent) {
      try { currentCustomer.privacyConsentAt = await rpc('accept_privacy_notice'); } catch { /* ask next time */ }
      return;
    }
    const agree = el('button', { type: 'button', class: 'primary-btn' }, 'I agree');
    const leave = el('button', { type: 'button', class: 'link-btn' }, 'No, sign me out');
    const sheet = openSheet('Privacy Notice', [
      el('p', { text: 'Before you continue: OMECO keeps your name, contact details, service location, OMECO account, bills, concerns, photos you send and app notifications to provide your electric service.' }),
      el('p', { text: 'Only you and authorized OMECO staff can see them. We never sell your data. You can download or delete your data anytime in Profile.' }),
      el('p', {}, 'Read the full ', el('a', { href: '/privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy Notice'), ' (Data Privacy Act of 2012, RA 10173).'),
      el('div', { class: 'sheet-actions' }, agree, leave)
    ]);
    agree.addEventListener('click', async () => {
      agree.disabled = true;
      try { currentCustomer.privacyConsentAt = await rpc('accept_privacy_notice'); sheet.close(); } catch (error) { agree.disabled = false; setMessage(error.message, 'error'); }
    });
    leave.addEventListener('click', () => { sheet.close(); void logout(); });
  }

  $('downloadDataButton').addEventListener('click', async () => {
    if (!signedIn()) return;
    showStatus('privacyStatus', 'Preparing your data…');
    try {
      const data = await rpc('export_my_data');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = el('a', { href: URL.createObjectURL(blob), download: `omeconnect-my-data-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      showStatus('privacyStatus', 'Downloaded. The file has everything OMECOnnect stores about you.', 'success');
    } catch (error) { showStatus('privacyStatus', `Could not prepare your data: ${error.message}`, 'error'); }
  });

  async function deleteMyFiles() {
    const remove = async (bucket, prefixes) => {
      if (!prefixes.length) return;
      await api(`/storage/v1/object/${bucket}`, { method: 'DELETE', body: { prefixes } }).catch(() => {});
    };
    const list = async (bucket, prefix) => {
      try {
        const rows = await api(`/storage/v1/object/list/${bucket}`, { method: 'POST', body: { prefix, limit: 1000 } });
        return (rows || []).filter((r) => r.id).map((r) => `${prefix}${r.name}`);
      } catch { return []; }
    };
    const me = uid();
    await remove('customer-uploads', [...await list('customer-uploads', `${me}/concerns/`), ...await list('customer-uploads', `${me}/meter/`)]);
    await remove('avatars', await list('avatars', `${me}/`));
  }

  $('deleteAccountButton').addEventListener('click', () => {
    if (!signedIn()) return;
    const input = el('input', { type: 'text', autocomplete: 'off', placeholder: 'Type DELETE', 'aria-label': 'Type DELETE to confirm' });
    const go = el('button', { type: 'button', class: 'danger-btn', disabled: true }, 'Delete my account');
    input.addEventListener('input', () => { go.disabled = input.value.trim().toUpperCase() !== 'DELETE'; });
    const status = el('p', { class: 'photo-status hidden' });
    const sheet = openSheet('Delete my account', [
      el('p', { text: 'This permanently deletes your OMECOnnect sign-in, profile, photos, notifications and chat history. It cannot be undone.' }),
      el('p', { text: 'Your OMECO electric service and official billing records are NOT affected; they stay with OMECO and are simply unlinked from the app. Your concerns are kept without your name.' }),
      el('label', {}, 'To confirm, type DELETE', input),
      el('div', { class: 'sheet-actions' }, go), status
    ]);
    go.addEventListener('click', async () => {
      go.disabled = true;
      status.textContent = 'Deleting…';
      status.className = 'photo-status';
      try {
        await deleteMyFiles();
        await rpc('delete_my_account', { p_confirm: 'DELETE' });
        sheet.close();
        try { await logout(); } catch { /* the sign-in no longer exists */ }
        setMessage('Your OMECOnnect account was deleted. Thank you for using OMECOnnect.', 'success');
      } catch (error) {
        status.textContent = `Could not delete: ${error.message}`;
        status.className = 'photo-status error';
        go.disabled = false;
      }
    });
  });
})();
