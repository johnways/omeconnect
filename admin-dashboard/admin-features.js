// OMECOnnect admin features (loaded after admin-ops.js; uses window.adminCtx):
//   - Staff roles: role chip, menu limited to the role, supervisor staff tools
//   - Outages by barangay with "Mark power restored"
//   - Meter readings review (with the customer's meter photo)
//   - Concern photos viewer, bill charge breakdown
//   - Management report KPIs
//   - Backups list / download / back up now (supervisors)
(function () {
  const cfg = window.OMECO_CONFIG || {};
  const BASE = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  const KEY = cfg.supabaseAnonKey || '';
  const ctx = () => window.adminCtx;
  const $ = (id) => document.getElementById(id);
  const el = (...args) => ctx().el(...args);
  const ROLE_LABEL = { supervisor: 'Supervisor', billing: 'Billing', service: 'Customer service', engineering: 'Engineering' };
  const ROLE_AREAS = { billing: ['bills', 'accounts', 'meter'], service: ['concerns', 'accounts', 'announcements'], engineering: ['concerns', 'announcements', 'meter'] };
  let role = null;
  const can = (area) => role === 'supervisor' || (ROLE_AREAS[role] || []).includes(area);

  async function api(path, { method = 'GET', body, raw } = {}) {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: { apikey: KEY, Authorization: `Bearer ${ctx().token()}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (raw) return response;
    const text = await response.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    if (!response.ok) throw new Error((data && (data.message || data.msg || data.error)) || `Request failed (${response.status}).`);
    return data;
  }
  const rpc = (name, args) => api(`/rest/v1/rpc/${name}`, { method: 'POST', body: args || {} });

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read the file.'));
      reader.readAsDataURL(blob);
    });
  }

  // ------------------------------------------------------------ role
  async function onSignIn() {
    try { role = await rpc('staff_role'); } catch { role = null; }
    const chip = $('roleChip');
    chip.textContent = ROLE_LABEL[role] || 'Staff';
    chip.classList.toggle('hidden', !role);
    document.querySelectorAll('.nav-item[data-area]').forEach((item) => item.classList.toggle('hidden', !can(item.dataset.area)));
    document.querySelectorAll('.supervisor-only').forEach((node) => node.classList.toggle('hidden', role !== 'supervisor'));
    const billForm = $('billForm');
    if (billForm) billForm.classList.toggle('hidden', !can('bills'));
    void updateMeterBadge();
  }

  // ------------------------------------------------------------ photos (concerns & meter)
  async function showPhotos(paths, title) {
    const box = el('div', { class: 'photo-grid' }, el('p', { class: 'muted' }, 'Loading photos…'));
    void ctx().openModal({ title, confirmText: 'Close', content: [box], onConfirm: async () => {} });
    const images = await Promise.all(paths.map(async (path) => {
      try {
        const response = await api(`/storage/v1/object/authenticated/customer-uploads/${path}`, { raw: true });
        if (!response.ok) throw new Error(String(response.status));
        return el('a', { href: '#', class: 'photo-link' }, el('img', { src: await blobToDataUrl(await response.blob()), alt: 'Photo from the customer' }));
      } catch {
        return el('p', { class: 'muted' }, 'A photo could not be loaded.');
      }
    }));
    images.forEach((node) => {
      const img = node.querySelector && node.querySelector('img');
      if (img) node.addEventListener('click', (event) => { event.preventDefault(); node.classList.toggle('zoomed'); });
    });
    box.replaceChildren(...images);
  }

  // ------------------------------------------------------------ outages by area
  function renderOutages(complaints) {
    const panel = $('outagePanel');
    const open = (complaints || []).filter((c) => c.complaint_type === 'Power interruptions'
      && !['resolved', 'closed', 'rejected'].includes(String(c.status || '').toLowerCase()));
    const groups = new Map();
    open.forEach((c) => {
      const municipality = c.municipality || (c.users && c.users.municipality) || '';
      const barangay = c.barangay || (c.users && c.users.barangay) || '';
      const key = `${municipality}|${barangay}`;
      if (!groups.has(key)) groups.set(key, { municipality, barangay, items: [] });
      groups.get(key).items.push(c);
    });
    panel.classList.toggle('hidden', !groups.size);
    if (!groups.size) return;
    const sorted = [...groups.values()].sort((a, b) => b.items.length - a.items.length);
    $('outageRows').replaceChildren(...sorted.map((g) => {
      const oldest = g.items.reduce((min, c) => (new Date(c.created_at) < new Date(min) ? c.created_at : min), g.items[0].created_at);
      const hours = Math.max(0, Math.round((Date.now() - new Date(oldest).getTime()) / 3600000));
      const button = el('button', { type: 'button', class: 'btn-sm primary' }, 'Mark power restored');
      button.disabled = !can('concerns') || !g.municipality;
      button.addEventListener('click', () => void markRestored(g));
      return el('div', { class: `outage-card${g.items.length >= 3 ? ' big' : ''}` },
        el('strong', {}, g.barangay ? `Brgy. ${g.barangay}` : 'Location not set'),
        el('span', { class: 'muted small' }, g.municipality || '—'),
        el('span', { class: 'outage-count' }, `${g.items.length} report${g.items.length === 1 ? '' : 's'} · since ${hours} h`),
        button);
    }));
  }

  async function markRestored(group) {
    const note = el('textarea', { rows: '2', maxlength: '300', placeholder: 'e.g. Power restored 3:40 PM after replacing a blown fuse.' });
    const announce = el('input', { type: 'checkbox' });
    announce.checked = true;
    const done = await ctx().openModal({
      title: `Power restored in Brgy. ${group.barangay}?`,
      confirmText: `Resolve ${group.items.length} report${group.items.length === 1 ? '' : 's'}`,
      content: [
        el('p', { class: 'modal-summary' }, `All ${group.items.length} open outage report(s) in Brgy. ${group.barangay}, ${group.municipality} will be marked resolved and each customer notified.`),
        ctx().field('Message to customers (optional)', note),
        el('label', { class: 'check' }, announce, ' Also post an advisory: "Power restored"')
      ],
      onConfirm: async () => {
        await rpc('resolve_area_outage', { p_municipality: group.municipality, p_barangay: group.barangay, p_note: note.value.trim() || null });
        if (announce.checked) {
          await window.OMECO_SUPABASE.insert('announcements', {
            title: `Power restored: Brgy. ${group.barangay}, ${group.municipality}`,
            content: note.value.trim() || `Power has been restored in Brgy. ${group.barangay}, ${group.municipality}. Thank you for your patience.`,
            category: 'Advisory', affected_area: group.municipality, is_urgent: false, is_published: true,
            published_at: new Date().toISOString()
          }, ctx().token());
        }
      }
    });
    if (done) {
      ctx().toast('Outage resolved. Customers have been notified.', 'success');
      await ctx().showComplaints();
    }
  }

  // ------------------------------------------------------------ bill breakdown
  function readCharges() {
    const charges = {};
    document.querySelectorAll('#chargeFields [data-charge]').forEach((input) => {
      if (input.value !== '' && !Number.isNaN(Number(input.value))) charges[input.dataset.charge] = Number(input.value);
    });
    return Object.keys(charges).length ? charges : null;
  }

  // ------------------------------------------------------------ meter readings
  const meterState = { rows: [], tab: 'submitted' };
  const METER_STATUS = { submitted: ['To check', 'pending'], accepted: ['Accepted', 'approved'], rejected: ['Not accepted', 'danger'] };

  async function updateMeterBadge(count) {
    let n = count;
    if (n === undefined) {
      if (!can('meter')) return;
      try {
        const rows = await api('/rest/v1/meter_readings?select=id&status=eq.submitted&limit=500');
        n = rows.length;
      } catch { return; }
    }
    $('navMeterBadge').textContent = String(n);
    $('navMeterBadge').classList.toggle('hidden', !n);
    $('meterPendingCount').textContent = String(n);
  }

  async function showMeter() {
    if (!ctx().live()) return;
    try {
      meterState.rows = await api('/rest/v1/meter_readings?select=id,reading_date,kwh_value,status,review_note,photo_path,meter_number,created_at,' +
        'customer_accounts(account_number,users(full_name))&order=created_at.desc&limit=300');
    } catch (error) {
      ctx().toast(`Could not load meter readings: ${error.message}`, 'error');
      return;
    }
    void updateMeterBadge(meterState.rows.filter((r) => r.status === 'submitted').length);
    renderMeter();
  }

  function renderMeter() {
    const rows = meterState.rows.filter((r) => !meterState.tab || r.status === meterState.tab);
    ctx().setRows('meterRows', 'meterEmpty', rows.map((r) => {
      const [label, kind] = METER_STATUS[r.status] || [r.status, 'info'];
      const account = r.customer_accounts || {};
      const actions = [];
      if (r.photo_path) {
        const photo = el('button', { type: 'button', class: 'btn-sm' }, 'View photo');
        photo.addEventListener('click', () => void showPhotos([r.photo_path], `Meter photo · ${account.account_number || ''}`));
        actions.push(photo);
      }
      if (r.status === 'submitted' && can('meter')) {
        const accept = el('button', { type: 'button', class: 'btn-sm primary' }, 'Accept');
        accept.addEventListener('click', () => void reviewMeter(r, true));
        const reject = el('button', { type: 'button', class: 'btn-sm' }, 'Return');
        reject.addEventListener('click', () => void reviewMeter(r, false));
        actions.push(accept, reject);
      }
      return el('tr', {},
        el('td', {}, el('strong', { class: 'mono' }, account.account_number || '—'),
          el('span', { class: 'cell-sub' }, (account.users && account.users.full_name) || '')),
        el('td', { class: 'mono' }, `${r.kwh_value} kWh`, r.meter_number ? el('span', { class: 'cell-sub' }, `Meter ${r.meter_number}`) : null),
        el('td', {}, ctx().fmtDate(r.reading_date, false)),
        el('td', {}, r.photo_path ? 'Yes' : '—'),
        el('td', {}, ctx().badge(label, kind), r.review_note ? el('span', { class: 'cell-sub' }, r.review_note) : null),
        el('td', {}, el('div', { class: 'row-actions' }, ...actions)));
    }), meterState.tab === 'submitted' ? 'No readings waiting. 🎉' : 'Nothing here.');
  }

  async function reviewMeter(reading, accept) {
    const note = el('textarea', { rows: '2', maxlength: '300', placeholder: accept ? 'Optional note' : 'Why? e.g. "Photo is blurry, please retake."' });
    const done = await ctx().openModal({
      title: accept ? 'Accept this reading?' : 'Return this reading?',
      confirmText: accept ? 'Accept' : 'Return to customer',
      danger: !accept,
      content: [el('p', { class: 'modal-summary' }, `${reading.kwh_value} kWh · ${ctx().fmtDate(reading.reading_date, false)}`), ctx().field('Message to the customer', note)],
      onConfirm: async () => {
        if (!accept && !note.value.trim()) throw new Error('Please tell the customer why.');
        await rpc('review_meter_reading', { p_reading_id: reading.id, p_accept: accept, p_note: note.value.trim() || null });
      }
    });
    if (done) {
      ctx().toast(accept ? 'Reading accepted. The customer was notified.' : 'Reading returned. The customer was notified.', 'success');
      await showMeter();
    }
  }

  $('meterTabs').addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (!tab) return;
    meterState.tab = tab.dataset.status;
    $('meterTabs').querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    renderMeter();
  });

  // ------------------------------------------------------------ reports (KPIs)
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  async function loadKpis() {
    if (!ctx().live()) return;
    let r;
    try { r = await rpc('admin_report_summary', { p_days: Number($('reportPeriod').value) || 30 }); } catch (error) {
      ctx().toast(`Could not load the summary: ${error.message}`, 'error');
      return;
    }
    const kpi = (label, value, note, tone = '') => el('div', { class: `rkpi ${tone}` }, el('span', {}, label), el('strong', {}, value), el('small', {}, note));
    $('reportKpis').replaceChildren(
      kpi('Concerns', String(r.concerns_total), `${r.concerns_resolved} resolved`),
      kpi('Resolved on time', pct(r.concerns_on_time, r.concerns_resolved), 'within the target time', r.concerns_resolved && r.concerns_on_time / r.concerns_resolved < 0.8 ? 'warn' : 'good'),
      kpi('Avg. time to resolve', r.avg_hours_to_resolve != null ? `${r.avg_hours_to_resolve} h` : '—', 'from report to resolved'),
      kpi('Customer rating', r.avg_rating != null ? `${r.avg_rating} ★` : '—', `${r.ratings} rating${r.ratings === 1 ? '' : 's'}`),
      kpi('Overdue now', String(r.concerns_open_overdue), 'open past target', r.concerns_open_overdue ? 'bad' : 'good'),
      kpi('Bills paid', pct(r.bills_paid, r.bills_issued), `${r.bills_paid} of ${r.bills_issued} bills`),
      kpi('Still unpaid', ctx().peso(r.outstanding_amount), `of ${ctx().peso(r.billed_amount)} billed`),
      kpi('New customers', String(r.new_customers), 'signed up in the app'),
      kpi('Waiting for staff', String((r.pending_verifications || 0) + (r.pending_meter_readings || 0)),
        `${r.pending_verifications} verifications · ${r.pending_meter_readings} readings`),
      kpi('App errors', String(r.app_errors), 'reported by phones', r.app_errors > 20 ? 'warn' : ''));
    const bars = (target, data, empty) => {
      const entries = Object.entries(data || {}).sort((a, b) => (target === 'reportSignupBars' ? a[0].localeCompare(b[0]) : b[1] - a[1]));
      const max = Math.max(1, ...entries.map(([, n]) => n));
      $(target).replaceChildren(...(entries.length ? entries.map(([k, n]) => el('div', { class: 'bar-row' },
        el('span', { class: 'bar-label' }, k), el('span', { class: 'bar-track' }, el('span', { class: 'bar-fill', style: `width:${Math.round((n / max) * 100)}%` })),
        el('span', { class: 'bar-value' }, String(n)))) : [el('p', { class: 'muted small' }, empty)]));
    };
    bars('reportAreaBars', r.by_area, 'No concerns in this period.');
    bars('reportSignupBars', r.signups_by_month, 'No sign-ups in the last 12 months.');
  }
  $('reportPeriod').addEventListener('change', () => void loadKpis());

  // ------------------------------------------------------------ staff (supervisor)
  function roleCell(a) {
    if (role !== 'supervisor' || a.user_id === ctx().myId()) return el('span', { class: `role-tag role-${a.role}` }, ROLE_LABEL[a.role] || a.role || '—');
    const select = el('select', { class: 'role-select', 'aria-label': 'Staff role' },
      ...Object.entries(ROLE_LABEL).map(([value, label]) => { const o = new Option(label, value); o.selected = value === a.role; return o; }));
    select.addEventListener('change', async () => {
      try {
        await rpc('set_staff_role', { p_user: a.user_id, p_role: select.value });
        ctx().toast(`Role changed to ${ROLE_LABEL[select.value]}.`, 'success');
      } catch (error) {
        select.value = a.role;
        ctx().toast(error.message, 'error');
      }
    });
    return select;
  }

  function staffActions(a) {
    if (role !== 'supervisor' || a.user_id === ctx().myId()) return '';
    const remove = el('button', { type: 'button', class: 'btn-sm' }, 'Remove');
    remove.addEventListener('click', async () => {
      const done = await ctx().openModal({
        title: 'Remove staff access?', confirmText: 'Remove access', danger: true,
        content: [el('p', { class: 'modal-summary' }, `${(a.users && (a.users.full_name || a.users.email)) || 'This person'} will no longer be able to open the admin console. Their concerns become unassigned.`)],
        onConfirm: () => rpc('remove_staff', { p_user: a.user_id })
      });
      if (done) { ctx().toast('Staff access removed.', 'success'); await ctx().showSecurity(); }
    });
    return remove;
  }

  $('addStaffButton').addEventListener('click', async () => {
    const email = el('input', { type: 'email', required: 'true', placeholder: 'name@example.com' });
    const select = el('select', {}, ...Object.entries(ROLE_LABEL).map(([v, l]) => new Option(l, v)));
    select.value = 'service';
    const department = el('input', { type: 'text', maxlength: '80', placeholder: 'e.g. Mamburao area office' });
    const employee = el('input', { type: 'text', maxlength: '40', placeholder: 'Optional' });
    const done = await ctx().openModal({
      title: 'Add staff member', confirmText: 'Add staff',
      content: [
        el('p', { class: 'modal-summary' }, 'The person must first create an OMECOnnect account with this email. On their next admin sign-in they must set up two-step verification.'),
        ctx().field('Email of their OMECOnnect account', email), ctx().field('Role', select),
        ctx().field('Department / office', department), ctx().field('Employee ID', employee)
      ],
      onConfirm: async () => {
        if (!email.value.trim()) throw new Error('Enter their email.');
        await rpc('add_staff_by_email', { p_email: email.value.trim(), p_role: select.value, p_department: department.value.trim() || null, p_employee_id: employee.value.trim() || null });
      }
    });
    if (done) { ctx().toast('Staff member added.', 'success'); await ctx().showSecurity(); }
  });

  // ------------------------------------------------------------ backups (supervisor)
  async function showBackups() {
    const panel = $('backupPanel');
    if (role !== 'supervisor') { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    try {
      const folders = await api('/storage/v1/object/list/backups', { method: 'POST', body: { prefix: '', limit: 100, sortBy: { column: 'name', order: 'desc' } } });
      const days = (folders || []).map((f) => f.name).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort().reverse();
      const files = await Promise.all(days.map(async (day) => {
        const items = await api('/storage/v1/object/list/backups', { method: 'POST', body: { prefix: `${day}/`, limit: 10 } });
        const file = (items || []).find((i) => i.id);
        return file ? { day, name: `${day}/${file.name}`, size: Number(file.metadata && file.metadata.size) || 0 } : null;
      }));
      ctx().setRows('backupRows', 'backupEmpty', files.filter(Boolean).map((f) => {
        const download = el('button', { type: 'button', class: 'btn-sm' }, 'Download');
        download.addEventListener('click', () => void downloadBackup(f));
        return el('tr', {}, el('td', {}, f.day), el('td', {}, `${(f.size / 1024).toFixed(1)} KB`), el('td', {}, el('div', { class: 'row-actions' }, download)));
      }), 'No backups yet. Press "Back up now".');
    } catch (error) {
      ctx().toast(`Could not list backups: ${error.message}`, 'error');
    }
  }

  async function downloadBackup(file) {
    try {
      const response = await api(`/storage/v1/object/authenticated/backups/${file.name}`, { raw: true });
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);
      const blob = await response.blob();
      const link = el('a', { href: URL.createObjectURL(blob), download: file.name.split('/').pop() });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    } catch (error) { ctx().toast(error.message, 'error'); }
  }

  $('backupNowButton').addEventListener('click', async () => {
    const button = $('backupNowButton');
    button.disabled = true;
    button.textContent = 'Backing up…';
    try {
      const result = await api('/functions/v1/nightly-backup', { method: 'POST', body: {} });
      ctx().toast(`Backup saved (${Math.round((result.bytes || 0) / 1024)} KB).`, 'success');
      await showBackups();
    } catch (error) {
      ctx().toast(`Backup failed: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Back up now';
    }
  });

  // ------------------------------------------------------------ electricity rate (₱ / kWh)
  const CLASS_LABEL = { residential: 'Residential', commercial: 'Commercial', industrial: 'Industrial', public_building: 'Public building' };
  const RATE_PART_LABEL = { generation: 'Generation', transmission: 'Transmission', system_loss: 'System loss', distribution: 'Distribution', supply: 'Supply & metering', universal: 'Universal charges', subsidies: 'Subsidies / lifeline', taxes: 'Taxes' };
  const peso4 = (v) => `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  const todayPH = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

  async function showRates() {
    const form = $('rateForm');
    form.classList.toggle('hidden', !can('bills'));
    if (!$('rateEffective').value) $('rateEffective').value = todayPH();
    if (!ctx().live()) return;
    try {
      const [current, history] = await Promise.all([
        rpc('get_current_rates'),
        api('/rest/v1/electricity_rates?select=customer_class,rate_per_kwh,fixed_charge,effective_from,note,created_at&order=effective_from.desc,created_at.desc&limit=30')
      ]);
      $('currentRates').replaceChildren(...(current && current.length ? current.map((r) => el('div', { class: 'rate-chip' },
        el('span', {}, CLASS_LABEL[r.customer_class] || r.customer_class),
        el('strong', {}, `${peso4(r.rate_per_kwh)} / kWh`),
        el('small', {}, `${Number(r.fixed_charge) ? `+ ${ctx().peso(r.fixed_charge)} monthly · ` : ''}since ${ctx().fmtDate(r.effective_from, false)}`)))
        : [el('p', { class: 'rate-missing' }, 'No rate set yet. Customers will see "rate not published" in the Bill estimator until you save one.')]));
      const today = todayPH();
      ctx().setRows('rateHistoryRows', 'rateHistoryEmpty', (history || []).map((r) => el('tr', {},
        el('td', {}, ctx().fmtDate(r.effective_from, false), r.effective_from > today ? el('span', { class: 'cell-sub' }, 'upcoming') : null),
        el('td', {}, CLASS_LABEL[r.customer_class] || r.customer_class),
        el('td', { class: 'mono' }, peso4(r.rate_per_kwh)),
        el('td', { class: 'mono' }, ctx().peso(r.fixed_charge)),
        el('td', {}, r.note || '—'),
        el('td', {}, ctx().fmtDate(r.created_at)))), 'No rates yet.');
    } catch (error) {
      ctx().toast(`Could not load rates: ${error.message}`, 'error');
    }
  }

  function readRateComponents() {
    const parts = {};
    document.querySelectorAll('#rateComponents [data-rate]').forEach((input) => {
      if (input.value !== '' && Number.isFinite(Number(input.value))) parts[input.dataset.rate] = Number(input.value);
    });
    return parts;
  }
  $('rateComponents').addEventListener('input', () => {
    const parts = readRateComponents();
    const sum = Object.values(parts).reduce((a, b) => a + b, 0);
    const rate = Number($('rateValue').value);
    $('rateComponentSum').textContent = Object.keys(parts).length
      ? `Breakdown total: ${peso4(sum)} per kWh${rate ? (Math.abs(sum - rate) < 0.0001 ? ' · matches the rate ✓' : ` · rate is ${peso4(rate)} (difference ${peso4(rate - sum)})`) : ''}`
      : '';
  });

  $('rateForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!ctx().needLive()) return;
    const rate = Number($('rateValue').value);
    if (!(rate > 0 && rate < 1000)) { ctx().toast('Enter the rate per kWh, e.g. 11.8523.', 'error'); return; }
    const parts = readRateComponents();
    const label = CLASS_LABEL[$('rateClass').value];
    const done = await ctx().openModal({
      title: 'Save new electricity rate?',
      confirmText: 'Save rate',
      content: [el('p', { class: 'modal-summary' },
        `${label}: ${peso4(rate)} per kWh`, el('br'),
        `Fixed monthly charge: ${ctx().peso(Number($('rateFixed').value) || 0)}`, el('br'),
        `Takes effect: ${ctx().fmtDate($('rateEffective').value, false)}`, el('br'),
        'Customers will see it in the Bill estimator from that date. Past bills are not changed.')],
      onConfirm: () => rpc('set_electricity_rate', {
        p_customer_class: $('rateClass').value, p_rate_per_kwh: rate, p_fixed_charge: Number($('rateFixed').value) || 0,
        p_components: Object.keys(parts).length ? parts : null, p_effective_from: $('rateEffective').value || null,
        p_note: $('rateNote').value.trim() || null
      })
    });
    if (done) {
      ctx().toast('Rate saved. Customers can now estimate their bill with it.', 'success');
      $('rateForm').reset();
      $('rateEffective').value = todayPH();
      $('rateComponentSum').textContent = '';
      await showRates();
    }
  });

  // ------------------------------------------------------------ wire into the console
  const views = ctx().views;
  const originalBills = views.billsView;
  views.billsView = async () => { await originalBills(); await showRates(); };
  views.meterView = showMeter;
  const originalReports = views.reportsView;
  views.reportsView = async () => { await originalReports(); await loadKpis(); };

  window.adminFeatures = {
    onSignIn, showPhotos, renderOutages, readCharges, roleCell, staffActions, showBackups, updateMeterBadge,
    get role() { return role; }
  };
})();
