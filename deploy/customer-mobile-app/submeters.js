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

  // Fills `body` with the step-by-step computation:
  //   1. kWh on the main meter   2. price per kWh = whole bill ÷ main kWh
  //   3. each meter pays its kWh × price per kWh (owner = main − submeters)
  //   4. check: all shares added together = the whole bill
  // plus paid ticks and a "Share the computation" button.
  // Returns { ready, paid, count, toCollect } or null when nothing can be divided.
  const rateText = (v) => `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  const pct = (part, whole) => `${(Math.round((part / whole) * 1000) / 10).toLocaleString('en-PH')}%`;

  function step(n, label, value, detail) {
    return el('li', { class: 'split-step' },
      el('span', { class: 'split-step-n', 'aria-hidden': 'true', text: String(n) }),
      el('div', { class: 'split-step-body' },
        el('div', { class: 'split-step-top' }, el('span', { text: label }), value ? el('strong', { text: value }) : null),
        detail ? el('small', { text: detail }) : null));
  }

  function shareText({ title, mainText, total, kwh, result, ready }) {
    const lines = [`OMECOnnect bill split${title ? ` – ${title}` : ''}`, ''];
    lines.push(`Main meter: ${mainText || kwhText(kwh)}`);
    lines.push(`Whole bill: ${peso(total)}`);
    lines.push(`Price per kWh: ${peso(total)} ÷ ${kwhText(kwh)} = ${rateText(result.rate)}`, '');
    ready.forEach((x, n) => {
      const sh = result.shares[n];
      lines.push(`${subName(x.s, x.i)}: ${num(x.s.curr)} − ${num(x.s.prev)} = ${kwhText(sh.kwh)} × ${rateText(result.rate)} = ${peso(sh.amount)} (${x.s.paid ? 'Paid' : 'Not paid yet'})`);
    });
    const sub = r2(kwh - result.owner.kwh);
    lines.push(`Main meter owner: ${kwhText(kwh)} − ${kwhText(sub)} = ${kwhText(result.owner.kwh)} × ${rateText(result.rate)} = ${peso(result.owner.amount)}${result.rounding ? ` (includes ${peso(result.rounding)} rounding)` : ''}`, '');
    lines.push(`Check: ${[...result.shares.map((sh) => peso(sh.amount)), peso(result.owner.amount)].join(' + ')} = ${peso(total)}`);
    return lines.join('\n');
  }

  function split(body, { total, kwh, subs, onPaid, mainText = '', title = '' }) {
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

    const rate = rateText(result.rate);
    const subKwhTotal = r2(kwh - result.owner.kwh);

    // Steps 1 and 2
    const steps = el('ol', { class: 'split-steps' },
      step(1, 'Main meter used', kwhText(kwh), mainText || null),
      step(2, 'Price per kWh', rate, `${peso(total)} (whole bill) ÷ ${kwhText(kwh)}`),
      step(3, 'Each meter pays its kWh × price per kWh', null, null));

    // Step 3: one row per person
    const rows = ready.map((x, n) => {
      const share = result.shares[n];
      const box = el('input', { type: 'checkbox', checked: x.s.paid, onchange: (event) => { x.s.paid = event.target.checked; onPaid(); } });
      return el('li', { class: `est-split-row${x.s.paid ? ' paid' : ''}` },
        el('div', { class: 'est-split-main' },
          el('strong', { 'data-no-translate': true, text: subName(x.s, x.i) }),
          el('span', { class: 'est-split-amount', text: peso(share.amount) })),
        el('small', { class: 'est-split-formula', text: `${num(x.s.curr)} − ${num(x.s.prev)} = ${kwhText(share.kwh)}` }),
        el('small', { class: 'est-split-formula strong', text: `${kwhText(share.kwh)} × ${rate} = ${peso(share.amount)}` }),
        el('small', { class: 'est-split-pct', text: `${pct(share.kwh, kwh)} of the bill` }),
        el('label', { class: 'est-paid' }, box, el('span', { text: x.s.paid ? 'Paid to the owner' : 'Not paid yet' })));
    });
    const owner = el('li', { class: 'est-split-row owner' },
      el('div', { class: 'est-split-main' },
        el('strong', { text: 'Main meter owner (you)' }),
        el('span', { class: 'est-split-amount', text: peso(result.owner.amount) })),
      el('small', { class: 'est-split-formula', text: `${kwhText(kwh)} − ${kwhText(subKwhTotal)} = ${kwhText(result.owner.kwh)}` }),
      el('small', { class: 'est-split-formula strong', text: `${kwhText(result.owner.kwh)} × ${rate} = ${peso(r2(result.owner.kwh * result.rate))}` }),
      result.rounding ? el('small', { class: 'est-split-pct', text: `Plus ${peso(result.rounding)} rounding, so the shares add up to the bill exactly` }) : null,
      el('small', { class: 'est-split-pct', text: `${pct(result.owner.kwh, kwh)} of the bill` }));

    // Step 4: the check
    const parts = [...result.shares.map((sh) => peso(sh.amount)), peso(result.owner.amount)];
    const check = el('div', { class: 'split-check' },
      el('span', { class: 'split-step-n ok', 'aria-hidden': 'true', text: '✓' }),
      el('div', {},
        el('strong', { text: 'Check: all shares added together' }),
        el('small', { class: 'est-split-formula', text: `${parts.join(' + ')} = ${peso(total)}` }),
        el('small', { class: 'split-check-ok', text: 'Same as the whole bill' })));

    const fromSubs = r2(result.shares.reduce((a, sh) => a + sh.amount, 0));
    const collected = r2(ready.reduce((a, x, n) => a + (x.s.paid ? result.shares[n].amount : 0), 0));
    const paidCount = ready.filter((x) => x.s.paid).length;

    const shareBtn = el('button', { type: 'button', class: 'secondary-btn split-share' }, 'Share the computation');
    shareBtn.addEventListener('click', async () => {
      const text = shareText({ title, mainText, total, kwh, result, ready });
      try {
        if (navigator.share) { await navigator.share({ title: 'OMECOnnect bill split', text }); return; }
        await navigator.clipboard.writeText(text);
        shareBtn.textContent = 'Copied ✓';
      } catch (error) {
        if (error && error.name === 'AbortError') return; // closed the share menu
        try { await navigator.clipboard.writeText(text); shareBtn.textContent = 'Copied ✓'; } catch { shareBtn.textContent = 'Could not share'; }
      }
      setTimeout(() => { shareBtn.textContent = 'Share the computation'; }, 2500);
    });

    body.replaceChildren(...[
      steps,
      el('ul', { class: 'est-split-list' }, rows, owner),
      waiting ? el('p', { class: 'est-split-note', text: `Submeters waiting for readings: ${waiting}` }) : null,
      check,
      el('dl', { class: 'est-breakdown est-split-sum' },
        ...row('Whole bill', peso(total)),
        ...row('Submeters share', peso(fromSubs)),
        ...row(`Paid (${paidCount} of ${ready.length})`, peso(collected)),
        ...row('Still to collect', peso(r2(fromSubs - collected)), true)),
      shareBtn].filter(Boolean));
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
