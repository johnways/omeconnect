// OMECOnnect customer add-ons:
//   - Usage insight card (Home): this bill vs the previous one, kWh per day, a saving tip
//   - Outage board (Home power card): open outage reports per barangay in your town
//   - Scheduled power interruptions (Home): upcoming announcements that have a time window
//   - Payment history (Bills): your payments with a link to the receipt
//   - Contact OMECO (sign-in page and Profile): address and hotline set by OMECO staff
// Every value from the server is shown with textContent (never as HTML).
(function () {
  'use strict';

  const cfg = window.OMECO_CONFIG || {};
  const BASE = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  const KEY = cfg.supabaseAnonKey || '';
  const $ = (id) => document.getElementById(id);

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

  const customer = () => (typeof currentCustomer !== 'undefined' ? currentCustomer : null);
  const session = () => (typeof currentSession !== 'undefined' ? currentSession : null);
  const signedIn = () => Boolean(session() && customer() && !cfg.demoMode && BASE);

  async function request(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { apikey: KEY };
    if (auth && session()) headers.Authorization = `Bearer ${session().access_token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error((data && (data.message || data.msg)) || `Request failed (${response.status}).`);
    return data;
  }

  const peso = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(n) || 0);
  const shortDate = (v) => new Date(v).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeOf = (v) => new Date(v).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

  // ------------------------------------------------------------ usage insight (Home)
  const TIPS_HIGHER = [
    'Set your air conditioner to 25°C or higher; each degree cooler adds about 7% to its power use.',
    'Unplug chargers and TVs when not in use. Standby power adds up every month.',
    'Check your refrigerator door seal; a weak seal makes it run longer.',
  ];
  const TIPS_GENERAL = [
    'Use LED bulbs; they use up to 80% less power than ordinary bulbs.',
    'Iron clothes in one batch instead of a few pieces every day.',
    'Run the washing machine with full loads to save power and water.',
  ];

  function renderInsight() {
    const card = $('insightCard');
    if (!card) return;
    const c = customer();
    const bills = c ? (c.bills || []).filter((b) => b.consumption_kwh !== null && b.consumption_kwh !== undefined && !Number.isNaN(Number(b.consumption_kwh))) : [];
    if (!signedIn() || !bills.length) { card.classList.add('hidden'); return; }
    const latest = bills[0];
    const kwh = Number(latest.consumption_kwh);
    const previous = bills[1] ? Number(bills[1].consumption_kwh) : null;

    let trendText = 'Your first bill in the app.';
    let tone = 'same';
    if (previous) {
      const pct = Math.round(((kwh - previous) / previous) * 100);
      if (pct > 0) { trendText = `${pct}% higher than your previous bill`; tone = 'up'; }
      else if (pct < 0) { trendText = `${-pct}% lower than your previous bill`; tone = 'down'; }
      else trendText = 'Same as your previous bill';
    }
    let perDay = null;
    if (latest.period_from && latest.period_to) {
      const days = Math.round((new Date(latest.period_to) - new Date(latest.period_from)) / 86400000);
      if (days > 0) perDay = Math.round((kwh / days) * 10) / 10;
    }
    const tips = tone === 'up' ? TIPS_HIGHER : TIPS_GENERAL;
    const tip = tips[(new Date().getMonth() + bills.length) % tips.length];

    card.replaceChildren(
      el('div', { class: 'insight-head' },
        el('h3', { text: 'Your usage' }),
        el('span', { class: `insight-trend ${tone}`, text: trendText })),
      el('div', { class: 'insight-figures' },
        el('div', {}, el('strong', { text: `${kwh} kWh` }), el('small', { text: latest.billing_month || 'Latest bill' })),
        previous ? el('div', {}, el('strong', { text: `${previous} kWh` }), el('small', { text: 'Previous bill' })) : null,
        perDay ? el('div', {}, el('strong', { text: String(perDay) }), el('small', { text: 'kWh per day' })) : null),
      el('p', { class: 'insight-tip' }, el('b', { text: 'Tip' }), el('span', { text: tip })));
    card.classList.remove('hidden');
  }

  // ------------------------------------------------------------ outage board (Home power card)
  let boardLoadedAt = 0;
  async function renderOutageBoard(force) {
    const box = $('outageBoard');
    if (!box) return;
    if (!signedIn()) { box.replaceChildren(); return; }
    if (!force && Date.now() - boardLoadedAt < 60000) return;
    boardLoadedAt = Date.now();
    let data;
    try { data = await request('/rest/v1/rpc/get_municipality_outages', { method: 'POST', body: {} }); } catch (error) {
      console.warn('Outage board:', error.message);
      return;
    }
    const areas = (data && data.areas) || [];
    if (!areas.length) { box.replaceChildren(); return; }
    box.replaceChildren(
      el('p', { class: 'board-title', text: `Outage reports in ${data.municipality} now` }),
      el('ul', { class: 'board-list' }, areas.slice(0, 6).map((a) =>
        el('li', {},
          el('span', { class: 'board-dot', 'aria-hidden': 'true' }),
          el('span', { class: 'board-name', text: `Brgy. ${a.barangay}` }),
          el('span', { class: 'board-count', text: `${a.reports} ${a.reports === 1 ? 'report' : 'reports'}` })))));
  }

  // ------------------------------------------------------------ scheduled power interruptions (Home)
  function renderSchedule() {
    const card = $('scheduleCard');
    if (!card) return;
    const c = customer();
    const now = Date.now();
    const upcoming = (c && signedIn() ? c.announcements || [] : [])
      .filter((a) => a.starts_at && new Date(a.ends_at || a.starts_at).getTime() > now)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .slice(0, 4);
    if (!upcoming.length) { card.classList.add('hidden'); return; }
    card.replaceChildren(
      el('h3', { text: 'Scheduled power interruptions' }),
      el('ul', { class: 'schedule-list' }, upcoming.map((a) => {
        const start = new Date(a.starts_at);
        const live = start.getTime() <= now;
        const span = a.ends_at ? `${timeOf(a.starts_at)} – ${timeOf(a.ends_at)}` : `from ${timeOf(a.starts_at)}`;
        return el('li', { class: live ? 'live' : '' },
          el('div', { class: 'sched-date', 'aria-hidden': 'true' },
            el('b', { text: String(start.getDate()) }),
            el('span', { text: start.toLocaleDateString('en-PH', { month: 'short' }) })),
          el('div', { class: 'sched-body' },
            el('strong', { text: a.title }),
            el('small', { text: `${shortDate(a.starts_at)} · ${span}` }),
            live ? el('span', { class: 'sched-live', text: 'Happening now' }) : null));
      })));
    card.classList.remove('hidden');
  }

  // ------------------------------------------------------------ payment history (Bills)
  const METHOD = { gcash: 'GCash', maya: 'Maya', paymaya: 'Maya', card: 'Card', cash: 'Cash', bank: 'Bank', otc: 'Over the counter' };
  function methodName(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'Payment';
    return METHOD[raw.toLowerCase()] || raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  let paymentsKey = '';
  async function renderPayments(force) {
    const box = $('paymentHistory');
    if (!box) return;
    const c = customer();
    const accountId = c && c.account && c.account.id;
    if (!signedIn() || !accountId) { box.classList.add('hidden'); return; }
    const key = `${accountId}:${(c.bills || []).map((b) => `${b.id}${b.status}`).join()}`;
    if (!force && key === paymentsKey) return;
    paymentsKey = key;
    let rows;
    try {
      rows = await request(`/rest/v1/payments?customer_account_id=eq.${encodeURIComponent(accountId)}&select=amount,payment_method,reference_number,status,payment_date&order=payment_date.desc&limit=12`);
    } catch (error) {
      console.warn('Payment history:', error.message);
      return;
    }
    const list = el('ul', { class: 'payment-list' });
    if (!rows || !rows.length) {
      list.append(el('li', { class: 'payment-empty', text: 'No payments recorded yet.' }));
    } else {
      rows.forEach((p) => {
        const bill = (c.bills || []).find((b) => b.payment_reference && b.payment_reference === p.reference_number);
        list.append(el('li', {},
          el('div', { class: 'pay-main' },
            el('strong', { text: peso(p.amount) }),
            el('small', { text: `${shortDate(p.payment_date)} · ${methodName(p.payment_method)}` }),
            bill ? el('small', { class: 'pay-for', text: `For ${bill.billing_month}` }) : null),
          bill && window.OMECO_FEATURES && window.OMECO_FEATURES.openStatement
            ? el('button', { type: 'button', class: 'secondary-btn pay-receipt', onclick: () => window.OMECO_FEATURES.openStatement(bill) }, 'Receipt')
            : el('span', { class: 'badge approved', text: 'Paid' })));
      });
    }
    box.replaceChildren(el('h3', { text: 'Payment history' }), list);
    box.classList.remove('hidden');
  }

  // ------------------------------------------------------------ contact OMECO (sign-in + Profile)
  let contact = null;
  async function loadContact() {
    if (contact || !BASE) return contact;
    try {
      const rows = await request('/rest/v1/app_settings?key=eq.statement_header&select=value', { auth: false });
      contact = (rows && rows[0] && rows[0].value) || {};
    } catch { contact = {}; }
    return contact;
  }
  async function renderContact() {
    const info = await loadContact();
    document.querySelectorAll('[data-contact-card]').forEach((box) => {
      const lines = [];
      if (info.address) lines.push(el('p', { class: 'contact-line' }, el('span', { class: 'contact-k', text: 'Office' }), el('span', { text: info.address })));
      if (info.hotline) {
        lines.push(el('p', { class: 'contact-line' }, el('span', { class: 'contact-k', text: 'Hotline' }),
          el('a', { href: `tel:${String(info.hotline).replace(/[^\d+]/g, '')}`, text: info.hotline })));
      }
      lines.push(el('p', { class: 'contact-note', text: 'For emergencies such as fallen wires or fire, call OMECO or 911 right away.' }));
      box.replaceChildren(el('h3', { text: 'Contact OMECO' }), el('p', { class: 'contact-name', text: info.name || 'Occidental Mindoro Electric Cooperative, Inc.' }), ...lines);
    });
  }

  // ------------------------------------------------------------ wiring
  function renderAll(force) {
    renderInsight();
    renderSchedule();
    void renderOutageBoard(force);
    void renderPayments(force);
  }
  document.addEventListener('omeco:data', () => renderAll(false));
  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-screen]');
    if (tab && tab.dataset.screen === 'billsScreen') void renderPayments(false);
  });
  void renderContact();
  window.OMECO_INSIGHTS = { refresh: () => renderAll(true) };
})();
