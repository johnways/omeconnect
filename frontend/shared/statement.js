// OMECOnnect online Statement of Account (receipt), shared by the customer app
// and the admin console (identical file in both folders).
//   window.OMECO_STATEMENT.render(data)  -> element (data from get_statement())
//   window.OMECO_STATEMENT.print(element)
//   window.OMECO_STATEMENT.barcode(text) -> <svg> Code 128 barcode
(function () {
  // ---------------------------------------------------------------- Code 128
  // Bar/space widths for values 0-105, then STOP (106).
  const CODE128 = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
  ];
  const START_B = 104;
  const START_C = 105;
  const STOP = 106;

  // Values for the text: Code C (digit pairs) when all digits and even length, else Code B.
  function encode128(text) {
    const value = String(text || '');
    const values = [];
    if (/^\d+$/.test(value) && value.length % 2 === 0) {
      values.push(START_C);
      for (let i = 0; i < value.length; i += 2) values.push(Number(value.slice(i, i + 2)));
    } else {
      values.push(START_B);
      for (const ch of value) {
        const code = ch.charCodeAt(0);
        if (code < 32 || code > 126) throw new Error('Barcode text must be plain letters and numbers.');
        values.push(code - 32);
      }
    }
    let checksum = values[0];
    for (let i = 1; i < values.length; i += 1) checksum += values[i] * i;
    values.push(checksum % 103, STOP);
    return values;
  }

  function barcode(text, { height = 54, module = 2 } = {}) {
    const ns = 'http://www.w3.org/2000/svg';
    const values = encode128(text);
    const quiet = 10 * module;
    let x = quiet;
    const rects = [];
    values.forEach((v) => {
      const widths = CODE128[v];
      for (let i = 0; i < widths.length; i += 1) {
        const w = Number(widths[i]) * module;
        if (i % 2 === 0) rects.push([x, w]); // even positions are bars
        x += w;
      }
    });
    const width = x + quiet;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'soa-barcode');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Barcode ${text}`);
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', '#fff');
    svg.append(bg);
    rects.forEach(([rx, w]) => {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', String(rx));
      r.setAttribute('width', String(w));
      r.setAttribute('height', String(height));
      r.setAttribute('fill', '#000');
      svg.append(r);
    });
    return svg;
  }

  // ---------------------------------------------------------------- helpers
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    });
    children.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) node.append(c); });
    return node;
  }
  const money = (v) => (v === null || v === undefined || v === '' ? '—'
    : Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const rate4 = (v) => Number(v).toFixed(4);
  const reading = (v) => (v === null || v === undefined ? 'XXXX.X' : Number(v).toLocaleString('en-PH', { minimumFractionDigits: 1, maximumFractionDigits: 2 }));
  function shortDate(value) {
    if (!value) return 'XX/XX/XX';
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return 'XX/XX/XX';
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
  }
  function yearMonth(bill) {
    const base = bill.period_to || bill.reading_date || bill.created_at;
    const d = base ? new Date(`${String(base).slice(0, 10)}T00:00:00`) : null;
    if (d && !Number.isNaN(d.getTime())) return `${d.getFullYear()} - ${d.toLocaleString('en-US', { month: 'long' })}`;
    return bill.billing_month || '';
  }
  const TYPE_LABEL = { R: 'R', C: 'C', I: 'I', P: 'P' };
  const CHARGE_LABELS = {
    generation: 'Generation Charge', transmission: 'Transmission Charge', system_loss: 'System Loss Charge',
    distribution: 'Distribution Charge', supply: 'Supply & Metering', subsidies: 'Subsidies / Lifeline',
    universal: 'Universal Charges', taxes: 'Taxes (VAT, local)', other_charges: 'Other Charges'
  };

  // Charge lines: frozen lines on the bill, else the simple breakdown, else one line.
  function chargeLines(bill) {
    if (Array.isArray(bill.line_items) && bill.line_items.length) return bill.line_items;
    if (bill.charges && typeof bill.charges === 'object' && Object.keys(bill.charges).length) {
      return Object.entries(bill.charges).map(([k, v]) => ({ group: 'CHARGES', name: CHARGE_LABELS[k] || k, rate: null, amount: Number(v) }));
    }
    return [{ group: 'CHARGES', name: 'Electricity charges', rate: null, amount: Number(bill.current_amount) || 0 }];
  }

  const BOLT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/></svg>';

  // ---------------------------------------------------------------- the statement
  function render(data) {
    const header = data.header || {};
    const account = data.account || {};
    const bill = data.bill || {};
    const paid = String(bill.status || '').toLowerCase() === 'paid' || Number(bill.outstanding) === 0;
    const kwh = bill.kwh != null ? Number(bill.kwh) : null;
    const current = Number(bill.current_amount) || 0;
    const surcharge = Number(bill.surcharge) || 0;

    const logo = el('div', { class: 'soa-logo' });
    logo.innerHTML = BOLT;

    // charges grouped like the printed statement
    const lines = chargeLines(bill);
    const groups = [];
    lines.forEach((line) => {
      const g = String(line.group || 'CHARGES').toUpperCase();
      let bucket = groups.find((x) => x.name === g);
      if (!bucket) { bucket = { name: g, lines: [] }; groups.push(bucket); }
      bucket.lines.push(line);
    });
    const chargeRows = groups.flatMap((g) => [
      el('tr', { class: 'soa-group' }, el('td', { colspan: '3', text: `${g.name} :` })),
      ...g.lines.map((line) => el('tr', {},
        el('td', { class: 'soa-item', text: line.name }),
        el('td', { class: 'soa-num', text: line.rate === null || line.rate === undefined ? '' : rate4(line.rate) }),
        el('td', { class: 'soa-num', text: money(line.amount) })))
    ]);

    const accountDigits = String(account.account_number || '').replace(/\D/g, '');
    const accountBarcodeText = accountDigits.length % 2 === 0 ? accountDigits : `0${accountDigits}`;

    const soa = el('article', { class: `soa${paid ? ' soa-paid' : ''}`, 'aria-label': 'Statement of Account' },
      el('header', { class: 'soa-head' }, logo,
        el('div', { class: 'soa-org' },
          el('strong', { text: header.name || 'Occidental Mindoro Electric Cooperative, Inc.' }),
          el('span', { text: header.address || '' }),
          header.tin ? el('span', { text: `VAT REG TIN: ${header.tin}` }) : null),
        el('div', { class: 'soa-logo soa-logo-right', 'aria-hidden': 'true', text: header.short || 'OMECO' })),
      el('h2', { class: 'soa-title', text: 'Statement of Account' }),
      el('div', { class: 'soa-acct' }, el('span', { text: 'ACCT No :' }), el('strong', { text: account.account_number || '—' })),
      el('dl', { class: 'soa-who' },
        el('dt', { text: 'NAME' }), el('dd', { text: `: ${String(account.name || '—').toUpperCase()}` }),
        el('dt', { text: 'ADDRESS' }), el('dd', { text: `: ${account.address || '—'}` })),
      el('table', { class: 'soa-meta' },
        el('thead', {}, el('tr', {}, el('th', { text: 'Meter Serial #' }), el('th', { text: 'SEQ. No.' }), el('th', { text: 'Cust. Type' }), el('th', { text: 'Reading Date' }))),
        el('tbody', {}, el('tr', {}, el('td', { text: account.meter_serial || '—' }), el('td', { text: bill.sequence_no != null ? String(bill.sequence_no) : '—' }),
          el('td', { text: TYPE_LABEL[account.customer_type] || 'R' }), el('td', { text: shortDate(bill.reading_date) })))),
      el('div', { class: 'soa-period' },
        el('div', {},
          el('strong', { text: 'Period Covered' }),
          el('span', { text: `From : ${shortDate(bill.period_from)}` }),
          el('span', { text: `To   : ${shortDate(bill.period_to)}` }),
          el('span', { class: 'soa-ym', text: `YEAR-MONTH : ${yearMonth(bill)}` })),
        el('div', { class: 'soa-energy' },
          el('strong', { text: 'ENERGY READING' }),
          el('span', {}, 'Present Reading', el('b', { text: `: ${reading(bill.present_reading)}` })),
          el('span', {}, 'Previous Reading', el('b', { class: 'soa-underline', text: `: ${reading(bill.previous_reading)}` })),
          el('span', {}, `Multiplier : ${bill.multiplier != null ? Number(bill.multiplier) : 1}`,
            el('b', { class: 'soa-kwh', text: kwh != null ? kwh.toLocaleString('en-PH', { minimumFractionDigits: 1 }) : '—' })))),
      el('table', { class: 'soa-charges' },
        el('thead', {}, el('tr', {}, el('th', { text: 'CHARGES' }), el('th', { class: 'soa-num', text: 'RATES' }), el('th', { class: 'soa-num', text: 'AMOUNT' }))),
        el('tbody', {}, chargeRows)),
      el('dl', { class: 'soa-totals' },
        el('dt', { text: 'Current Amount Due' }), el('dd', { class: 'soa-due', text: `: ${money(current)}` }),
        el('dt', { text: 'Add Surcharge after deadline' }), el('dd', { text: `: ${money(surcharge)}` }),
        el('dt', { class: 'soa-grand', text: 'Total Amount Due' }), el('dd', { class: 'soa-grand', text: `: ${money(current + surcharge)}` })),
      accountBarcodeText ? el('div', { class: 'soa-bc' }, barcode(accountBarcodeText, { height: 46 }), el('span', { text: accountBarcodeText })) : null,
      el('div', { class: 'soa-dates' },
        el('div', {}, el('span', { text: 'Deadline Date' }), el('strong', { text: `: ${shortDate(bill.due_date)}` })),
        el('div', {}, el('span', { text: 'Cut-off Date' }), el('strong', { text: `: ${shortDate(bill.cutoff_date)}` }))),
      el('div', { class: 'soa-payref' },
        el('span', { text: 'ONLINE PAYMENT REF. NO. :' }),
        bill.payment_reference ? barcode(bill.payment_reference, { height: 52 }) : null,
        el('strong', { class: 'soa-ref', text: bill.payment_reference || '—' })),
      paid ? el('div', { class: 'soa-stamp', 'aria-label': 'Paid' }, 'PAID',
        data.payment && data.payment.paid_at ? el('small', { text: new Date(data.payment.paid_at).toLocaleDateString('en-PH') }) : null) : null,
      paid && data.payment ? el('p', { class: 'soa-paid-note', text: `Payment received: ₱${money(data.payment.amount)} via ${data.payment.method || 'online'}${data.payment.reference ? ` · Ref ${data.payment.reference}` : ''}` }) : null,
      el('footer', { class: 'soa-foot' },
        el('p', { text: header.footer || '' }),
        header.hotline ? el('p', { text: `Hotline: ${header.hotline}` }) : null,
        el('p', { class: 'soa-gen', text: `Generated by OMECOnnect on ${new Date(data.generated_at || Date.now()).toLocaleString('en-PH')}` })));
    return soa;
  }

  // ---------------------------------------------------------------- print / save as PDF
  function print(statement) {
    document.querySelectorAll('.soa-print').forEach((n) => n.remove());
    const holder = el('div', { class: 'soa-print' }, statement.cloneNode(true));
    document.body.append(holder);
    document.body.classList.add('printing-soa');
    const done = () => {
      document.body.classList.remove('printing-soa');
      holder.remove();
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 60000);
  }

  window.OMECO_STATEMENT = { render, print, barcode, encode128, CODE128 };
})();
