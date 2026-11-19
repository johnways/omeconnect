// OMECOnnect bill estimator ("meter converter").
// Converts meter readings, kWh, or appliance use (watts x hours) into kWh and
// multiplies by the rate OMECO staff set in the admin console
// (electricity_rates, read with get_current_rates()).
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
  // Typical wattage (sticker values vary) and daily hours as a starting point.
  const APPLIANCES = [
    ['LED bulb', 10, 6], ['Fluorescent tube', 40, 6], ['Electric fan', 60, 8], ['Television (LED 32")', 60, 5],
    ['Refrigerator', 150, 10], ['Rice cooker', 600, 1], ['Electric kettle', 1500, 0.3], ['Microwave oven', 1000, 0.3],
    ['Flat iron', 1000, 0.5], ['Washing machine', 400, 1], ['Water pump', 750, 1], ['Aircon 1.0 HP (inverter)', 700, 8],
    ['Aircon 1.0 HP (non-inverter)', 900, 8], ['Aircon 1.5 HP', 1300, 8], ['Laptop', 60, 6], ['Desktop computer', 200, 6],
    ['Phone charger', 10, 3], ['Wi-Fi router', 10, 24], ['Electric stove (1 burner)', 1200, 1], ['Hair dryer', 1200, 0.2]
  ];

  let rates = [];
  let ratesAt = 0;
  let mode = 'meter';
  let appliances = [];

  // -------------------------------------------------- saved inputs (this phone only)
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        mode, prev: $('estPrev').value, curr: $('estCurr').value, mult: $('estMult').value, kwh: $('estKwh').value,
        days: $('estDays').value, cls: $('estClass').value, appliances
      }));
    } catch { /* private mode: fine */ }
  }
  function restore() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { data = null; }
    appliances = Array.isArray(data && data.appliances) && data.appliances.length ? data.appliances
      : [['LED bulb', 10, 4, 6], ['Electric fan', 60, 2, 8], ['Television (LED 32")', 60, 1, 5], ['Refrigerator', 150, 1, 10]]
        .map(([name, watts, qty, hours]) => ({ name, watts, qty, hours }));
    if (!data) return;
    $('estPrev').value = data.prev || '';
    $('estCurr').value = data.curr || '';
    $('estMult').value = data.mult || '1';
    $('estKwh').value = data.kwh || '';
    $('estDays').value = data.days || '30';
    if (data.mode) setMode(data.mode, false);
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
    if (next === 'appliances') renderAppliances();
    calculate();
    if (store) save();
  }

  // -------------------------------------------------- appliances
  function applianceKwh(a, days) {
    return (Number(a.watts) || 0) * (Number(a.qty) || 0) * (Number(a.hours) || 0) * days / 1000;
  }

  function renderAppliances() {
    const box = $('estAppliances');
    const days = Math.min(31, Math.max(1, Number($('estDays').value) || 30));
    box.replaceChildren(...appliances.map((a, index) => {
      const row = document.createElement('div');
      row.className = 'est-app';
      const name = document.createElement('select');
      name.setAttribute('aria-label', 'Appliance');
      name.append(...APPLIANCES.map(([n]) => new Option(n, n)), new Option('Other', 'Other'));
      name.value = APPLIANCES.some(([n]) => n === a.name) ? a.name : 'Other';
      const field = (label, key, step, max) => {
        const wrap = document.createElement('label');
        wrap.className = 'est-app-field';
        const span = document.createElement('span');
        span.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.inputMode = 'decimal';
        input.min = '0';
        input.step = step;
        if (max) input.max = max;
        input.value = a[key];
        input.addEventListener('input', () => { a[key] = input.value; updateRowKwh(); calculate(); save(); });
        wrap.append(span, input);
        return { wrap, input };
      };
      const watts = field('Watts', 'watts', '1');
      const qty = field('How many', 'qty', '1');
      const hours = field('Hours / day', 'hours', '0.1', '24');
      const kwh = document.createElement('span');
      kwh.className = 'est-app-kwh';
      const updateRowKwh = () => { kwh.textContent = `${applianceKwh(a, days).toFixed(1)} kWh / month`; };
      updateRowKwh();
      name.addEventListener('change', () => {
        const preset = APPLIANCES.find(([n]) => n === name.value);
        a.name = name.value;
        if (preset) { a.watts = preset[1]; a.hours = preset[2]; watts.input.value = preset[1]; hours.input.value = preset[2]; }
        updateRowKwh();
        calculate();
        save();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'est-app-remove';
      remove.setAttribute('aria-label', `Remove ${a.name}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => { appliances.splice(index, 1); renderAppliances(); calculate(); save(); });
      const top = document.createElement('div');
      top.className = 'est-app-top';
      top.append(name, remove);
      const fields = document.createElement('div');
      fields.className = 'est-app-fields';
      fields.append(watts.wrap, qty.wrap, hours.wrap);
      row.append(top, fields, kwh);
      return row;
    }));
  }

  // -------------------------------------------------- the calculation
  function usedKwh() {
    if (mode === 'meter') {
      const prev = $('estPrev').value;
      const curr = $('estCurr').value;
      if (prev === '' || curr === '') return { kwh: null, note: 'Enter both meter readings.' };
      const diff = Number(curr) - Number(prev);
      if (diff < 0) return { kwh: null, note: 'The current reading is lower than the previous one. Please check the numbers.' };
      const mult = Math.max(1, Number($('estMult').value) || 1);
      const span = `${Number(curr).toLocaleString('en-PH')} − ${Number(prev).toLocaleString('en-PH')}`;
      return { kwh: diff * mult, note: mult > 1 ? `(${span}) × ${mult}` : span };
    }
    if (mode === 'kwh') {
      const v = $('estKwh').value;
      return v === '' ? { kwh: null, note: 'Enter the kWh you used.' } : { kwh: Math.max(0, Number(v)), note: '' };
    }
    const days = Math.min(31, Math.max(1, Number($('estDays').value) || 30));
    const total = appliances.reduce((sum, a) => sum + applianceKwh(a, days), 0);
    return appliances.length ? { kwh: total, note: `${appliances.length} appliance${appliances.length === 1 ? '' : 's'} for ${days} days` } : { kwh: null, note: 'Add at least one appliance.' };
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
      return;
    }
    const energy = kwh * Number(rate.rate_per_kwh);
    const fixed = Number(rate.fixed_charge) || 0;
    const total = Math.round((energy + fixed) * 100) / 100;
    $('estTotal').textContent = peso(total);
    $('estKwhUsed').textContent = `${kwh.toLocaleString('en-PH', { maximumFractionDigits: 1 })} kWh used${note ? ` (${note})` : ''}`;

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

    // Compare with the customer's latest real bill.
    const bills = (typeof currentCustomer !== 'undefined' && currentCustomer && currentCustomer.bills) || [];
    const last = bills.find((b) => b.consumption_kwh != null && Number(b.consumption_kwh) > 0);
    if (last) {
      const diff = kwh - Number(last.consumption_kwh);
      const pct = Math.round((diff / Number(last.consumption_kwh)) * 100);
      compare.textContent = `Your ${last.billing_month} bill: ${Number(last.consumption_kwh)} kWh, ${peso(last.total_amount)}. `
        + (Math.abs(pct) < 1 ? 'This estimate uses about the same energy.' : `This estimate uses ${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} energy.`)
        + (pct > 15 && mode === 'appliances' ? ' Aircon and heating appliances usually make the biggest difference.' : '');
      compare.classList.remove('hidden');
    } else {
      compare.classList.add('hidden');
    }
  }

  // -------------------------------------------------- wiring
  document.querySelectorAll('.est-tab').forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
  ['estPrev', 'estCurr', 'estMult', 'estKwh'].forEach((id) => $(id).addEventListener('input', () => { calculate(); save(); }));
  $('estDays').addEventListener('input', () => { renderAppliances(); calculate(); save(); });
  $('estClass').addEventListener('change', () => { calculate(); save(); });
  $('estAddAppliance').addEventListener('click', () => {
    appliances.push({ name: 'Electric fan', watts: 60, qty: 1, hours: 8 });
    renderAppliances();
    calculate();
    save();
    const last = $('estAppliances').lastElementChild;
    if (last) last.querySelector('select').focus();
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
  renderAppliances();
  calculate();
  void loadRates(true);

  window.OMECO_ESTIMATOR = { loadRates, calculate };
})();
