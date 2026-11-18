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
    pollTimer: null
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
      'account_verification_requests?select=id,user_id,account_number,status,created_at,reviewed_at,review_note&order=created_at.desc&limit=300',
      token());
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
      'users(full_name,email,mobile_number,municipality,barangay)&order=created_at.desc&limit=300', token());
  }

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

  function renderBell() {
    const unread = state.notifications.filter((n) => !n.is_read);
    $('bellCount').textContent = String(unread.length);
    $('bellCount').classList.toggle('hidden', !unread.length);
    const list = $('bellList');
    if (!state.notifications.length) {
      list.replaceChildren(el('p', { class: 'bell-empty' }, 'No notifications yet. New verification requests and concerns appear here.'));
      return;
    }
    list.replaceChildren(...state.notifications.map((n) => {
      const item = el('button', { type: 'button', class: `bell-item${n.is_read ? '' : ' unread'}` },
        el('strong', {}, n.title), el('span', {}, n.message), el('small', {}, fmtDate(n.created_at)));
      item.addEventListener('click', async () => {
        $('bellPanel').classList.add('hidden');
        $('bellButton').setAttribute('aria-expanded', 'false');
        if (!n.is_read) {
          await supabaseClient.update(`notifications?id=eq.${n.id}`, { is_read: true }, token()).catch(() => {});
          n.is_read = true;
          renderBell();
        }
        if (n.type === 'admin_verification') setView('verificationView');
        else if (n.type === 'admin_complaint') setView('complaintsView');
      });
      return item;
    }));
  }

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
      const [label, kind] = REQUEST_STATUS[r.status] || [r.status, 'neutral'];
      const actions = el('div', { class: 'row-actions' });
      if (r.status === 'pending') {
        const approve = el('button', { type: 'button', class: 'btn-sm approve' }, 'Approve');
        const reject = el('button', { type: 'button', class: 'btn-sm reject' }, 'Reject');
        approve.addEventListener('click', () => void approveRequest(r));
        reject.addEventListener('click', () => void rejectRequest(r));
        actions.append(approve, reject);
      } else {
        actions.append(el('span', { class: 'cell-sub' }, `Reviewed ${fmtDate(r.reviewed_at, false)}`));
      }
      return el('tr', {},
        el('td', {}, el('strong', {}, user.full_name || '—'),
          el('span', { class: 'cell-sub' }, [user.email, user.mobile_number].filter(Boolean).join(' · '))),
        el('td', {}, user.municipality ? `${user.barangay}, ${user.municipality}` : el('span', { class: 'not-set' }, 'Not set')),
        el('td', { class: 'mono' }, r.account_number),
        el('td', {}, fmtDate(r.created_at)),
        el('td', {}, badge(label, kind), r.review_note ? el('span', { class: 'note-line' }, r.review_note) : null),
        el('td', {}, actions));
    }), state.verificationTab === 'pending' ? 'No pending requests. You are all caught up.' : 'Nothing here.');
  }

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
      await loadComplaints();
    } catch (error) {
      toast(`Could not load concerns: ${error.message}`, 'error');
      return;
    }
    renderBadges();
    renderComplaints();
  }

  function renderComplaints() {
    const rows = state.complaints.filter((c) =>
      state.complaintTab === 'open' ? OPEN_COMPLAINT(c.status)
        : state.complaintTab === 'resolved' ? !OPEN_COMPLAINT(c.status) : true);
    setRows('complaintRows', 'complaintEmpty', rows.map((c) => {
      const [label, kind] = COMPLAINT_STATUS[c.status] || [c.status, 'info'];
      const user = c.users || {};
      const municipality = c.municipality || user.municipality;
      const barangay = c.barangay || user.barangay;
      const update = el('button', { type: 'button', class: 'btn-sm primary' }, 'Update');
      update.addEventListener('click', () => void updateComplaint(c));
      return el('tr', {},
        el('td', {}, el('strong', {}, c.complaint_type), el('span', { class: 'cell-sub mono' }, c.tracking_number),
          el('span', { class: 'note-line' }, c.description.length > 90 ? `${c.description.slice(0, 90)}…` : c.description)),
        el('td', {}, user.full_name || '—', el('span', { class: 'cell-sub' }, user.mobile_number || user.email || '')),
        el('td', {}, municipality ? `${barangay || ''}${barangay ? ', ' : ''}${municipality}` : el('span', { class: 'not-set' }, 'Not set')),
        el('td', {}, fmtDate(c.created_at)),
        el('td', {}, badge(label, kind)),
        el('td', {}, el('div', { class: 'row-actions' }, update)));
    }), state.complaintTab === 'open' ? 'No open concerns. Nice work!' : 'Nothing here.');
  }

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
        field('Message to customer', note)
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
            el('span', { class: 'cell-sub' }, `${a.category || 'General'} · ${a.affected_area || 'All service areas'}`)),
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
        published_at: publish ? new Date().toISOString() : null
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
    select.replaceChildren(
      new Option(state.verifiedAccounts.length ? 'Choose a verified account' : 'No verified accounts yet', ''),
      ...state.verifiedAccounts.map((a) => new Option(
        `${a.account_number} · ${(a.users && a.users.full_name) || 'Unlinked'}${a.service_area ? ` (${a.service_area})` : ''}`, a.id)));
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
      return el('tr', {},
        el('td', {}, el('strong', { class: 'mono' }, (b.customer_accounts && b.customer_accounts.account_number) || '—'),
          el('span', { class: 'cell-sub' }, (b.customer_accounts && b.customer_accounts.users && b.customer_accounts.users.full_name) || '')),
        el('td', {}, b.billing_month),
        el('td', {}, b.due_date ? fmtDate(b.due_date, false) : '—'),
        el('td', { class: 'mono' }, peso(b.total_amount),
          el('span', { class: 'cell-sub' }, b.consumption_kwh ? `${b.consumption_kwh} kWh` : '')),
        el('td', {}, paid ? badge('Paid', 'approved') : badge('Unpaid', 'pending')),
        el('td', {}, el('div', { class: 'row-actions' }, markPaid)));
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
        status: 'unpaid'
      }, token());
      $('billForm').reset();
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
    try {
      [admins, audit] = await Promise.all([
        supabaseClient.select('admin_accounts?select=employee_id,department,created_at,users(full_name,email)&order=created_at.asc', token()),
        supabaseClient.select('audit_logs?select=created_at,action,entity_type,details,users(full_name,email)&order=created_at.desc&limit=50', token())
      ]);
    } catch (error) {
      toast(`Could not load security data: ${error.message}`, 'error');
      return;
    }
    $('adminRows').replaceChildren(...admins.map((a) => el('tr', {},
      el('td', {}, (a.users && a.users.full_name) || '—'),
      el('td', {}, (a.users && a.users.email) || '—'),
      el('td', { class: 'mono' }, a.employee_id || '—'),
      el('td', {}, a.department || '—'),
      el('td', {}, fmtDate(a.created_at, false)))));
    const describe = (entry) => {
      const d = entry.details || {};
      return [d.account_number, d.tracking_number, d.title, d.billing_month, d.reason, d.from && d.to ? `${d.from} → ${d.to}` : null, d.area]
        .filter(Boolean).join(' · ');
    };
    setRows('auditRows', 'auditEmpty', audit.map((entry) => el('tr', {},
      el('td', {}, fmtDate(entry.created_at)),
      el('td', {}, (entry.users && (entry.users.full_name || entry.users.email)) || 'System'),
      el('td', { class: 'mono' }, entry.action),
      el('td', {}, describe(entry) || '—'))), 'No admin actions recorded yet.');
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
    if (!event.target.closest('.bell-wrap')) {
      $('bellPanel').classList.add('hidden');
      $('bellButton').setAttribute('aria-expanded', 'false');
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
    const panel = $('bellPanel');
    const opening = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !opening);
    $('bellButton').setAttribute('aria-expanded', String(opening));
    if (opening && !live()) {
      $('bellList').replaceChildren(el('p', { class: 'bell-empty' }, 'Notifications need a real Supabase connection.'));
    }
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

  window.adminOnSignIn = async () => {
    state.knownUnread = null;
    if (!live()) {
      toast('Demo mode: sample data only. Connect Supabase to manage real records.');
      return;
    }
    await poll({ quiet: true });
    const pending = state.requests.filter((r) => r.status === 'pending').length;
    if (pending) toast(`🔔 ${pending} verification request${pending === 1 ? '' : 's'} waiting for review.`);
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => void poll(), POLL_MS);
  };

  window.adminOnSignOut = () => {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
    Object.assign(state, { requests: [], complaints: [], announcements: [], bills: [], notifications: [], knownUnread: null });
    window.pendingRequestsByUser = new Map();
    renderBell();
  };
})();
