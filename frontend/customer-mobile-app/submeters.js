// OMECOnnect submeters: shared by the Bill estimator (estimator.js) and
// My Bills (bill-split.js).
//   editor(): list of submeters (name + previous/current reading + kWh)
//   split():  "Bill per meter" - each share, the computation, paid ticks
// The money math is OMECO_BILLING.splitBill (tested in tests/billing.test.mjs).
// Everything typed by the customer is shown with textContent (never as HTML).
(function () {
  'use strict';

  const MAX_SUBS = 12;

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

  const peso = (v) => (typeof formatCurrency === 'function' ? formatCurrency(v)
    : `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const num = (v) => Number(v).toLocaleString('en-PH', { maximumFractionDigits: 2 });
  const kwhText = (v) => `${num(v)} kWh`;
  const r2 = (n) => Math.round(n * 100) / 100;

  const newSub = (name = '', prev = '') => ({ id: `s${Date.now()}${Math.random().toString(36).slice(2, 6)}`, name, prev, curr: '', paid: false });
  const subName = (s, i) => (s.name || '').trim() || `Submeter ${i + 1}`;

  // kWh of one submeter: null = readings missing, NaN = current lower than previous.
  function subKwh(s) {
    if (s.prev === '' || s.curr === '') return null;
    const diff = Number(s.curr) - Number(s.prev);
    return diff < 0 ? NaN : diff;
  }

  function usedText(s) {
    const k = subKwh(s);
    if (k === null) return 'Enter both readings';
    if (Number.isNaN(k)) return 'Current is lower than previous';
    return `${num(s.curr)} − ${num(s.prev)} = ${kwhText(k)}`;
  }

  // Cleans data read back from localStorage.
  function clean(list) {
    return (Array.isArray(list) ? list : []).slice(0, MAX_SUBS).map((x, i) => ({
      id: String(x.id || `s${Date.now()}${i}`),
      name: String(x.name || '').slice(0, 40),
      prev: x.prev === undefined || x.prev === null ? '' : String(x.prev),
      curr: x.curr === undefined || x.curr === null ? '' : String(x.curr),
      paid: Boolean(x.paid)
    }));
  }

  // The submeter list. `get()` returns the current array, `set(next)` stores a
  // new one, `changed()` runs after every edit. Inputs are rebuilt only on
  // add / remove, so typing keeps the keyboard open.
  function editor({ list, addButton, get, set, changed }) {
    function render() {
      const subs = get();
      list.replaceChildren(...subs.map((s, i) => {
        const used = el('p', { class: 'est-sub-used', text: usedText(s) });
        const mark = () => used.classList.toggle('bad', Number.isNaN(subKwh(s)));
        const update = (key) => (event) => {
          s[key] = event.target.value;
          used.textContent = usedText(s);
          mark();
          changed();
        };
        mark();
        return el('div', { class: 'est-sub', 'data-sub': s.id },
          el('div', { class: 'est-sub-top' },
            el('label', { class: 'est-sub-name' },
              el('span', { text: 'Submeter name' }),
              el('input', { type: 'text', maxlength: '40', value: s.name, placeholder: `e.g. Tenant ${i + 1}`, oninput: update('name') })),
            el('button', {
              type: 'button', class: 'est-sub-remove', 'aria-label': 'Remove submeter', title: 'Remove submeter',
              onclick: () => { set(get().filter((x) => x.id !== s.id)); render(); changed(); }
            }, '×')),
          el('div', { class: 'est-grid' },
            el('label', {}, 'Previous reading',
              el('input', { type: 'number', inputmode: 'decimal', min: '0', step: '0.1', value: s.prev, placeholder: 'e.g. 500', oninput: update('prev') })),
            el('label', {}, 'Current reading',
              el('input', { type: 'number', inputmode: 'decimal', min: '0', step: '0.1', value: s.curr, placeholder: 'e.g. 512', oninput: update('curr') }))),
          used);
      }));
      addButton.disabled = subs.length >= MAX_SUBS;
    }
    addButton.addEventListener('click', () => {
      if (get().length >= MAX_SUBS) return;
      set([...get(), newSub()]);
      render();
      changed();
      const first = list.querySelector('.est-sub:last-child input');
      if (first) first.focus();
    });
    render();
    return { render };
  }

  function row(label, value, strong = false) {
    const dt = el('dt', { text: label });
    const dd = el('dd', { text: value });
    if (strong) { dt.className = 'total'; dd.className = 'total'; }
    return [dt, dd];
  }

  // Fills `body` with each person's share. Returns a short status for badges:
  // { ready, paid, count, toCollect } or null when nothing can be divided.
  function split(body, { total, kwh, subs, onPaid }) {
    const ready = subs.map((s, i) => ({ s, i, k: subKwh(s) })).filter((x) => x.k !== null && !Number.isNaN(x.k));
    const waiting = subs.length - ready.length;
    const result = window.OMECO_BILLING.splitBill(total, kwh, ready.map((x) => x.k));

    if (result.error === 'no-usage') {
      body.replaceChildren(el('p', { class: 'est-split-note', text: 'The main meter shows 0 kWh, so there is nothing to divide yet.' }));
      return null;
    }
    if (result.error === 'subs-exceed') {
      body.replaceChildren(el('p', { class: 'est-split-note bad', text: 'The submeters add up to more kWh than the main meter. Please check the readings.' }));
      return null;
    }

    const formula = (k, amount) => `${kwhText(k)} ÷ ${kwhText(kwh)} × ${peso(total)} = ${peso(amount)}`;
    const rows = ready.map((x, n) => {
      const share = result.shares[n];
      const box = el('input', { type: 'checkbox', checked: x.s.paid, onchange: (event) => { x.s.paid = event.target.checked; onPaid(); } });
      return el('li', { class: `est-split-row${x.s.paid ? ' paid' : ''}` },
        el('div', { class: 'est-split-main' },
          el('strong', { 'data-no-translate': true, text: subName(x.s, x.i) }),
          el('span', { class: 'est-split-amount', text: peso(share.amount) })),
        el('small', { class: 'est-split-formula', text: formula(share.kwh, share.amount) }),
        el('label', { class: 'est-paid' }, box, el('span', { text: x.s.paid ? 'Paid to the owner' : 'Not paid yet' })));
    });
    const owner = el('li', { class: 'est-split-row owner' },
      el('div', { class: 'est-split-main' },
        el('strong', { text: 'Main meter owner (you)' }),
        el('span', { class: 'est-split-amount', text: peso(result.owner.amount) })),
      el('small', { class: 'est-split-formula', text: `${kwhText(kwh)} − ${kwhText(r2(kwh - result.owner.kwh))} = ${kwhText(result.owner.kwh)}` }),
      el('small', { class: 'est-split-formula', text: `${peso(total)} − ${peso(r2(total - result.owner.amount))} = ${peso(result.owner.amount)}` }));

    const fromSubs = r2(result.shares.reduce((a, sh) => a + sh.amount, 0));
    const collected = r2(ready.reduce((a, x, n) => a + (x.s.paid ? result.shares[n].amount : 0), 0));
    const paidCount = ready.filter((x) => x.s.paid).length;
    body.replaceChildren(...[
      el('ul', { class: 'est-split-list' }, owner, rows),
      waiting ? el('p', { class: 'est-split-note', text: `Submeters waiting for readings: ${waiting}` }) : null,
      el('dl', { class: 'est-breakdown est-split-sum' },
        ...row('Whole bill', peso(total)),
        ...row('Submeters share', peso(fromSubs)),
        ...row(`Paid (${paidCount} of ${ready.length})`, peso(collected)),
        ...row('Still to collect', peso(r2(fromSubs - collected)), true))].filter(Boolean));
    return { ready: ready.length, paid: paidCount, count: subs.length, toCollect: r2(fromSubs - collected) };
  }

  // Status without drawing anything (for the My Bills list badge).
  function status({ total, kwh, subs }) {
    const ready = subs.map((s) => subKwh(s)).map((k, i) => ({ k, s: subs[i] })).filter((x) => x.k !== null && !Number.isNaN(x.k));
    const result = window.OMECO_BILLING.splitBill(total, kwh, ready.map((x) => x.k));
    if (result.error) return null;
    const toCollect = r2(ready.reduce((a, x, n) => a + (x.s.paid ? 0 : result.shares[n].amount), 0));
    return { ready: ready.length, paid: ready.filter((x) => x.s.paid).length, count: subs.length, toCollect };
  }

  window.OMECO_SUBMETERS = { editor, split, status, clean, newSub, el, num, kwhText, peso, MAX_SUBS };
})();
