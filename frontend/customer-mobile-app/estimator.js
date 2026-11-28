// OMECOnnect bill estimator ("meter converter").
// Converts meter readings or kWh into an expected bill and
// multiplies by the rate OMECO staff set in the admin console
// (electricity_rates, read with get_current_rates()).
// Submeters: the owner of the main meter can add submeters (name + readings).
// The bill is divided by kWh (OMECO_BILLING.splitBill) and the owner can mark
// who has paid. Saved on this phone only (localStorage).
// Uses script.js globals: currentSession, currentCustomer, formatCurrency.
(function () {
  const cfg = window.OMECO_CONFIG || {};
  const BASE = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  const KEY = cfg.supabaseAnonKey || '';
  const $ = (id) => document.getElementById(id);
  const STORE = 'omeconnect.estimator';
  const CLASS_LABEL = { residential: 'Residential', commercial: 'Commercial', industrial: 'Industrial', public_building: 'Public building' };
  const PART_LABEL = {
    generation: 'Generation', transmission: 'Transmission', system_loss: 'System loss', distribution: 'Distribution',
    supply: 'Supply & metering', universal: 'Universal charges', subsidies: 'Subsidies / lifeline', taxes: 'Taxes'
  };
  let rates = [];
  let ratesAt = 0;
  let mode = 'meter';
  let subs = []; // { id, name, prev, curr, paid }
  const MAX_SUBS = 12;

  // -------------------------------------------------- saved inputs (this phone only)
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        mode, prev: $('estPrev').value, curr: $('estCurr').value, kwh: $('estKwh').value,
        cls: $('estClass').value, subs
      }));
    } catch { /* private mode: fine */ }
  }
  function restore() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { data = null; }
    if (!data) return;
    $('estPrev').value = data.prev || '';
    $('estCurr').value = data.curr || '';
    subs = (Array.isArray(data.subs) ? data.subs : []).slice(0, MAX_SUBS).map((x, i) => ({
      id: String(x.id || `s${Date.now()}${i}`),
      name: String(x.name || '').slice(0, 40),
      prev: x.prev === undefined || x.prev === null ? '' : String(x.prev),
      curr: x.curr === undefined || x.curr === null ? '' : String(x.curr),
      paid: Boolean(x.paid)
    }));
    $('estKwh').value = data.kwh || '';
    // Only Meter reading and kWh remain (any other saved choice opens Meter reading).
    if (data.mode === 'meter' || data.mode === 'kwh') setMode(data.mode, false);
    $('estClass').dataset.saved = data.cls || '';
  }

  // -------------------------------------------------- rates set by OMECO
  async function loadRates(force = false) {
    if (!BASE || (!force && Date.now() - ratesAt < 5 * 60000)) return;
    const token = typeof currentSession !== 'undefined' && currentSession && currentSession.access_token;
    const headers = { apikey: KEY, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${KEY}`;
    try {
      const response = await fetch(`${BASE}/rest/v1/rpc/get_current_rates`, { method: 'POST', headers, body: '{}' });
      if (!response.ok) throw new Error(String(response.status));
      rates = (await response.json()) || [];
      ratesAt = Date.now();
    } catch (error) {
      console.warn('Could not load rates:', error.message);
    }
    renderRateSelect();
    calculate();
  }

  function renderRateSelect() {
    const select = $('estClass');
    const wanted = select.value || select.dataset.saved || 'residential';
    select.replaceChildren(...rates.map((r) => new Option(CLASS_LABEL[r.customer_class] || r.customer_class, r.customer_class)));
    if (rates.some((r) => r.customer_class === wanted)) select.value = wanted;
    $('estClassWrap').classList.toggle('hidden', rates.length < 2);
  }

  const currentRate = () => rates.find((r) => r.customer_class === $('estClass').value) || rates.find((r) => r.customer_class === 'residential') || rates[0] || null;
  const peso = (v) => (typeof formatCurrency === 'function' ? formatCurrency(v)
    : `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const num = (v) => Number(v).toLocaleString('en-PH', { maximumFractionDigits: 2 });
  const kwhText = (v) => `${num(v)} kWh`;
  const rateText = (v) => `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

  // -------------------------------------------------- modes
  function setMode(next, store = true) {
    mode = next;
    document.querySelectorAll('.est-tab').forEach((tab) => {
      const on = tab.dataset.mode === next;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('.est-mode').forEach((section) => section.classList.toggle('hidden', section.dataset.mode !== next));
    calculate();
    if (store) save();
  }

  // -------------------------------------------------- the calculation
  function usedKwh() {
    if (mode === 'meter') {
      const prev = $('estPrev').value;
      const curr = $('estCurr').value;
      if (prev === '' || curr === '') return { kwh: null, note: 'Enter both meter readings.' };
      const diff = Number(curr) - Number(prev);
      if (diff < 0) return { kwh: null, note: 'The current reading is lower than the previous one. Please check the numbers.' };
      return { kwh: diff, note: `${num(curr)} − ${num(prev)}` };
    }
    const v = $('estKwh').value;
    return v === '' ? { kwh: null, note: 'Enter the kWh you used.' } : { kwh: Math.max(0, Number(v)), note: '' };
  }

  function row(label, value, strong = false) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (strong) { dt.className = 'total'; dd.className = 'total'; }
    return [dt, dd];
  }

  function calculate() {
    const rate = currentRate();
    $('estRateValue').textContent = rate ? `${rateText(rate.rate_per_kwh)} per kWh` : 'Not published yet';
    $('estRateMeta').textContent = rate
      ? `${CLASS_LABEL[rate.customer_class] || rate.customer_class} · since ${new Date(`${rate.effective_from}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}${Number(rate.fixed_charge) ? ` · + ${peso(rate.fixed_charge)} monthly charge` : ''}`
      : (ratesAt ? 'OMECO has not published a rate in the app yet. Please check again later.' : 'Loading the current rate…');

    const { kwh, note } = usedKwh();
    const breakdown = $('estBreakdown');
    const compare = $('estCompare');
    if (kwh === null || !rate) {
      $('estTotal').textContent = '—';
      $('estKwhUsed').textContent = kwh === null ? note : `${kwh.toFixed(1)} kWh · waiting for OMECO's rate`;
      breakdown.replaceChildren();
      compare.classList.add('hidden');
      renderMainUsed();
      renderSplit(null, null);
      return;
    }
    renderMainUsed();
    $('estKwhUsed').textContent = `${kwh.toLocaleString('en-PH', { maximumFractionDigits: 1 })} kWh used${note ? ` (${note})` : ''}`;

    // Full statement schedule (same math as the database's compute_bill()).
    if (Array.isArray(rate.schedule) && rate.schedule.length) {
      const { total: sTotal, groups } = window.OMECO_BILLING.scheduleBreakdown(rate.schedule, kwh);
      $('estTotal').textContent = peso(sTotal);
      const groupRows = [];
      groups.forEach((amount, group) => groupRows.push(...row(group.charAt(0) + group.slice(1).toLowerCase(), peso(amount))));
      groupRows.push(...row('Estimated total', peso(sTotal), true));
      if (Number(rate.surcharge_percent)) groupRows.push(...row(`If paid late (+${Number(rate.surcharge_percent)}%)`, peso(Math.round(sTotal * (1 + Number(rate.surcharge_percent) / 100) * 100) / 100)));
      breakdown.replaceChildren(...groupRows);
      showCompare(kwh);
      renderSplit(sTotal, kwh);
      return;
    }

    const energy = kwh * Number(rate.rate_per_kwh);
    const fixed = Number(rate.fixed_charge) || 0;
    const total = Math.round((energy + fixed) * 100) / 100;
    $('estTotal').textContent = peso(total);

    const rows = [];
    const parts = rate.components && typeof rate.components === 'object' ? Object.entries(rate.components) : [];
    if (parts.length) {
      let partsSum = 0;
      parts.forEach(([key, perKwh]) => {
        partsSum += Number(perKwh);
        rows.push(...row(`${PART_LABEL[key] || key} (${rateText(perKwh)}/kWh)`, peso(kwh * Number(perKwh))));
      });
      const rest = Number(rate.rate_per_kwh) - partsSum;
      if (Math.abs(rest) >= 0.0001) rows.push(...row(`Other charges (${rateText(rest)}/kWh)`, peso(kwh * rest)));
    } else {
      rows.push(...row(`Energy: ${kwh.toFixed(1)} kWh × ${rateText(rate.rate_per_kwh)}`, peso(energy)));
    }
    if (fixed) rows.push(...row('Fixed monthly charge', peso(fixed)));
    rows.push(...row('Estimated total', peso(total), true));
    breakdown.replaceChildren(...rows);
    showCompare(kwh);
    renderSplit(total, kwh);
  }

  // -------------------------------------------------- submeters
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'value') node.value = v;
      else if (k === 'checked') node.checked = Boolean(v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    children.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) node.append(c); });
    return node;
  }

  const subName = (s, i) => (s.name || '').trim() || `Submeter ${i + 1}`;
  // kWh of one submeter: null = readings missing, NaN = current lower than previous.
  function subKwh(s) {
    if (s.prev === '' || s.curr === '') return null;
    const diff = Number(s.curr) - Number(s.prev);
    return diff < 0 ? NaN : diff;
  }

  // The big "30 kWh" figure under the main meter readings.
  function renderMainUsed() {
    const box = $('estMainUsed');
    const prev = $('estPrev').value;
    const curr = $('estCurr').value;
    const diff = Number(curr) - Number(prev);
    if (prev === '' || curr === '' || diff < 0) { box.classList.add('hidden'); return; }
    $('estMainKwh').textContent = kwhText(diff);
    $('estMainSpan').textContent = `${num(curr)} − ${num(prev)} = ${kwhText(diff)}`;
    box.classList.remove('hidden');
  }

  function subUsedText(s) {
    const k = subKwh(s);
    if (k === null) return 'Enter both readings';
    if (Number.isNaN(k)) return 'Current is lower than previous';
    return `${num(s.curr)} − ${num(s.prev)} = ${kwhText(k)}`;
  }

  // Inputs are built once (on add / remove / restore) so typing keeps focus.
  function renderSubs() {
    const list = $('estSubList');
    list.replaceChildren(...subs.map((s, i) => {
      const used = el('p', { class: 'est-sub-used', text: subUsedText(s) });
      const mark = () => used.classList.toggle('bad', Number.isNaN(subKwh(s)));
      const update = (key) => (event) => {
        s[key] = event.target.value;
        used.textContent = subUsedText(s);
        mark();
        calculate();
        save();
      };
      mark();
      return el('div', { class: 'est-sub', 'data-sub': s.id },
        el('div', { class: 'est-sub-top' },
          el('label', { class: 'est-sub-name' },
            el('span', { text: 'Submeter name' }),
            el('input', { type: 'text', maxlength: '40', value: s.name, placeholder: `e.g. Tenant ${i + 1}`, oninput: update('name') })),
          el('button', {
            type: 'button', class: 'est-sub-remove', 'aria-label': 'Remove submeter', title: 'Remove submeter',
            onclick: () => { subs = subs.filter((x) => x.id !== s.id); renderSubs(); calculate(); save(); }
          }, '×')),
        el('div', { class: 'est-grid' },
          el('label', {}, 'Previous reading',
            el('input', { type: 'number', inputmode: 'decimal', min: '0', step: '0.1', value: s.prev, placeholder: 'e.g. 500', oninput: update('prev') })),
          el('label', {}, 'Current reading',
            el('input', { type: 'number', inputmode: 'decimal', min: '0', step: '0.1', value: s.curr, placeholder: 'e.g. 512', oninput: update('curr') }))),
        used);
    }));
    $('estAddSub').disabled = subs.length >= MAX_SUBS;
  }

  // "Bill per meter": each person's share, the computation, and paid status.
  function renderSplit(total, kwh) {
    const card = $('estSplit');
    const body = $('estSplitBody');
    if (mode !== 'meter' || !subs.length || total === null || kwh === null) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');

    const ready = subs.map((s, i) => ({ s, i, k: subKwh(s) })).filter((x) => x.k !== null && !Number.isNaN(x.k));
    const waiting = subs.length - ready.length;
    const result = window.OMECO_BILLING.splitBill(total, kwh, ready.map((x) => x.k));
    const r2 = window.OMECO_BILLING.round2;

    if (result.error === 'no-usage') {
      body.replaceChildren(el('p', { class: 'est-split-note', text: 'The main meter shows 0 kWh, so there is nothing to divide yet.' }));
      return;
    }
    if (result.error === 'subs-exceed') {
      body.replaceChildren(el('p', { class: 'est-split-note bad', text: 'The submeters add up to more kWh than the main meter. Please check the readings.' }));
      return;
    }

    const formula = (k, amount) => `${kwhText(k)} ÷ ${kwhText(kwh)} × ${peso(total)} = ${peso(amount)}`;
    const rows = ready.map((x, n) => {
      const share = result.shares[n];
      const box = el('input', {
        type: 'checkbox', checked: x.s.paid,
        onchange: (event) => { x.s.paid = event.target.checked; save(); calculate(); }
      });
      return el('li', { class: `est-split-row${x.s.paid ? ' paid' : ''}` },
        el('div', { class: 'est-split-main' },
          el('strong', { 'data-no-translate': true, text: subName(x.s, x.i) }),
          el('span', { class: 'est-split-amount', text: peso(share.amount) })),
        el('small', { class: 'est-split-formula', text: formula(share.kwh, share.amount) }),
        el('label', { class: 'est-paid' }, box, el('span', { text: x.s.paid ? 'Paid to the owner' : 'Not paid yet' })));
    });
    const subKwhSum = kwh - result.owner.kwh;
    const owner = el('li', { class: 'est-split-row owner' },
      el('div', { class: 'est-split-main' },
        el('strong', { text: 'Main meter owner (you)' }),
        el('span', { class: 'est-split-amount', text: peso(result.owner.amount) })),
      el('small', { class: 'est-split-formula', text: `${kwhText(kwh)} − ${kwhText(subKwhSum)} = ${kwhText(result.owner.kwh)}` }),
      el('small', { class: 'est-split-formula', text: `${peso(total)} − ${peso(r2(total - result.owner.amount))} = ${peso(result.owner.amount)}` }));

    const fromSubs = r2(result.shares.reduce((a, sh) => a + sh.amount, 0));
    const collected = r2(ready.reduce((a, x, n) => a + (x.s.paid ? result.shares[n].amount : 0), 0));
    const paidCount = ready.filter((x) => x.s.paid).length;
    const summary = el('dl', { class: 'est-breakdown est-split-sum' },
      ...row('Whole bill', peso(total)),
      ...row('Submeters share', peso(fromSubs)),
      ...row(`Paid (${paidCount} of ${ready.length})`, peso(collected)),
      ...row('Still to collect', peso(r2(fromSubs - collected)), true));

    body.replaceChildren(...[
      el('ul', { class: 'est-split-list' }, owner, rows),
      waiting ? el('p', { class: 'est-split-note', text: `Submeters waiting for readings: ${waiting}` }) : null,
      summary].filter(Boolean));
  }

  // Compare with the customer's latest real bill.
  function showCompare(kwh) {
    const compare = $('estCompare');
    const bills = (typeof currentCustomer !== 'undefined' && currentCustomer && currentCustomer.bills) || [];
    const last = bills.find((b) => b.consumption_kwh != null && Number(b.consumption_kwh) > 0);
    if (last) {
      const diff = kwh - Number(last.consumption_kwh);
      const pct = Math.round((diff / Number(last.consumption_kwh)) * 100);
      compare.textContent = `Your ${last.billing_month} bill: ${Number(last.consumption_kwh)} kWh, ${peso(last.total_amount)}. `
        + (Math.abs(pct) < 1 ? 'This estimate uses about the same energy.' : `This estimate uses ${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} energy.`);
      compare.classList.remove('hidden');
    } else {
      compare.classList.add('hidden');
    }
  }

  // -------------------------------------------------- wiring
  document.querySelectorAll('.est-tab').forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
  ['estPrev', 'estCurr', 'estKwh'].forEach((id) => $(id).addEventListener('input', () => { calculate(); save(); }));
  $('estClass').addEventListener('change', () => { calculate(); save(); });
  $('estAddSub').addEventListener('click', () => {
    if (subs.length >= MAX_SUBS) return;
    subs.push({ id: `s${Date.now()}`, name: '', prev: '', curr: '', paid: false });
    renderSubs();
    calculate();
    save();
    const first = $('estSubList').querySelector('.est-sub:last-child input');
    if (first) first.focus();
  });
  document.querySelectorAll('[data-screen="estimatorScreen"]').forEach((button) => button.addEventListener('click', () => {
    const bills = (typeof currentCustomer !== 'undefined' && currentCustomer && currentCustomer.bills) || [];
    const last = bills.find((b) => b.consumption_kwh != null);
    $('estKwhHint').textContent = last ? `Your ${last.billing_month} bill used ${last.consumption_kwh} kWh.` : '';
    if (last && !$('estKwh').value) $('estKwh').placeholder = `e.g. ${last.consumption_kwh}`;
    void loadRates();
    calculate();
  }));

  restore();
  renderSubs();
  calculate();
  void loadRates(true);

  window.OMECO_ESTIMATOR = { loadRates, calculate };
})();
