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
    subs = SM.clean(data.subs);
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

  // -------------------------------------------------- submeters (submeters.js)
  const SM = window.OMECO_SUBMETERS;

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

  function renderSplit(total, kwh) {
    const card = $('estSplit');
    if (mode !== 'meter' || !subs.length || total === null || kwh === null) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    SM.split($('estSplitBody'), { total, kwh, subs, onPaid: () => { save(); calculate(); } });
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
  document.querySelectorAll('[data-screen="estimatorScreen"]').forEach((button) => button.addEventListener('click', () => {
    const bills = (typeof currentCustomer !== 'undefined' && currentCustomer && currentCustomer.bills) || [];
    const last = bills.find((b) => b.consumption_kwh != null);
    $('estKwhHint').textContent = last ? `Your ${last.billing_month} bill used ${last.consumption_kwh} kWh.` : '';
    if (last && !$('estKwh').value) $('estKwh').placeholder = `e.g. ${last.consumption_kwh}`;
    void loadRates();
    calculate();
  }));

  restore();
  SM.editor({
    list: $('estSubList'), addButton: $('estAddSub'),
    get: () => subs, set: (next) => { subs = next; }, changed: () => { calculate(); save(); }
  });
  calculate();
  void loadRates(true);

  window.OMECO_ESTIMATOR = { loadRates, calculate };
})();
