// OMECOnnect admin operations: verification, concerns, announcements, bills,
// reports, security, notifications. Loaded after script.js and uses its
// globals: session, demoMode, supabaseClient, customers, coverage, el,
// setView, loadCustomers, accountStatus.
(function () {
  const POLL_MS = 30000;
  const OPEN_COMPLAINT = (status) => !['resolved', 'closed', 'rejected'].includes(String(status || '').toLowerCase());
  const COMPLAINT_STATUS = {
    submitted: ['Submitted', 'info'],
    under_review: ['Under review', 'pending'],
    in_progress: ['In progress', 'pending'],
    resolved: ['Resolved', 'approved'],
    closed: ['Closed', 'neutral'],
    rejected: ['Not accepted', 'danger']
  };
  const REQUEST_STATUS = { pending: ['Pending', 'pending'], approved: ['Approved', 'approved'], rejected: ['Rejected', 'danger'] };
  // Automatic approval (phase26): app_settings.auto_verify_enabled, changed by supervisors.
  let autoVerifyOn = null;

  const state = {
    requests: [],
    usersById: new Map(),
    complaints: [],
    announcements: [],
    bills: [],
    verifiedAccounts: [],
    notifications: [],
    verificationTab: 'pending',
    complaintTab: 'open',
    knownUnread: null,
    pollTimer: null,
    staff: null
  };

  const $ = (id) => document.getElementById(id);
  const token = () => session && session.access_token;
  const myId = () => session && session.user && session.user.id;
  const live = () => Boolean(session && !session.demo && supabaseClient);

  // ---------------------------------------------------------------- helpers
  function fmtDate(value, withTime = true) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-PH', withTime
      ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function peso(value) {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
      : '—';
  }

  function badge(label, kind) {
    return el('span', { class: `badge ${kind}` }, label);
  }

  function toast(message, kind = '') {
    const node = el('div', { class: `toast ${kind}`.trim(), role: 'status' }, message);
    $('toastHost').append(node);
    setTimeout(() => node.remove(), 5000);
  }

  function setRows(tbodyId, emptyId, rows, emptyText) {
    $(tbodyId).replaceChildren(...rows);
    const empty = $(emptyId);
    if (empty) {
      empty.textContent = emptyText;
      empty.classList.toggle('hidden', rows.length > 0);
    }
  }

  function needLive() {
    if (live()) return true;
    toast('Demo mode: connect Supabase in config.js to use this.', 'error');
    return false;
  }

  // Modal: resolves with true when confirmed (after onConfirm succeeds), false when cancelled.
  function openModal({ title, content, confirmText = 'Confirm', danger = false, onConfirm }) {
    const dialog = $('modal');
    $('modalTitle').textContent = title;
    $('modalContent').replaceChildren(...content);
    const error = $('modalError');
    error.classList.add('hidden');
    const confirm = $('modalConfirm');
    confirm.textContent = confirmText;
    confirm.className = danger ? 'danger' : 'primary-btn';
    confirm.disabled = false;

    return new Promise((resolve) => {
      const form = $('modalForm');
      const finish = (result) => {
        form.onsubmit = null;
        $('modalCancel').onclick = null;
        dialog.onclose = null;
        if (dialog.open) dialog.close();
        resolve(result);
      };
      form.onsubmit = async (event) => {
        event.preventDefault();
        confirm.disabled = true;
        error.classList.add('hidden');
        try {
          await onConfirm();
          finish(true);
        } catch (err) {
          error.textContent = err.message || 'Something went wrong.';
          error.classList.remove('hidden');
          confirm.disabled = false;
        }
      };
      $('modalCancel').onclick = () => finish(false);
      dialog.onclose = () => finish(false);
      dialog.showModal();
      const firstField = dialog.querySelector('input, textarea, select');
      if (firstField) firstField.focus();
    });
  }

  function field(label, input) {
    return el('label', {}, label, input);
  }

  function personSummary(user, extra = []) {
    const lines = [
      el('strong', {}, (user && user.full_name) || 'Unknown customer'),
      el('br'),
      [user && user.email, user && user.mobile_number].filter(Boolean).join(' · ') || 'No contact details',
      el('br'),
      user && user.municipality ? `${user.barangay}, ${user.municipality}` : 'Location not set',
      ...extra
    ];
    return el('p', { class: 'modal-summary' }, ...lines);
  }

  // ---------------------------------------------------------------- loaders
  async function loadRequests() {
    state.requests = await supabaseClient.select(
      'account_verification_requests?select=id,user_id,account_number,status,created_at,reviewed_at,review_note,auto_decision,auto_reasons&order=created_at.desc&limit=300',
      token());
    try {
      const setting = await supabaseClient.select('app_settings?key=eq.auto_verify_enabled&select=value', token());
      autoVerifyOn = Boolean(setting && setting[0] && setting[0].value === true);
    } catch { autoVerifyOn = null; }
    const ids = [...new Set(state.requests.map((r) => r.user_id))];
    state.usersById = new Map();
    if (ids.length) {
      const users = await supabaseClient.select(
        `users?select=id,full_name,email,mobile_number,municipality,barangay&id=in.(${ids.join(',')})`, token());
      users.forEach((user) => state.usersById.set(user.id, user));
    }
    window.pendingRequestsByUser = new Map(
      state.requests.filter((r) => r.status === 'pending').map((r) => [r.user_id, r.account_number]));
  }

  async function loadComplaints() {
    state.complaints = await supabaseClient.select(
      'complaints?select=id,tracking_number,complaint_type,description,status,created_at,updated_at,municipality,barangay,user_id,' +
      'assigned_to,assigned_at,due_by,photo_paths,rating,rating_comment,' +
      'users:users!complaints_user_id_fkey(full_name,email,mobile_number,municipality,barangay)&order=created_at.desc&limit=300', token());
  }

  // OMECO staff who can be given a concern.
  async function loadStaff() {
    const rows = await supabaseClient.select('admin_accounts?select=user_id,department,users(full_name,email)', token());
    state.staff = rows.map((r) => ({ id: r.user_id, name: (r.users && (r.users.full_name || r.users.email)) || 'Staff', department: r.department || '' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  const staffName = (id) => {
    const person = (state.staff || []).find((s) => s.id === id);
    return person ? (id === myId() ? `${person.name} (you)` : person.name) : 'Staff';
  };

  // Time left until a concern's target (SLA). Closed concerns show "Done".
  function slaBadge(c) {
    if (!OPEN_COMPLAINT(c.status)) return el('span', { class: 'sla done' }, 'Done');
    if (!c.due_by) return el('span', { class: 'sla done' }, '—');
    const ms = new Date(c.due_by).getTime() - Date.now();
    const minutes = Math.max(1, Math.round(Math.abs(ms) / 60000));
    const hours = Math.round(minutes / 60);
    const span = minutes < 60 ? `${minutes} min` : hours >= 48 ? `${Math.round(hours / 24)} d` : `${hours} h`;
    const node = ms < 0
      ? el('span', { class: 'sla late' }, `Overdue ${span}`)
      : el('span', { class: `sla ${ms < 2 * 3600000 ? 'soon' : 'ok'}` }, `Due in ${span}`);
    node.title = `Target: ${fmtDate(c.due_by)}`;
    return node;
  }
  const isOverdue = (c) => OPEN_COMPLAINT(c.status) && c.due_by && new Date(c.due_by).getTime() < Date.now();

  async function loadAnnouncements() {
    state.announcements = await supabaseClient.select(
      'announcements?select=id,title,content,category,affected_area,is_urgent,is_published,published_at,created_at&order=created_at.desc&limit=100',
      token());
  }

  async function loadBills() {
    [state.bills, state.verifiedAccounts] = await Promise.all([
      supabaseClient.select(
        'electricity_bills?select=id,billing_month,due_date,total_amount,outstanding_balance,consumption_kwh,status,created_at,' +
        'customer_accounts(account_number,users(full_name))&order=created_at.desc&limit=200', token()),
      supabaseClient.select(
        'customer_accounts?select=id,account_number,service_area,users(full_name)&verification_status=eq.verified&order=account_number.asc',
        token())
    ]);
  }

  async function loadNotifications() {
    state.notifications = await supabaseClient.select(
      `notifications?user_id=eq.${myId()}&select=id,title,message,type,is_read,created_at&order=created_at.desc&limit=30`, token());
  }

  async function ensureCoverage() {
    if (!coverage.size) coverage = await supabaseClient.getServiceAreas();
  }

  // ---------------------------------------------------------------- badges & bell
  function renderBadges() {
    const pending = state.requests.filter((r) => r.status === 'pending').length;
    const open = state.complaints.filter((c) => OPEN_COMPLAINT(c.status)).length;
    const setBadge = (id, count) => {
      $(id).textContent = String(count);
      $(id).classList.toggle('hidden', !count);
    };
    setBadge('navVerificationBadge', pending);
    setBadge('navComplaintBadge', open);
    $('verificationPendingCount').textContent = String(pending);
    $('complaintOpenCount').textContent = String(open);
  }

  // Icon + colour per notification type.
  const BELL_KIND = {
    admin_verification: ['verify', 'M12 3 5 6v6c0 4.4 3 8.1 7 9 4-.9 7-4.6 7-9V6zM9 12l2 2 4-4'],
    admin_complaint: ['concern', 'M4 5h16v11H8l-4 4zM8 9h8M8 12h5'],
    admin_meter: ['meter', 'M12 21a9 9 0 1 1 9-9M12 12l4-4'],
    admin_alert: ['alert', 'M12 9v4M12 17h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z']
  };
  function timeAgo(value) {
    const ms = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(ms)) return '';
    const min = Math.round(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} h ago`;
    const d = Math.round(h / 24);
    return d < 7 ? `${d} day${d === 1 ? '' : 's'} ago` : fmtDate(value, false);
  }
  function bellIcon(type) {
    const [kind, path] = BELL_KIND[type] || ['info', 'M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'];
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    svg.append(shape);
    return el('span', { class: `bell-icon kind-${kind}` }, svg);
  }

  function renderBell() {
    const unread = state.notifications.filter((n) => !n.is_read);
    $('bellCount').textContent = String(unread.length);
    $('bellCount').classList.toggle('hidden', !unread.length);
    $('bellSummary').textContent = unread.length ? `${unread.length} new` : "You're all caught up";
    $('bellMarkRead').disabled = !unread.length;
    const list = $('bellList');
    if (!state.notifications.length) {
      list.replaceChildren(el('p', { class: 'bell-empty' }, 'No notifications yet. New verification requests and concerns appear here.'));
      return;
    }
    const makeItem = (n) => {
      const item = el('button', { type: 'button', class: `bell-item${n.is_read ? '' : ' unread'}` },
        bellIcon(n.type),
        el('span', { class: 'bell-text' },
          el('strong', {}, n.title), el('span', {}, n.message),
          el('small', { title: fmtDate(n.created_at) }, timeAgo(n.created_at))));
      item.addEventListener('click', async () => {
        closeBell({ restoreFocus: false });
        if (!n.is_read) {
          await supabaseClient.update(`notifications?id=eq.${n.id}`, { is_read: true }, token()).catch(() => {});
          n.is_read = true;
          renderBell();
        }
        if (n.type === 'admin_verification') setView('verificationView');
        else if (n.type === 'admin_complaint') setView('complaintsView');
        else if (n.type === 'admin_meter') setView('meterView');
        else if (n.type === 'admin_alert') setView('securityView');
      });
      return item;
    };
    const fresh = state.notifications.filter((n) => !n.is_read);
    const earlier = state.notifications.filter((n) => n.is_read);
    list.replaceChildren(
      ...(fresh.length ? [el('p', { class: 'bell-group' }, 'New'), ...fresh.map(makeItem)] : []),
      ...(earlier.length ? [el('p', { class: 'bell-group' }, 'Earlier'), ...earlier.map(makeItem)] : []));
  }

  // ---------------------------------------------------------------- notification drawer (left side)
  // Moved to <body> so the top bar can never clip it.
  const bellPanel = $('bellPanel');
  const bellBackdrop = $('bellBackdrop');
  document.body.append(bellBackdrop, bellPanel);
  function openBell() {
    bellPanel.classList.add('open');
    bellBackdrop.classList.add('open');
    bellPanel.setAttribute('aria-hidden', 'false');
    $('bellButton').setAttribute('aria-expanded', 'true');
    document.body.classList.add('bell-open');
    if (!live()) {
      $('bellList').replaceChildren(el('p', { class: 'bell-empty' }, 'Notifications need a real Supabase connection.'));
    }
    setTimeout(() => $('bellClose').focus(), 60);
  }
  function closeBell({ restoreFocus = true } = {}) {
    if (!bellPanel.classList.contains('open')) return;
    bellPanel.classList.remove('open');
    bellBackdrop.classList.remove('open');
    bellPanel.setAttribute('aria-hidden', 'true');
    $('bellButton').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('bell-open');
    if (restoreFocus) $('bellButton').focus();
  }
  $('bellClose').addEventListener('click', () => closeBell());
  bellBackdrop.addEventListener('click', () => closeBell());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && bellPanel.classList.contains('open')) closeBell();
  });

  async function poll({ quiet = false } = {}) {
    if (!live()) return;
    try {
      await Promise.all([loadNotifications(), loadRequests(), loadComplaints()]);
      const unread = state.notifications.filter((n) => !n.is_read);
      if (!quiet && state.knownUnread !== null && unread.length > state.knownUnread) {
        const newest = unread[0];
        toast(`🔔 ${newest.title}: ${newest.message}`);
        refreshActiveView();
      }
      state.knownUnread = unread.length;
      renderBell();
      renderBadges();
    } catch (error) {
      console.warn('Notification check failed:', error.message);
    }
  }

  function refreshActiveView() {
    const active = document.querySelector('.content.view.active');
    if (active && views[active.id]) void views[active.id]();
  }

  // ---------------------------------------------------------------- overview
  async function showOverview() {
    if (!live()) return;
    try {
      await Promise.all([loadRequests(), loadComplaints(), loadAnnouncements(), loadCustomers()]);
    } catch (error) {
      toast(`Could not load the overview: ${error.message}`, 'error');
      return;
    }
    renderBadges();
    const pending = state.requests.filter((r) => r.status === 'pending');
    const open = state.complaints.filter((c) => OPEN_COMPLAINT(c.status));
    $('customersCount').textContent = String(customers.length);
    $('pendingVerificationCount').textContent = String(pending.length);
    $('complaintCount').textContent = String(open.length);
    $('complaintCountNote').textContent = `${state.complaints.length} total received`;
    $('announcementCount').textContent = String(state.announcements.filter((a) => a.is_published).length);

    const latestRequests = [...pending, ...state.requests.filter((r) => r.status !== 'pending')].slice(0, 5);
    setRows('overviewVerificationRows', 'overviewVerificationEmpty', latestRequests.map((r) => {
      const user = state.usersById.get(r.user_id) || {};
      const [label, kind] = REQUEST_STATUS[r.status] || [r.status, 'neutral'];
      return el('tr', {},
        el('td', {}, user.full_name || '—'),
        el('td', {}, r.account_number),
        el('td', {}, user.municipality || '—'),
        el('td', {}, badge(label, kind)));
    }), 'No verification requests yet.');

    $('overviewComplaintList').replaceChildren(...open.slice(0, 5).map((c) => {
      const [label, kind] = COMPLAINT_STATUS[c.status] || [c.status, 'info'];
      return el('li', {},
        el('div', {}, el('strong', {}, c.complaint_type),
          el('small', {}, `${c.tracking_number} · ${(c.users && c.users.full_name) || 'Customer'}`)),
        badge(label, kind));
    }));
    $('overviewComplaintEmpty').classList.toggle('hidden', open.length > 0);

    $('overviewAnnouncementList').replaceChildren(...state.announcements.slice(0, 3).map((a) =>
      el('div', { class: 'announcement-item' },
        el('div', {}, el('strong', {}, a.title), el('p', {}, a.content)),
        a.is_urgent ? badge('Urgent', 'warning') : a.is_published ? badge('Published', 'approved') : badge('Draft', 'neutral'))));
    $('overviewAnnouncementEmpty').classList.toggle('hidden', state.announcements.length > 0);
  }

  // ---------------------------------------------------------------- verification
  async function showVerification() {
    if (!live()) return;
    try {
      await loadRequests();
    } catch (error) {
      toast(`Could not load verification requests: ${error.message}`, 'error');
      return;
    }
    renderBadges();
    renderVerification();
  }

  function renderVerification() {
    const rows = state.requests.filter((r) => !state.verificationTab || r.status === state.verificationTab);
    setRows('verificationRows', 'verificationEmpty', rows.map((r) => {
      const user = state.usersById.get(r.user_id) || {};
      const auto = r.status === 'approved' && r.auto_decision === 'approved';
      const [label, kind] = auto ? ['Approved automatically', 'approved'] : (REQUEST_STATUS[r.status] || [r.status, 'neutral']);
      const reasons = r.status === 'pending' && Array.isArray(r.auto_reasons) ? r.auto_reasons : [];
      const actions = el('div', { class: 'row-actions' });
      if (r.status === 'pending') {
        const approve = el('button', { type: 'button', class: 'btn-sm approve' }, 'Approve');
        const reject = el('button', { type: 'button', class: 'btn-sm reject' }, 'Reject');
        const recheck = el('button', { type: 'button', class: 'btn-sm', title: 'Run the automatic check again' }, 'Check again');
        approve.addEventListener('click', () => void approveRequest(r));
        reject.addEventListener('click', () => void rejectRequest(r));
        recheck.addEventListener('click', () => void recheckRequest(r, recheck));
        actions.append(approve, reject, recheck);
      } else {
        actions.append(el('span', { class: 'cell-sub' }, `${auto ? 'By the system' : 'Reviewed'} ${fmtDate(r.reviewed_at, false)}`));
      }
      const statusCell = reasons.length
        ? [badge('Needs a check', 'pending'), el('ul', { class: 'auto-reasons' }, reasons.map((text) => el('li', {}, text)))]
        : [badge(label, kind), r.review_note && !auto ? el('span', { class: 'note-line' }, r.review_note) : null];
      return el('tr', {},
        el('td', {}, el('strong', {}, user.full_name || '—'),
          el('span', { class: 'cell-sub' }, [user.email, user.mobile_number].filter(Boolean).join(' · '))),
        el('td', {}, user.municipality ? `${user.barangay}, ${user.municipality}` : el('span', { class: 'not-set' }, 'Not set')),
        el('td', { class: 'mono' }, r.account_number),
        el('td', {}, fmtDate(r.created_at)),
        el('td', {}, ...statusCell),
        el('td', {}, actions));
    }), state.verificationTab === 'pending' ? 'No pending requests. Complete requests are approved automatically.' : 'Nothing here.');
    renderAutoSwitch();
  }

  // ---------------------------------------------------------------- automatic approval
  function renderAutoSwitch() {
    const box = $('autoVerifyToggle');
    if (!box) return;
    box.checked = autoVerifyOn === true;
    box.disabled = autoVerifyOn === null;
    $('autoVerifyState').textContent = autoVerifyOn === null ? '…' : autoVerifyOn ? 'On' : 'Off';
  }

  async function setAutoVerify(on) {
    if (!needLive()) { renderAutoSwitch(); return; }
    try {
      const result = await supabaseClient.rpc('set_auto_verification', { p_enabled: on }, token());
      autoVerifyOn = on;
      const now = (result && result.approved_now) || 0;
      toast(on ? `Automatic approval is on.${now ? ` ${now} pending request${now === 1 ? ' was' : 's were'} approved now.` : ''}`
        : 'Automatic approval is off. New requests wait for staff.', 'success');
      await showVerification();
    } catch (error) {
      toast(error.message || 'Could not change automatic approval.', 'error');
      renderAutoSwitch();
    }
  }

  async function recheckRequest(request, button) {
    if (!needLive()) return;
    button.disabled = true;
    try {
      const result = await supabaseClient.rpc('recheck_verification_request', { p_request_id: request.id }, token());
      const outcome = result && result.result;
      toast(outcome === 'approved' ? 'Everything is complete now. The request was approved automatically.'
        : outcome === 'off' ? 'Automatic approval is off. Approve or reject it yourself.'
          : `Still needs a check: ${((result && result.reasons) || []).join('; ')}`, outcome === 'approved' ? 'success' : '');
      if (outcome === 'approved') customers = [];
      await showVerification();
    } catch (error) {
      toast(error.message || 'Could not check the request.', 'error');
      button.disabled = false;
    }
  }
  if ($('autoVerifyToggle')) $('autoVerifyToggle').addEventListener('change', (event) => void setAutoVerify(event.target.checked));

  async function approveRequest(request) {
    if (!needLive()) return;
    const user = state.usersById.get(request.user_id);
    const accountInput = el('input', { value: request.account_number, required: 'required', maxlength: '40' });
    const meterInput = el('input', { placeholder: 'Optional', maxlength: '40' });
    const noteInput = el('input', { placeholder: 'Optional internal note', maxlength: '200' });
    const done = await openModal({
      title: 'Approve verification',
      confirmText: 'Approve and link account',
      content: [
        personSummary(user),
        el('p', { class: 'muted small' }, 'Check this account number against OMECO records before approving. You can correct it here.'),
        field('OMECO account number', accountInput),
        field('Meter number', meterInput),
        field('Note', noteInput)
      ],
      onConfirm: () => supabaseClient.rpc('approve_verification_request', {
        p_request_id: request.id,
        p_account_number: accountInput.value.trim(),
        p_meter_number: meterInput.value.trim() || null,
        p_note: noteInput.value.trim() || null
      }, token())
    });
    if (done) {
      toast(`Approved. ${(user && user.full_name) || 'The customer'} has been notified.`, 'success');
      customers = [];
      await showVerification();
    }
  }

  async function rejectRequest(request) {
    if (!needLive()) return;
    const user = state.usersById.get(request.user_id);
    const reason = el('textarea', { rows: '3', required: 'required', placeholder: 'e.g. Account number does not match our records.' });
    const done = await openModal({
      title: 'Reject verification',
      confirmText: 'Reject request',
      danger: true,
      content: [
        personSummary(user, [el('br'), `Account number given: ${request.account_number}`]),
        field('Reason (sent to the customer)', reason)
      ],
      onConfirm: () => supabaseClient.rpc('reject_verification_request', {
        p_request_id: request.id, p_note: reason.value.trim()
      }, token())
    });
    if (done) {
      toast('Request rejected. The customer has been notified with your reason.', 'success');
      await showVerification();
    }
  }

  // ---------------------------------------------------------------- complaints
  async function showComplaints() {
    if (!live()) return;
    try {
      await Promise.all([loadComplaints(), state.staff ? null : loadStaff()]);
    } catch (error) {
      toast(`Could not load concerns: ${error.message}`, 'error');
      return;
    }
    renderBadges();
    renderComplaints();
  }

  function renderComplaints() {
    const rows = state.complaints.filter((c) => {
      switch (state.complaintTab) {
        case 'open': return OPEN_COMPLAINT(c.status);
        case 'mine': return OPEN_COMPLAINT(c.status) && c.assigned_to === myId();
        case 'unassigned': return OPEN_COMPLAINT(c.status) && !c.assigned_to;
        case 'overdue': return isOverdue(c);
        case 'resolved': return !OPEN_COMPLAINT(c.status);
        default: return true;
      }
    });
    // Most urgent first for open lists.
    if (state.complaintTab !== 'resolved' && state.complaintTab !== '') {
      rows.sort((a, b) => new Date(a.due_by || a.created_at) - new Date(b.due_by || b.created_at));
    }
    setRows('complaintRows', 'complaintEmpty', rows.map((c) => {
      const [label, kind] = COMPLAINT_STATUS[c.status] || [c.status, 'info'];
      const user = c.users || {};
      const municipality = c.municipality || user.municipality;
      const barangay = c.barangay || user.barangay;
      const update = el('button', { type: 'button', class: 'btn-sm primary' }, 'Update');
      update.addEventListener('click', () => void updateComplaint(c));
      const assign = el('button', { type: 'button', class: 'btn-sm' }, c.assigned_to ? 'Reassign' : 'Assign');
      assign.addEventListener('click', () => void assignComplaint(c));
      const extras = [];
      if (barangay && municipality) {
        const place = `Barangay ${barangay}, ${municipality}, Occidental Mindoro`;
        extras.push(el('a', { class: 'btn-sm', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`,
          target: '_blank', rel: 'noopener noreferrer', title: `Open ${place} in Google Maps` }, 'Directions'));
      }
      if (c.photo_paths && c.photo_paths.length && window.adminFeatures) {
        const photos = el('button', { type: 'button', class: 'btn-sm' }, `Photos (${c.photo_paths.length})`);
        photos.addEventListener('click', () => window.adminFeatures.showPhotos(c.photo_paths, `Photos · ${c.tracking_number}`));
        extras.push(photos);
      }
      return el('tr', {},
        el('td', {}, el('strong', {}, c.complaint_type), el('span', { class: 'cell-sub mono' }, c.tracking_number),
          el('span', { class: 'note-line' }, c.description.length > 90 ? `${c.description.slice(0, 90)}…` : c.description)),
        el('td', {}, user.full_name || '—', el('span', { class: 'cell-sub' }, user.mobile_number || user.email || '')),
        el('td', {}, municipality ? `${barangay || ''}${barangay ? ', ' : ''}${municipality}` : el('span', { class: 'not-set' }, 'Not set')),
        el('td', {}, fmtDate(c.created_at), el('span', { class: 'cell-sub' }, slaBadge(c))),
        el('td', {}, c.assigned_to ? el('span', { class: 'assignee' }, staffName(c.assigned_to)) : el('span', { class: 'assignee none' }, 'Unassigned')),
        el('td', {}, badge(label, kind),
          c.rating ? el('span', { class: 'cell-sub stars-small', title: c.rating_comment || '' }, `${'★'.repeat(c.rating)}${'☆'.repeat(5 - c.rating)}`) : null),
        el('td', {}, el('div', { class: 'row-actions' }, update, assign, ...extras)));
    }), {
      open: 'No open concerns. Nice work!',
      mine: 'Nothing assigned to you right now.',
      unassigned: 'Every open concern has someone on it.',
      overdue: 'No overdue concerns. 🎉'
    }[state.complaintTab] || 'Nothing here.');
    if (window.adminFeatures) window.adminFeatures.renderOutages(state.complaints);
    const overdue = state.complaints.filter(isOverdue).length;
    $('complaintOverdueCount').textContent = String(overdue);
    $('complaintOverdueCount').classList.toggle('hidden', !overdue);
  }

  // One-tap message templates for common concern updates: [label, message, suggested status].
  const QUICK_REPLIES = [
    ['Received', 'We received your report and our team is checking it. We will update you here.', 'under_review'],
    ['Lineman scheduled', 'A lineman is scheduled to visit your area. Please keep your contact number available.', 'in_progress'],
    ['Power restored', 'Power has been restored in your area. Thank you for your patience.', 'resolved'],
    ['Bill reviewed', 'We reviewed your bill. The amount is correct based on your meter reading and the current rates.', 'resolved'],
    ['Visit office', 'Please visit the nearest OMECO office with your latest bill so we can assist you in person.', 'in_progress']
  ];

  async function updateComplaint(complaint) {
    if (!needLive()) return;
    const statusSelect = el('select', {}, ...Object.entries(COMPLAINT_STATUS).map(([value, [label]]) => {
      const option = new Option(label, value);
      option.selected = value === complaint.status;
      return option;
    }));
    const note = el('textarea', { rows: '3', maxlength: '300', placeholder: 'Optional message to the customer, e.g. "Lineman scheduled tomorrow 9 AM."' });
    const done = await openModal({
      title: `Update concern ${complaint.tracking_number}`,
      confirmText: 'Save and notify customer',
      content: [
        el('p', { class: 'modal-summary' }, el('strong', {}, complaint.complaint_type), el('br'), complaint.description),
        field('Status', statusSelect),
        field('Message to customer', note),
        el('div', { class: 'quick-replies' },
          el('span', { class: 'quick-label' }, 'Quick replies'),
          ...QUICK_REPLIES.map(([label, text, status]) => {
            const chip = el('button', { type: 'button', class: 'quick-chip' }, label);
            chip.addEventListener('click', () => {
              note.value = text;
              if (status && COMPLAINT_STATUS[status]) statusSelect.value = status;
              note.focus();
            });
            return chip;
          }))
      ],
      onConfirm: () => supabaseClient.rpc('update_complaint_status', {
        p_complaint_id: complaint.id, p_status: statusSelect.value, p_note: note.value.trim() || null
      }, token())
    });
    if (done) {
      toast('Concern updated. The customer has been notified.', 'success');
      await showComplaints();
    }
  }

  async function assignComplaint(complaint) {
    if (!needLive()) return;
    if (!state.staff) await loadStaff().catch(() => { state.staff = []; });
    const select = el('select', {},
      new Option('Unassigned', ''),
      ...state.staff.map((s) => {
        const option = new Option(`${s.id === myId() ? `${s.name} (me)` : s.name}${s.department ? ` · ${s.department}` : ''}`, s.id);
        option.selected = s.id === complaint.assigned_to;
        return option;
      }));
    const done = await openModal({
      title: `Assign concern ${complaint.tracking_number}`,
      confirmText: 'Save',
      content: [
        el('p', { class: 'modal-summary' }, el('strong', {}, complaint.complaint_type), el('br'),
          'Target: ', complaint.due_by ? fmtDate(complaint.due_by) : '—', ' · ', slaBadge(complaint)),
        field('Assign to', select),
        el('p', { class: 'muted small' }, 'The staff member gets a notification. Every change is kept in the audit log.')
      ],
      onConfirm: () => supabaseClient.rpc('assign_complaint', { p_complaint_id: complaint.id, p_assignee: select.value || null }, token())
    });
    if (done) {
      toast(select.value ? `Assigned to ${staffName(select.value)}.` : 'Concern is now unassigned.', 'success');
      await showComplaints();
    }
  }

  // ---------------------------------------------------------------- announcements
  async function showAnnouncements() {
    if (!live()) return;
    try {
      await Promise.all([loadAnnouncements(), ensureCoverage()]);
    } catch (error) {
      toast(`Could not load announcements: ${error.message}`, 'error');
      return;
    }
    const areaSelect = $('announcementArea');
    const current = areaSelect.value;
    areaSelect.replaceChildren(new Option('All service areas', ''), ...[...coverage.keys()].map((m) => new Option(m, m)));
    areaSelect.value = current;
    renderAnnouncements();
  }

  function fmtDateTime(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function renderAnnouncements() {
    const list = $('announcementAdminList');
    list.replaceChildren(...state.announcements.map((a) => {
      const toggle = el('button', { type: 'button', class: 'btn-sm' }, a.is_published ? 'Unpublish' : 'Publish');
      const remove = el('button', { type: 'button', class: 'btn-sm reject' }, 'Delete');
      toggle.addEventListener('click', () => void togglePublish(a));
      remove.addEventListener('click', () => void deleteAnnouncement(a));
      return el('article', { class: 'admin-item' },
        el('div', { class: 'admin-item-top' },
          el('div', {}, el('strong', {}, a.title),
            el('span', { class: 'cell-sub' }, `${a.category || 'General'} · ${a.affected_area || 'All service areas'}`),
            a.starts_at ? el('span', { class: 'cell-sub schedule-line' }, `Outage: ${fmtDateTime(a.starts_at)}${a.ends_at ? ` – ${fmtDateTime(a.ends_at)}` : ''}`) : null),
          el('div', { class: 'row-actions' },
            a.is_urgent ? badge('Urgent', 'warning') : null,
            a.is_published ? badge('Published', 'approved') : badge('Draft', 'neutral'))),
        el('p', {}, a.content),
        el('div', { class: 'admin-item-top' },
          el('span', { class: 'meta' }, a.is_published ? `Published ${fmtDate(a.published_at || a.created_at)}` : `Created ${fmtDate(a.created_at)}`),
          el('div', { class: 'row-actions' }, toggle, remove)));
    }));
    $('announcementAdminEmpty').classList.toggle('hidden', state.announcements.length > 0);
  }

  $('announcementForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!needLive()) return;
    const title = $('announcementTitle').value.trim();
    const content = $('announcementContent').value.trim();
    if (title.length < 3 || content.length < 10) {
      toast('Please enter a title and a message of at least 10 characters.', 'error');
      return;
    }
    const publish = $('announcementPublish').checked;
    // Optional outage window (local time in the form -> exact time saved).
    const startsAt = $('announcementStarts').value ? new Date($('announcementStarts').value).toISOString() : null;
    const endsAt = $('announcementEnds').value ? new Date($('announcementEnds').value).toISOString() : null;
    if (endsAt && !startsAt) { toast('Set when the outage starts, too.', 'error'); return; }
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) { toast('The outage must end after it starts.', 'error'); return; }
    const button = $('announcementSubmit');
    button.disabled = true;
    try {
      await supabaseClient.insert('announcements', {
        title,
        content,
        category: $('announcementCategory').value,
        affected_area: $('announcementArea').value || null,
        is_urgent: $('announcementUrgent').checked,
        is_published: publish,
        published_at: publish ? new Date().toISOString() : null,
        starts_at: startsAt,
        ends_at: endsAt
      }, token());
      $('announcementForm').reset();
      $('announcementPublish').checked = true;
      toast(publish ? 'Announcement published. Customers in that area have been alerted.' : 'Saved as draft.', 'success');
      await showAnnouncements();
    } catch (error) {
      toast(`Could not save the announcement: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('announcementPublish').addEventListener('change', () => {
    $('announcementSubmit').textContent = $('announcementPublish').checked ? 'Publish announcement' : 'Save as draft';
  });

  async function togglePublish(announcement) {
    if (!needLive()) return;
    try {
      const publish = !announcement.is_published;
      await supabaseClient.update(`announcements?id=eq.${announcement.id}`, {
        is_published: publish,
        published_at: publish ? new Date().toISOString() : announcement.published_at
      }, token());
      toast(publish ? 'Published. Customers in that area have been alerted.' : 'Unpublished. Customers no longer see it.', 'success');
      await showAnnouncements();
    } catch (error) {
      toast(`Could not update: ${error.message}`, 'error');
    }
  }

  async function deleteAnnouncement(announcement) {
    if (!needLive()) return;
    const done = await openModal({
      title: 'Delete announcement?',
      confirmText: 'Delete',
      danger: true,
      content: [el('p', { class: 'modal-summary' }, el('strong', {}, announcement.title), el('br'),
        'This cannot be undone. Customers will no longer see it.')],
      onConfirm: () => supabaseClient.remove(`announcements?id=eq.${announcement.id}`, token())
    });
    if (done) {
      toast('Announcement deleted.', 'success');
      await showAnnouncements();
    }
  }

  // ---------------------------------------------------------------- bills
  async function showBills() {
    if (!live()) return;
    try {
      await loadBills();
    } catch (error) {
      toast(`Could not load bills: ${error.message}`, 'error');
      return;
    }
    const select = $('billAccount');
    const chosen = select.value; // keep the admin's choice when the list refreshes live
    select.replaceChildren(
      new Option(state.verifiedAccounts.length ? 'Choose a verified account' : 'No verified accounts yet', ''),
      ...state.verifiedAccounts.map((a) => new Option(
        `${a.account_number} · ${(a.users && a.users.full_name) || 'Unlinked'}${a.service_area ? ` (${a.service_area})` : ''}`, a.id)));
    if (chosen && state.verifiedAccounts.some((a) => a.id === chosen)) select.value = chosen;
    $('billFormHint').textContent = state.verifiedAccounts.length
      ? ''
      : 'Approve a customer in Verification first. Only verified accounts can receive bills.';
    renderBills();
  }

  function renderBills() {
    setRows('billRows', 'billEmpty', state.bills.map((b) => {
      const paid = String(b.status).toLowerCase() === 'paid';
      const markPaid = el('button', { type: 'button', class: 'btn-sm' }, 'Mark paid');
      markPaid.disabled = paid;
      markPaid.addEventListener('click', () => void markBillPaid(b));
      const receipt = el('button', { type: 'button', class: 'btn-sm' }, 'Statement');
      receipt.addEventListener('click', () => window.adminFeatures && window.adminFeatures.showStatement(b.id));
      return el('tr', {},
        el('td', {}, el('strong', { class: 'mono' }, (b.customer_accounts && b.customer_accounts.account_number) || '—'),
          el('span', { class: 'cell-sub' }, (b.customer_accounts && b.customer_accounts.users && b.customer_accounts.users.full_name) || '')),
        el('td', {}, b.billing_month),
        el('td', {}, b.due_date ? fmtDate(b.due_date, false) : '—'),
        el('td', { class: 'mono' }, peso(b.total_amount),
          el('span', { class: 'cell-sub' }, b.consumption_kwh ? `${b.consumption_kwh} kWh` : '')),
        el('td', {}, paid ? badge('Paid', 'approved') : badge('Unpaid', 'pending')),
        el('td', {}, el('div', { class: 'row-actions' }, receipt, markPaid)));
    }), 'No bills yet.');
  }

  $('billForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!needLive()) return;
    const accountId = $('billAccount').value;
    const month = $('billMonth').value;
    const due = $('billDue').value;
    const amount = Number($('billAmount').value);
    if (!accountId || !month || !due || !(amount >= 0)) {
      toast('Choose an account and fill in month, due date and amount.', 'error');
      return;
    }
    const [year, monthNumber] = month.split('-').map(Number);
    const monthLabel = new Date(year, monthNumber - 1, 1).toLocaleString('en-PH', { month: 'long', year: 'numeric' });
    try {
      await supabaseClient.insert('electricity_bills', {
        customer_account_id: accountId,
        billing_month: monthLabel,
        due_date: due,
        total_amount: amount,
        outstanding_balance: amount,
        consumption_kwh: $('billKwh').value ? Number($('billKwh').value) : null,
        charges: window.adminFeatures ? window.adminFeatures.readCharges() : null,
        status: 'unpaid',
        ...(window.adminFeatures ? window.adminFeatures.readBillDetails(amount) : {})
      }, token());
      $('billForm').reset();
      if (window.adminFeatures) window.adminFeatures.resetBillDetails();
      toast('Bill added. The customer has been notified.', 'success');
      await showBills();
    } catch (error) {
      toast(`Could not add the bill: ${error.message}`, 'error');
    }
  });

  async function markBillPaid(bill) {
    if (!needLive()) return;
    const done = await openModal({
      title: 'Mark bill as paid?',
      confirmText: 'Mark paid',
      content: [el('p', { class: 'modal-summary' },
        `${bill.billing_month} · ${peso(bill.total_amount)}`, el('br'),
        'The outstanding balance will be set to ₱0.00.')],
      onConfirm: () => supabaseClient.update(`electricity_bills?id=eq.${bill.id}`, { status: 'paid', outstanding_balance: 0 }, token())
    });
    if (done) {
      toast('Bill marked as paid.', 'success');
      await showBills();
    }
  }

  // ---------------------------------------------------------------- CSV bill import
  // The file is read in the browser, checked by the server (import_bills with
  // p_commit = false), shown as a preview, and only saved after "Import".
  const IMPORT_COLUMNS = ['account_number', 'billing_month', 'due_date', 'total_amount', 'consumption_kwh'];
  const COLUMN_ALIASES = {
    account: 'account_number', account_no: 'account_number', accountno: 'account_number', account_number: 'account_number',
    month: 'billing_month', billing_month: 'billing_month', period: 'billing_month',
    due: 'due_date', due_date: 'due_date',
    amount: 'total_amount', total: 'total_amount', total_amount: 'total_amount', amount_due: 'total_amount',
    kwh: 'consumption_kwh', consumption: 'consumption_kwh', consumption_kwh: 'consumption_kwh',
    // optional charge breakdown columns
    generation: 'generation', transmission: 'transmission', system_loss: 'system_loss', distribution: 'distribution',
    subsidies: 'subsidies', universal: 'universal', universal_charges: 'universal', taxes: 'taxes', vat: 'taxes', other_charges: 'other_charges', others: 'other_charges'
  };
  let importRows = null;

  function parseCsv(text) {
    const clean = text.replace(/^﻿/, '');
    const firstLine = clean.split(/\r?\n/, 1)[0] || '';
    const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < clean.length; i += 1) {
      const ch = clean[i];
      if (quoted) {
        if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delimiter) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && clean[i + 1] === '\n') i += 1;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }

  function csvToBillRows(text) {
    const table = parseCsv(text);
    if (table.length < 2) throw new Error('The file has no bill rows.');
    const header = table[0].map((h) => COLUMN_ALIASES[h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')] || null);
    const missing = IMPORT_COLUMNS.slice(0, 4).filter((c) => !header.includes(c));
    if (missing.length) throw new Error(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Use "Download template".`);
    if (table.length - 1 > 2000) throw new Error(`The file has ${table.length - 1} rows. Import at most 2000 at a time.`);
    return table.slice(1).map((cells) => {
      const item = {};
      header.forEach((name, index) => { if (name) item[name] = (cells[index] || '').trim(); });
      return item;
    });
  }

  function resetImport() {
    importRows = null;
    $('billCsv').value = '';
    $('billCsvName').textContent = '';
    $('billImportRows').replaceChildren();
    ['billImportPreview', 'billImportSummary', 'billImportButton', 'billImportClear'].forEach((id) => $(id).classList.add('hidden'));
  }

  function renderImportResult(result, saved) {
    const bad = result.total - result.valid;
    const summary = $('billImportSummary');
    summary.replaceChildren(
      saved
        ? el('span', { class: 'ok' }, `✓ Imported ${result.saved} bill${result.saved === 1 ? '' : 's'}. Customers have been notified.`)
        : el('span', { class: result.valid ? 'ok' : 'bad' }, `${result.valid} of ${result.total} rows ready to import`),
      bad ? el('span', {}, ' · ', el('span', { class: 'bad' }, `${bad} row${bad === 1 ? '' : 's'} ${saved ? 'skipped' : 'will be skipped'}`), ' (see the reason in red)') : '');
    summary.classList.remove('hidden');
    $('billImportRows').replaceChildren(...result.rows.map((r) => el('tr', { class: r.ok ? '' : 'row-bad' },
      el('td', {}, String(r.row + 1)),
      el('td', { class: 'mono' }, r.account_number || '—'),
      el('td', {}, r.billing_month || '—'),
      el('td', {}, r.due_date ? fmtDate(r.due_date, false) : '—'),
      el('td', { class: 'mono' }, r.total_amount === null ? '—' : peso(r.total_amount)),
      el('td', {}, r.consumption_kwh === null ? '—' : String(r.consumption_kwh)),
      r.ok ? el('td', {}, badge(saved ? 'Imported' : 'OK', 'approved')) : el('td', { class: 'err' }, r.error))));
    $('billImportPreview').classList.remove('hidden');
    $('billImportClear').classList.remove('hidden');
    $('billImportButton').classList.toggle('hidden', saved || !result.valid);
    $('billImportButton').textContent = `Import ${result.valid} bill${result.valid === 1 ? '' : 's'}`;
  }

  $('billCsv').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!needLive()) { resetImport(); return; }
    if (file.size > 2 * 1024 * 1024) { toast('That file is too large (max 2 MB).', 'error'); resetImport(); return; }
    $('billCsvName').textContent = file.name;
    try {
      importRows = csvToBillRows(await file.text());
      const result = await supabaseClient.rpc('import_bills', { p_rows: importRows, p_commit: false }, token());
      renderImportResult(result, false);
    } catch (error) {
      toast(`Could not read the CSV: ${error.message}`, 'error');
      resetImport();
    }
  });

  $('billImportButton').addEventListener('click', async () => {
    if (!importRows || !needLive()) return;
    const button = $('billImportButton');
    button.disabled = true;
    try {
      const result = await supabaseClient.rpc('import_bills', { p_rows: importRows, p_commit: true }, token());
      importRows = null;
      renderImportResult(result, true);
      toast(`Imported ${result.saved} bill${result.saved === 1 ? '' : 's'}.`, 'success');
      await showBills();
    } catch (error) {
      toast(`Import failed, nothing was saved: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('billImportClear').addEventListener('click', resetImport);

  $('billTemplate').addEventListener('click', () => {
    const sample = state.verifiedAccounts[0] ? state.verifiedAccounts[0].account_number : 'OMECO-0000';
    const lines = [IMPORT_COLUMNS.join(','), `${sample},2026-08,2026-09-15,2105.60,188`];
    const blob = new Blob([`﻿${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
    const link = el('a', { href: URL.createObjectURL(blob), download: 'omeco-bills-template.csv' });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  // ---------------------------------------------------------------- reports
  async function loadReportData() {
    await Promise.all([loadRequests(), loadComplaints(), loadCustomers(), ensureCoverage()]);
  }

  function reportTables() {
    const areaRows = [...coverage.keys(), null].map((municipality) => {
      const inArea = customers.filter((c) => (c.municipality || null) === municipality);
      return {
        municipality: municipality || 'No location set',
        total: inArea.length,
        verified: inArea.filter((c) => accountStatus(c).key === 'verified').length,
        pending: inArea.filter((c) => accountStatus(c).key === 'pending').length
      };
    });
    const types = [...new Set(state.complaints.map((c) => c.complaint_type))].sort();
    const concernRows = types.map((type) => {
      const ofType = state.complaints.filter((c) => c.complaint_type === type);
      const open = ofType.filter((c) => OPEN_COMPLAINT(c.status)).length;
      return { type, open, closed: ofType.length - open, total: ofType.length };
    });
    return { areaRows, concernRows };
  }

  async function showReports() {
    if (!live()) return;
    try {
      await loadReportData();
    } catch (error) {
      toast(`Could not load reports: ${error.message}`, 'error');
      return;
    }
    const { areaRows, concernRows } = reportTables();
    $('reportAreaRows').replaceChildren(...areaRows.map((r) => el('tr', {},
      el('td', {}, r.municipality), el('td', {}, String(r.total)), el('td', {}, String(r.verified)), el('td', {}, String(r.pending)))));
    $('reportConcernRows').replaceChildren(...(concernRows.length ? concernRows.map((r) => el('tr', {},
      el('td', {}, r.type), el('td', {}, String(r.open)), el('td', {}, String(r.closed)), el('td', {}, String(r.total))))
      : [el('tr', {}, el('td', { colspan: '4', class: 'muted' }, 'No concerns yet.'))]));
  }

  async function exportReport() {
    if (!needLive()) return;
    try {
      await loadReportData();
    } catch (error) {
      toast(`Could not build the report: ${error.message}`, 'error');
      return;
    }
    const { areaRows, concernRows } = reportTables();
    const cell = (value) => {
      const text = String(value ?? '');
      return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
    };
    const lines = [
      ['OMECOnnect report', new Date().toLocaleString('en-PH')],
      [],
      ['Summary'],
      ['Total customers', customers.length],
      ['Pending verifications', state.requests.filter((r) => r.status === 'pending').length],
      ['Open concerns', state.complaints.filter((c) => OPEN_COMPLAINT(c.status)).length],
      [],
      ['Customers by municipality'],
      ['Municipality', 'Customers', 'Verified', 'Pending'],
      ...areaRows.map((r) => [r.municipality, r.total, r.verified, r.pending]),
      [],
      ['Concerns by type'],
      ['Type', 'Open', 'Resolved / closed', 'Total'],
      ...concernRows.map((r) => [r.type, r.open, r.closed, r.total])
    ].map((line) => line.map(cell).join(','));
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const link = el('a', { href: URL.createObjectURL(blob), download: `omeconnect-report-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast('Report downloaded.', 'success');
  }

  // ---------------------------------------------------------------- security
  async function showSecurity() {
    if (!live()) return;
    let admins;
    let audit;
    let errors;
    try {
      [admins, audit, errors] = await Promise.all([
        supabaseClient.select('admin_accounts?select=user_id,role,employee_id,department,created_at,users(full_name,email)&order=created_at.asc', token()),
        supabaseClient.select('audit_logs?select=created_at,action,entity_type,details,users(full_name,email)&order=created_at.desc&limit=50', token()),
        supabaseClient.select('system_logs?select=created_at,message,metadata&level=eq.client_error&order=created_at.desc&limit=50', token())
      ]);
    } catch (error) {
      toast(`Could not load security data: ${error.message}`, 'error');
      return;
    }
    $('adminRows').replaceChildren(...admins.map((a) => el('tr', {},
      el('td', {}, (a.users && a.users.full_name) || '—'),
      el('td', {}, (a.users && a.users.email) || '—'),
      el('td', {}, window.adminFeatures ? window.adminFeatures.roleCell(a) : (a.role || '—')),
      el('td', {}, [a.department, a.employee_id].filter(Boolean).join(' · ') || '—'),
      el('td', {}, fmtDate(a.created_at, false)),
      el('td', {}, window.adminFeatures ? window.adminFeatures.staffActions(a) : ''))));
    if (window.adminFeatures) void window.adminFeatures.showBackups();
    const describe = (entry) => {
      const d = entry.details || {};
      return [d.account_number, d.tracking_number, d.title, d.billing_month, d.reason, d.from && d.to ? `${d.from} → ${d.to}` : d.to ? `→ ${d.to}` : null, d.area]
        .filter(Boolean).join(' · ');
    };
    setRows('auditRows', 'auditEmpty', audit.map((entry) => el('tr', {},
      el('td', {}, fmtDate(entry.created_at)),
      el('td', {}, (entry.users && (entry.users.full_name || entry.users.email)) || 'System'),
      el('td', { class: 'mono' }, entry.action),
      el('td', {}, describe(entry) || '—'))), 'No admin actions recorded yet.');
    // Short device description from the browser's user agent.
    const device = (ua) => {
      const s = String(ua || '');
      const os = /Android/i.test(s) ? 'Android' : /iPhone|iPad/i.test(s) ? 'iPhone' : /Windows/i.test(s) ? 'Windows' : /Mac OS/i.test(s) ? 'Mac' : 'Other';
      const browser = /SamsungBrowser/i.test(s) ? 'Samsung Internet' : /Edg\//i.test(s) ? 'Edge' : /Chrome/i.test(s) ? 'Chrome' : /Safari/i.test(s) ? 'Safari' : /Firefox/i.test(s) ? 'Firefox' : '';
      return [os, browser].filter(Boolean).join(' · ');
    };
    setRows('errorRows', 'errorEmpty', (errors || []).map((entry) => {
      const m = entry.metadata || {};
      return el('tr', {},
        el('td', {}, fmtDate(entry.created_at)),
        el('td', {}, m.app === 'admin' ? 'Admin' : 'Customer'),
        el('td', { class: 'mono' }, m.page || '—'),
        el('td', { title: m.source || '' }, entry.message),
        el('td', {}, device(m.user_agent)));
    }), 'No app errors reported. 🎉');
  }

  // ---------------------------------------------------------------- wiring
  const views = {
    overviewView: showOverview,
    verificationView: showVerification,
    complaintsView: showComplaints,
    announcementsView: showAnnouncements,
    billsView: showBills,
    reportsView: showReports,
    securityView: showSecurity
  };
  window.adminViews = views;
  window.adminCtx = {
    state, $, el, toast, openModal, field, badge, fmtDate, peso, setRows, token, myId, live, needLive,
    views, showComplaints, showSecurity, showBills, refreshActiveView
  };

  document.addEventListener('click', (event) => {
    const go = event.target.closest('[data-go]');
    if (go) {
      setView(go.dataset.go);
      if (go.dataset.focus) setTimeout(() => $(go.dataset.focus) && $(go.dataset.focus).focus(), 300);
      return;
    }
    if (event.target.closest('[data-export-report]')) {
      void exportReport();
      return;
    }
    const refresh = event.target.closest('[data-refresh]');
    if (refresh) {
      void (refresh.dataset.refresh === 'verification' ? showVerification() : showComplaints());
    }
  });

  $('verificationTabs').addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (!tab) return;
    state.verificationTab = tab.dataset.status;
    $('verificationTabs').querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    renderVerification();
  });

  $('complaintTabs').addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (!tab) return;
    state.complaintTab = tab.dataset.status;
    $('complaintTabs').querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    renderComplaints();
  });

  $('bellButton').addEventListener('click', () => {
    if (bellPanel.classList.contains('open')) closeBell();
    else openBell();
  });

  $('bellMarkRead').addEventListener('click', async () => {
    if (!live()) return;
    try {
      await supabaseClient.update(`notifications?user_id=eq.${myId()}&is_read=eq.false`, { is_read: true }, token());
      state.notifications.forEach((n) => { n.is_read = true; });
      state.knownUnread = 0;
      renderBell();
    } catch (error) {
      toast(`Could not mark as read: ${error.message}`, 'error');
    }
  });

  // ---------------------------------------------------------------- live updates
  // Supabase Realtime pushes every change (new verification request, concern,
  // payment, …) so the dashboard updates at once; the 30 s check stays as a
  // safety net. The sign-in is renewed before it expires (1 hour) and kept for
  // this browser tab only, so an update reload does not sign the admin out.
  const SESSION_KEY = 'omeconnect.admin.session';
  const LIVE_TABLES = [
    'account_verification_requests', 'complaints', 'meter_readings', 'complaint_status_history', 'notifications',
    'announcements', 'electricity_bills', 'payments', 'customer_accounts', 'users'
  ];
  let liveUpdates = null;
  let keeperTimer = null;
  let liveTimer = null;
  let viewRefreshPending = false;

  function saveSession() {
    try { if (session && session.refresh_token) sessionStorage.setItem(SESSION_KEY, session.refresh_token); } catch { /* ignore */ }
  }
  function forgetSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }

  // Don't redraw the screen under the admin while they are typing or in a dialog.
  function editingNow() {
    const active = document.activeElement;
    const typing = active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && active.closest('.content.view.active');
    return Boolean(typing || $('modal').open);
  }
  function refreshCurrentView() {
    viewRefreshPending = false;
    refreshActiveView();
    const active = document.querySelector('.content.view.active');
    if (active && active.id === 'customersView' && typeof loadCustomers === 'function') void loadCustomers();
  }
  function onLiveChange() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(async () => {
      await poll();
      if (editingNow()) viewRefreshPending = true;
      else refreshCurrentView();
    }, 400);
  }
  document.addEventListener('focusout', () => {
    setTimeout(() => { if (viewRefreshPending && !editingNow()) refreshCurrentView(); }, 300);
  });
  $('modal').addEventListener('close', () => {
    setTimeout(() => { if (viewRefreshPending && !editingNow()) refreshCurrentView(); }, 300);
  });

  async function keepSessionFresh(force = false) {
    if (!live() || !session.refresh_token) return;
    const expiresAt = Number(session.expires_at || 0) * 1000;
    if (!force && expiresAt && expiresAt - Date.now() > 5 * 60 * 1000) return;
    try {
      const fresh = await supabaseClient.refreshSession(session.refresh_token);
      if (!fresh || !fresh.access_token) return;
      Object.assign(session, fresh);
      saveSession();
      if (liveUpdates) liveUpdates.setToken(session.access_token);
    } catch (error) {
      console.warn('Could not renew the sign-in:', error.message);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && live()) void keepSessionFresh().then(() => poll());
  });

  function startLive() {
    if (!live() || !window.OMECO_LIVE) return;
    saveSession();
    clearInterval(keeperTimer);
    keeperTimer = setInterval(() => void keepSessionFresh(), 60000);
    if (!liveUpdates) liveUpdates = window.OMECO_LIVE.createLiveUpdates({ tables: LIVE_TABLES, onChange: onLiveChange });
    liveUpdates.start(session.access_token);
  }
  function stopLive() {
    clearInterval(keeperTimer);
    keeperTimer = null;
    clearTimeout(liveTimer);
    viewRefreshPending = false;
    if (liveUpdates) liveUpdates.stop();
    forgetSession();
  }

  window.adminOnSignIn = async () => {
    state.knownUnread = null;
    if (!live()) {
      toast('Demo mode: sample data only. Connect Supabase to manage real records.');
      return;
    }
    startLive();
    if (window.adminFeatures) await window.adminFeatures.onSignIn();
    await poll({ quiet: true });
    const pending = state.requests.filter((r) => r.status === 'pending').length;
    if (pending) toast(`🔔 ${pending} verification request${pending === 1 ? '' : 's'} waiting for review.`);
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => void poll(), POLL_MS);
  };

  window.adminOnSignOut = () => {
    closeBell({ restoreFocus: false });
    stopLive();
    clearInterval(state.pollTimer);
    state.pollTimer = null;
    Object.assign(state, { requests: [], complaints: [], announcements: [], bills: [], notifications: [], knownUnread: null, staff: null });
    window.pendingRequestsByUser = new Map();
    renderBell();
  };

  // ---------------------------------------------------------------- start-up
  if (window.OMECO_LIVE) {
    window.OMECO_LIVE.requireOnline({
      appName: 'The OMECOnnect admin dashboard',
      onBackOnline: () => { if (live()) void keepSessionFresh().then(() => { void poll(); refreshCurrentView(); }); }
    });
    window.OMECO_LIVE.watchForNewVersion();
  }

  // After a reload (e.g. a new version), sign the admin back in for this tab.
  (async () => {
    if (demoMode || !supabaseClient) return;
    let refreshToken = null;
    try { refreshToken = sessionStorage.getItem(SESSION_KEY); } catch { return; }
    if (!refreshToken) return;
    forgetSession();
    try {
      const fresh = await supabaseClient.refreshSession(refreshToken);
      if (!fresh || !fresh.access_token) return;
      if ((await supabaseClient.isAdmin(fresh.access_token)) !== true) return;
      session = fresh;
      setScreen('dashboard');
      await window.adminOnSignIn();
      setView('overviewView');
    } catch {
      // Expired or revoked: the admin simply signs in again.
    }
  })();
})();
