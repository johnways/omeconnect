// OMECOnnect My Bills: split a real OMECO bill with submeters.
//   - In each bill's details: the main meter kWh (present − previous reading),
//     the submeters (name + readings), each share with the computation, and
//     a "Paid to the owner" tick per submeter.
//   - In the bill list: a short "Submeters: 1 of 2 paid" line per bill.
// A new bill starts with the submeter names from the bill before it, and each
// submeter's previous reading is that bill's current reading.
// Saved on this phone only (localStorage), per bill.
(function () {
  'use strict';

  const SM = window.OMECO_SUBMETERS;
  if (!SM) return;
  const { el, num, kwhText, peso } = SM;
  const STORE = 'omeconnect.billsplit';

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { return {}; }
  }
  function store(all) {
    try { localStorage.setItem(STORE, JSON.stringify(all)); } catch { /* private mode: fine */ }
  }

  const bills = () => (typeof currentCustomer !== 'undefined' && currentCustomer && currentCustomer.bills) || [];
  const usable = (bill) => bill && bill.consumption_kwh !== null && bill.consumption_kwh !== undefined
    && Number(bill.consumption_kwh) > 0 && Number.isFinite(Number(bill.total_amount));

  // Saved submeters of a bill, or a starting list taken from the bill before it.
  function subsFor(bill) {
    const all = load();
    const saved = all[bill.id];
    if (saved) return { subs: SM.clean(saved), saved: true };
    const list = bills();
    const index = list.findIndex((b) => String(b.id) === String(bill.id));
    for (let i = index + 1; i > 0 && i < list.length; i += 1) {
      const older = all[list[i].id];
      if (older && older.length) {
        return { subs: SM.clean(older).map((s) => SM.newSub(s.name, s.curr)), saved: false };
      }
    }
    return { subs: [], saved: false };
  }

  function mainReading(bill) {
    const kwh = Number(bill.consumption_kwh);
    const prev = bill.previous_reading;
    const curr = bill.present_reading;
    if (prev === null || prev === undefined || curr === null || curr === undefined) {
      return { kwh, text: 'kWh used on this bill (from OMECO)' };
    }
    const mult = Number(bill.multiplier) || 1;
    const span = `${num(curr)} − ${num(prev)}`;
    return { kwh, text: mult > 1 ? `(${span}) × ${num(mult)} = ${kwhText(kwh)}` : `${span} = ${kwhText(kwh)}` };
  }

  // Section shown inside the bill details sheet.
  function section(bill) {
    if (!usable(bill)) return null;
    const total = Number(bill.total_amount);
    const main = mainReading(bill);
    let { subs } = subsFor(bill);

    const save = () => {
      const all = load();
      if (subs.length) all[bill.id] = subs; else delete all[bill.id];
      store(all);
      decorate();
    };
    const list = el('div', { class: 'est-sub-list' });
    const addButton = el('button', { type: 'button', class: 'secondary-btn est-add-sub' }, '+ Add submeter');
    const body = el('div');
    const result = el('div', { class: 'bill-split-result hidden' },
      el('h4', { text: 'Bill per meter' }),
      el('p', { class: 'field-hint', text: 'Each submeter pays: its kWh ÷ main meter kWh × the whole bill. The owner pays the rest.' }),
      body);
    const draw = () => {
      result.classList.toggle('hidden', !subs.length);
      if (subs.length) SM.split(body, { total, kwh: main.kwh, subs, onPaid: () => { save(); draw(); } });
    };

    const wrap = el('section', { class: 'bill-split' },
      el('div', { class: 'est-subs-head' }, el('h4', { text: 'Split this bill with submeters' }), addButton),
      el('div', { class: 'est-used' },
        el('span', { class: 'est-label', text: 'Total used on the main meter' }),
        el('strong', { text: kwhText(main.kwh) }),
        el('small', { text: main.text })),
      el('p', { class: 'field-hint', text: 'Add each house or tenant on a submeter and type its readings for this billing month. Saved on this phone only.' }),
      list,
      result);

    SM.editor({ list, addButton, get: () => subs, set: (next) => { subs = next; }, changed: () => { save(); draw(); } });
    draw();
    return wrap;
  }

  // "Submeters: 1 of 2 paid · ₱76.72 to collect" under each bill in My Bills.
  function decorate() {
    const all = load();
    document.querySelectorAll('#billList [data-bill-id]').forEach((item) => {
      item.querySelector('.split-badge')?.remove();
      const bill = bills().find((b) => String(b.id) === item.dataset.billId);
      const saved = bill && all[bill.id];
      if (!saved || !saved.length || !usable(bill)) return;
      const st = SM.status({ total: Number(bill.total_amount), kwh: Number(bill.consumption_kwh), subs: SM.clean(saved) });
      if (!st) return;
      const text = st.ready && st.paid === st.ready ? `Submeters: all paid (${st.ready})`
        : `Submeters: ${st.paid} of ${st.ready} paid · ${peso(st.toCollect)} to collect`;
      const badge = el('small', { class: `split-badge${st.ready && st.paid === st.ready ? ' done' : ''}`, text });
      (item.firstElementChild || item).append(badge);
    });
  }

  const listBox = document.getElementById('billList');
  if (listBox) new MutationObserver(() => { if (!listBox.querySelector('.split-badge')) decorate(); }).observe(listBox, { childList: true });

  window.OMECO_BILLSPLIT = { section, decorate };
})();
