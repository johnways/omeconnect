const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, LevelFormat, PageBreak, Footer, Header, PageNumber, TabStopType
} = require('docx');

const FONT = 'Arial';
const NAVY = '0B2E6B';
const AMBER = 'F5A300';
const GREY = '5B6473';
const CONTENT = 9026; // A4 width 11906 - 2 x 1440 margins

// ---------------------------------------------------------------- helpers
const t = (text, o = {}) => new TextRun({ text, font: FONT, ...o });
const p = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [t(children)], spacing: { after: 120 }, ...o });
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t(text)] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t(text)] });
const h3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [t(text)] });
const bullet = (children, level = 0) => new Paragraph({ numbering: { reference: 'bullets', level }, children: Array.isArray(children) ? children : [t(children)], spacing: { after: 60 } });
const numbered = (children) => new Paragraph({ numbering: { reference: 'steps', level: 0 }, children: Array.isArray(children) ? children : [t(children)], spacing: { after: 60 } });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
const rule = () => new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: AMBER, space: 1 } }, spacing: { after: 160 } });
const kv = (k, v) => p([t(`${k}: `, { bold: true }), t(v)]);

const border = { style: BorderStyle.SINGLE, size: 4, color: 'C9D3E0' };
const borders = { top: border, bottom: border, left: border, right: border };
function cell(children, width, o = {}) {
  const paras = (Array.isArray(children) ? children : [children]).map((c) => (typeof c === 'string' ? new Paragraph({ children: [t(c, o.run || {})], spacing: { after: 60 } }) : c));
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 110, right: 110 },
    children: paras
  });
}
function table(widths, header, rows) {
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, widths[i], { fill: NAVY, run: { bold: true, color: 'FFFFFF', size: 20 } })) }),
      ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i], { fill: ri % 2 ? 'F4F7FB' : undefined, run: { size: 20 } })) }))
    ]
  });
}
// A spoken line: italic quote with the speaker cue.
const say = (text) => new Paragraph({ children: [t(`“${text}”`, { size: 20, italics: true })], spacing: { after: 80 } });
const show = (text) => new Paragraph({ children: [t(text, { size: 20 })], spacing: { after: 60 } });

// Scene table: Time | On screen (what to click) | Say (script)
function scenes(list) {
  const W = [1050, 2900, 5076];
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: W,
    rows: [
      new TableRow({ tableHeader: true, children: ['Time', 'On screen (do this)', 'Say (script)'].map((h, i) => cell(h, W[i], { fill: NAVY, run: { bold: true, color: 'FFFFFF', size: 20 } })) }),
      ...list.map((s, ri) => new TableRow({
        cantSplit: true,
        children: [
          cell(s.time, W[0], { fill: ri % 2 ? 'F4F7FB' : undefined, run: { size: 20, bold: true } }),
          cell(s.show.map(show), W[1], { fill: ri % 2 ? 'F4F7FB' : undefined }),
          cell(s.say.map(say), W[2], { fill: ri % 2 ? 'F4F7FB' : undefined })
        ]
      }))
    ]
  });
}
const space = () => new Paragraph({ children: [], spacing: { after: 120 } });
const callout = (label, text) => new Table({
  width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [CONTENT],
  rows: [new TableRow({ children: [new TableCell({
    borders: { top: { style: BorderStyle.SINGLE, size: 4, color: AMBER }, bottom: { style: BorderStyle.SINGLE, size: 4, color: AMBER }, left: { style: BorderStyle.SINGLE, size: 24, color: AMBER }, right: { style: BorderStyle.SINGLE, size: 4, color: AMBER } },
    width: { size: CONTENT, type: WidthType.DXA }, shading: { fill: 'FFF7E6', type: ShadingType.CLEAR, color: 'auto' },
    margins: { top: 100, bottom: 100, left: 160, right: 160 },
    children: [new Paragraph({ children: [t(`${label} `, { bold: true, color: '8A5A00' }), t(text)], spacing: { after: 0 } })]
  })] })]
});

// ---------------------------------------------------------------- content
const children = [];

// Title page
children.push(
  new Paragraph({ spacing: { before: 2200, after: 200 }, alignment: AlignmentType.CENTER, children: [t('OMECOnnect', { bold: true, size: 64, color: NAVY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [t('Video Presentation Script', { size: 40, color: GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [t('Customer and Staff System for Occidental Mindoro Electric Cooperative (OMECO)', { size: 24, color: GREY })] }),
  rule(),
  table([3200, 5826], ['Role', 'Member (write the name)'], [
    ['Front-End Programmer', '______________________________'],
    ['Back-End Programmer 1', '______________________________'],
    ['Back-End Programmer 2', '______________________________'],
    ['Other member(s), if any', '______________________________']
  ]),
  space(),
  p([t('Total running time: ', { bold: true }), t('about 17 minutes. Every member speaks in the opening, in their own part, and in the closing.')], { alignment: AlignmentType.CENTER }),
  p([t('Live customer site: ', { bold: true }), t('https://omeconnect.vercel.app  ·  Staff console: private link (blur the address bar when recording).')], { alignment: AlignmentType.CENTER }),
  pageBreak()
);

// 1. Plan
children.push(
  h1('1. Presentation plan'),
  p('Each member explains and demonstrates their own responsibility. The table shows who speaks, what they cover, and the timing. Practice once with a stopwatch.'),
  table([1500, 2200, 3926, 1400], ['Part', 'Presenter', 'What is covered', 'Time'], [
    ['Opening', 'All members', 'Problem, goal of OMECOnnect, team roles', '0:00 – 1:30'],
    ['Part 1', 'Front-End Programmer', 'UI/UX for consumers, field staff and admins: bills, outages, due dates, concerns', '1:30 – 7:00'],
    ['Part 2', 'Back-End Programmer 1', 'Authenticated platform for residential, commercial and industrial consumers: sign-in, bills, rates, outage announcements, due-date reminders, APIs', '7:00 – 11:30'],
    ['Part 3', 'Back-End Programmer 2', 'Secure app: account management, reporting power interruptions, real-time billing alerts, security and reliability', '11:30 – 16:00'],
    ['Closing', 'All members', 'Summary, results, next steps', '16:00 – 17:00']
  ]),
  space(),
  h2('Before you record (checklist)'),
  bullet('Prepare demo accounts: one customer with a verified account and at least two bills (one with meter readings), and one staff account with the authenticator app on the phone.'),
  bullet('Make sure the electricity rate schedule is saved (Admin → Bills → Electricity rate).'),
  bullet('Have two windows ready side by side: the customer app (phone size) and the staff console, to show live updates.'),
  bullet('Turn on phone notifications for the customer app so the pop-up alert can be shown on a real phone.'),
  bullet('Use test data only. Never show passwords, authenticator codes, API keys, or real customers\' personal details on screen.'),
  bullet('Blur or crop the staff console\'s web address; it is a private link.'),
  bullet('Record in a quiet room, at 1080p, with the browser zoom at 100–110% so text is readable.'),
  callout('Tip:', 'Read the "Say" column naturally, not word for word. You may explain in Filipino or Taglish if that is more comfortable; keep the technical terms in English.'),
  pageBreak()
);

// 2. Opening
children.push(
  h1('2. Opening (all members)'),
  scenes([
    { time: '0:00', show: ['Title slide: OMECOnnect logo, team names.'], say: [
      'Good day! We are the developers of OMECOnnect, the customer and staff system for OMECO, the Occidental Mindoro Electric Cooperative.'
    ] },
    { time: '0:20', show: ['Slide: "The problem" — long lines at the office, missed due dates, outage information only on Facebook or radio, concerns that are hard to follow up.'], say: [
      'Many member-consumers still line up at the office to ask about their bill, miss their due date, or learn about a brownout too late. Concerns are reported by phone and are hard to follow up.',
      'OMECOnnect solves this with one mobile platform: consumers see their bills, due dates and outage announcements, report problems, and get real-time alerts, while OMECO staff manage everything in a secure console.'
    ] },
    { time: '0:55', show: ['Slide: team roles (one line each).'], say: [
      '[Front-End Programmer]: I designed and built the user interface and user experience for consumers, field staff and administrators.',
      '[Back-End Programmer 1]: I developed the user-authenticated platform where residential, commercial and industrial consumers track their bills, outage announcements and payment due dates.',
      '[Back-End Programmer 2]: I built the security side: account management, power-interruption reporting, and real-time billing alerts for member-consumers.'
    ] },
    { time: '1:20', show: ['Slide: tech stack — HTML/CSS/JavaScript, Supabase (PostgreSQL, Auth, Realtime, Edge Functions), Vercel, Docker.'], say: [
      'The app runs on the web and as an installable Android app. The back end uses Supabase, which gives us PostgreSQL, authentication, real-time updates and server functions. Let us show you how each part works.'
    ] }
  ]),
  pageBreak()
);

// 3. Front-end
children.push(
  h1('3. Part 1 — Front-End Programmer'),
  kv('Assigned task', 'To design an intuitive user interface (UI) for monitoring electric bills, power outage announcements, due dates, and consumer concerns for consumers, field staff, and admin users.'),
  kv('Time', '1:30 – 7:00 (about 5½ minutes)'),
  rule(),
  scenes([
    { time: '1:30', show: ['Customer app on a phone-size screen. Tap the moon/sun button, then the EN/FIL button.'], say: [
      'I designed OMECOnnect mobile-first, because most consumers use their phones. The colours come from OMECO: navy blue for trust and amber for energy.',
      'Users can switch between light and dark mode, and between English and Filipino, at the top of every screen. The choice is remembered on their device.'
    ] },
    { time: '2:00', show: ['Sign-in screen: point to "Keep me signed in", "Continue with Google", and the phone sign-in.'], say: [
      'The sign-in screen is simple: email and password, Google, or phone number with a one-time code. "Keep me signed in" means consumers do not have to log in every time.'
    ] },
    { time: '2:20', show: ['Home screen after sign-in. Point to the amount-due card, due date, Pay now, and the account picker.'], say: [
      'The Home screen answers the three most important questions at a glance: How much do I owe? When is it due? Is there power in my area?',
      'The big card shows the amount due and the due date. If a consumer has more than one OMECO account, like a house and a store, they switch with this account picker.'
    ] },
    { time: '2:50', show: ['"Power in your area" card (green / amber / red dot). Tap "Report no power" twice.'], say: [
      'The "Power in your area" card shows the status of the consumer\'s barangay: green for normal, amber for an advisory, red when neighbors have reported an outage.',
      'Reporting a brownout takes one tap, with a second tap to confirm, so it is fast but not accidental.'
    ] },
    { time: '3:15', show: ['Bills screen: usage chart, then tap a bill to open the details sheet. Then tap "View statement (receipt)".'], say: [
      'In Bills, the usage chart shows twelve months of kWh, so consumers can see their pattern. Tapping a bill opens a details sheet with the charge breakdown and a comparison with last month.',
      'This is the online Statement of Account. I designed it to look exactly like the printed OMECO bill: charges by group, current amount due, deadline and cut-off dates, and barcodes for the account and the online payment reference. It can be printed or saved as PDF.'
    ] },
    { time: '3:55', show: ['Home → "Estimate my bill". Show the three tabs: Meter reading, kWh, Appliances.'], say: [
      'The Bill estimator lets consumers predict their bill. They can type two meter readings, the kWh, or pick their appliances and hours of use. It uses the official rates set by OMECO staff, so the estimate matches the real bill.'
    ] },
    { time: '4:20', show: ['Alerts tab: notifications and OMECO advisories. Tap the small bell pill to turn on phone pop-ups.'], say: [
      'Alerts keeps all notifications and outage advisories in one place. The small bell button at the top turns on pop-up alerts on the phone.'
    ] },
    { time: '4:40', show: ['Concerns tab: submit a concern with a photo. Open "View updates" on an older concern, then rate it with stars.'], say: [
      'For concerns, consumers choose a category, describe the problem and can attach up to three photos. Each concern shows its target time and a timeline of updates from staff, so they always know what is happening. After it is resolved, they rate the service with stars.'
    ] },
    { time: '5:05', show: ['Switch to the staff console (desktop). Click the bell: the notification drawer slides in from the left.'], say: [
      'Now the staff side. Administrators and field staff use the console on a computer. Notifications open in a drawer on the left, grouped into New and Earlier, with an icon for each type.'
    ] },
    { time: '5:25', show: ['Customers → Service areas: tap a municipality so its barangays open underneath. Use the search box.'], say: [
      'Service areas show consumers by municipality. Tapping a town opens its barangays right below it, with counts and bars, a search box and sorting.'
    ] },
    { time: '5:45', show: ['Complaints: colored target-time badges, "Assign", and the "Outages by area" panel. Click "Mark power restored".'], say: [
      'For field staff, concerns show a colored target-time badge: green on time, amber due soon, red overdue. Outage reports are grouped by barangay, and one click marks power as restored for the whole area and notifies every affected consumer.'
    ] },
    { time: '6:15', show: ['Meter readings screen (photo + Accept/Return). Then Reports: the summary cards.'], say: [
      'Engineering and billing staff check meter readings sent with photos. The Reports page gives managers on-time percentage, customer rating, bills paid, and other key numbers.'
    ] },
    { time: '6:35', show: ['Resize the window to phone width; show the layout adapting. Optional: turn on airplane mode to show the offline screen.'], say: [
      'Every screen is responsive, works with the keyboard and screen readers, and respects reduced-motion settings. If the internet is lost, the app shows a clear offline screen, and it updates itself when we publish a new version. That is the front end. I will now pass it to our first back-end programmer.'
    ] }
  ]),
  space(),
  h2('Technical points the Front-End Programmer must be able to explain'),
  bullet([t('Technology: ', { bold: true }), t('plain HTML, CSS and JavaScript (no framework), so pages load fast on slow mobile data. Installable as a PWA and Android app (APK).')]),
  bullet([t('Design system: ', { bold: true }), t('CSS custom properties (design tokens) for colours, spacing and shadows; dark mode switches tokens with a data-theme attribute.')]),
  bullet([t('Reusable components: ', { bold: true }), t('bottom sheets, side drawer, cards, tabs, badges and toasts, built once and reused across screens.')]),
  bullet([t('Language switch: ', { bold: true }), t('an English–Filipino dictionary applied to the page text automatically, including new content that appears later.')]),
  bullet([t('Charts and receipt: ', { bold: true }), t('the usage chart is drawn with SVG; the statement barcodes are generated in the browser (Code 128) and checked with their checksum; a print stylesheet prints only the receipt.')]),
  bullet([t('Usability rules: ', { bold: true }), t('the three key facts (amount, due date, power status) on the first screen; two-tap confirmation for actions; colour plus text for status (not colour alone); large touch targets.')]),
  bullet([t('Accessibility: ', { bold: true }), t('buttons and labels for screen readers, visible keyboard focus, Esc closes drawers and sheets, focus returns to the button that opened them.')]),
  bullet([t('Security on the page: ', { bold: true }), t('a strict Content Security Policy (no inline scripts), and all text from users is escaped before it is shown.')]),
  h3('Possible questions and answers'),
  bullet([t('Why no framework like React? ', { bold: true }), t('Our users are often on low-end phones and slow data. Plain JavaScript keeps the app small and fast, and there is no build step.')]),
  bullet([t('How do field staff see only their tools? ', { bold: true }), t('The console reads the staff member\'s role after sign-in and hides menus they cannot use; the database also blocks those actions, so hiding is not the only protection.')]),
  bullet([t('How did you make it easy for older users? ', { bold: true }), t('Large text, Filipino language, simple words, the most important information first, and one-tap actions with confirmation.')]),
  pageBreak()
);

// 4. Back-end 1
children.push(
  h1('4. Part 2 — Back-End Programmer 1'),
  kv('Assigned task', 'To develop a user-authenticated mobile platform for residential, commercial, and industrial consumers to track electric bills, outage announcements, and payment due dates.'),
  kv('Time', '7:00 – 11:30 (about 4½ minutes)'),
  rule(),
  scenes([
    { time: '7:00', show: ['Architecture slide (Figure 1 / Conceptual Architecture diagram).'], say: [
      'Thank you. I built the server side of the consumer platform. Our back end is Supabase: a PostgreSQL database, an authentication service, a real-time service, and server functions. The web pages are hosted on Vercel, and the whole system can also run in Docker.'
    ] },
    { time: '7:25', show: ['Customer sign-up screen. Then the confirmation e-mail / SMS code screen.'], say: [
      'Every consumer must be authenticated. They can sign up with email and password, confirmed by an e-mail link, sign in with Google using the secure PKCE flow, or use their mobile number with a six-digit SMS code.',
      'Passwords are never stored in plain text; Supabase stores them hashed. After sign-in the app receives a short-lived access token, and a refresh token keeps the session alive when "Keep me signed in" is checked.'
    ] },
    { time: '8:05', show: ['Profile → "Link your OMECO account". Then in the console: Verification → Approve.'], say: [
      'A new account cannot see any bill until OMECO verifies it. The consumer submits their OMECO account number, staff check it, and approve. Approval runs a database function that links the account and notifies the consumer. One consumer can link several accounts.'
    ] },
    { time: '8:35', show: ['Admin → Bills → Electricity rate: customer type list (Residential, Commercial, Industrial, Public building) and the 18-line rate schedule.'], say: [
      'The platform supports residential, commercial and industrial consumers. Each account has a customer type, and each type has its own rate schedule with an effective date.',
      'The schedule has the same lines as the printed bill. Some lines are per kWh, some per month, and VAT can be a percentage of another group. A database function computes any bill from the kWh, so everyone uses the same official math.'
    ] },
    { time: '9:15', show: ['New bill form: enter previous and present readings, press "Calculate from rate schedule", then "Add bill". Show the customer receiving it.'], say: [
      'When staff create a bill, the readings are converted to kWh automatically, the amount is calculated from the schedule, and every charge line is saved with the bill, so old statements never change when rates change.',
      'Each bill also gets a unique 20-digit online payment reference. For many accounts at once, staff can import a CSV file; the server checks every row first and reports errors before anything is saved.'
    ] },
    { time: '9:55', show: ['Announcements: publish an outage advisory for one municipality. Show it on the customer\'s Home and Alerts.'], say: [
      'For outage announcements, staff publish an advisory for an area. A database trigger notifies the consumers in that area. The power-status function combines advisories with outage reports from the same barangay, without revealing who reported.'
    ] },
    { time: '10:25', show: ['Slide or SQL view of the scheduled job: "omeconnect-bill-reminders — every day 8:00 AM".'], say: [
      'For payment due dates, a scheduled job runs every day at 8 AM Philippine time. It sends a reminder three days before the due date, on the due date, and one day after if still unpaid, each only once.'
    ] },
    { time: '10:50', show: ['Browser developer tools → Network tab while opening Bills: show the REST and RPC requests and the JSON.'], say: [
      'The app talks to the server through REST APIs generated from the database, and through RPC functions for business actions, like compute bill, get statement, and get power status. Here you can see the requests and the JSON responses.',
      'Every request carries the user\'s token, and the database checks it on every row. I will now pass it to our second back-end programmer, who will explain the security in more detail.'
    ] }
  ]),
  space(),
  h2('Technical points Back-End Programmer 1 must be able to explain'),
  bullet([t('Authentication: ', { bold: true }), t('Supabase Auth with email + password (confirmed), Google OAuth with PKCE, phone OTP through an SMS hook (textbee gateway), JWT access tokens (1 hour) and refresh tokens; optional authenticator-app 2FA for consumers.')]),
  bullet([t('Main tables: ', { bold: true }), t('users, customer_accounts (customer_type R/C/I/P), account_verification_requests, electricity_bills, electricity_rates, announcements, notifications, payments, meter_readings, service_areas.')]),
  bullet([t('Database functions (RPC): ', { bold: true }), t('approve_verification_request, compute_bill, set_electricity_rate, get_current_rates, get_statement, import_bills, get_power_status, queue_due_bill_notifications.')]),
  bullet([t('Triggers: ', { bold: true }), t('prepare_bill (readings → kWh, payment reference, cut-off date), notify_customer_of_new_bill, notify_customers_of_announcement.')]),
  bullet([t('Scheduling: ', { bold: true }), t('pg_cron runs the daily reminder job at 00:00 UTC (8:00 AM in the Philippines).')]),
  bullet([t('APIs: ', { bold: true }), t('PostgREST REST endpoints (/rest/v1/...) and RPC endpoints (/rest/v1/rpc/...), JSON over HTTPS.')]),
  bullet([t('Data integrity: ', { bold: true }), t('check constraints (present ≥ previous reading, rate ranges), unique payment references, frozen charge lines per bill, rate history with effective dates.')]),
  h3('Possible questions and answers'),
  bullet([t('How do you stop a consumer from seeing another person\'s bill? ', { bold: true }), t('Row Level Security: the database only returns bills of accounts that belong to the signed-in user and are verified. Even a modified app cannot get other rows.')]),
  bullet([t('What happens when rates change? ', { bold: true }), t('Staff save a new schedule with an effective date. New bills use it; old bills keep the charge lines saved when they were made.')]),
  bullet([t('How are commercial and industrial consumers handled? ', { bold: true }), t('Each account has a customer type, and each type has its own rate schedule. The same platform and screens are used.')]),
  pageBreak()
);

// 5. Back-end 2
children.push(
  h1('5. Part 3 — Back-End Programmer 2'),
  kv('Assigned task', 'To create a secure mobile application for OMECO member-consumers to manage accounts, report power interruptions, and receive real-time billing alerts.'),
  kv('Time', '11:30 – 16:00 (about 4½ minutes)'),
  rule(),
  scenes([
    { time: '11:30', show: ['Slide: "Security layers" — sign-in, 2-step verification, Row Level Security, staff roles, audit log.'], say: [
      'Thank you. My part is security, account management, outage reporting and real-time alerts. Security is built in layers, and the most important layer is inside the database itself.',
      'Every table has Row Level Security. Consumers can only read and change their own rows, and staff actions are checked by role: supervisor, billing, customer service, or engineering.'
    ] },
    { time: '12:05', show: ['Staff sign-in: after the password, the QR / 6-digit authenticator code screen.'], say: [
      'Staff accounts must use two-step verification. After the password, they enter a code from an authenticator app. The database only treats someone as staff when their session has passed this second step, so a stolen password alone is useless.'
    ] },
    { time: '12:30', show: ['Customer Profile: change photo, location, linked accounts, two-step verification, "Download my data".'], say: [
      'Consumers manage their accounts in Profile: update their location, profile photo and linked OMECO accounts, and turn on two-step verification.',
      'Photos are stored in private storage. Each person can only open files in their own folder. For the Data Privacy Act, consumers can download all their data or delete their account; OMECO\'s billing records are kept but unlinked.'
    ] },
    { time: '13:10', show: ['Customer taps "Report no power". Then in the console: the report appears at once in "Outages by area" and the bell drawer.'], say: [
      'To report a power interruption, the consumer taps Report no power. The report is saved with their barangay, gets a target time automatically, four hours for outages, and staff are notified immediately.',
      'Staff can assign it, add updates, and mark power as restored for the whole barangay. Every status change is saved in a history, which becomes the timeline the consumer sees.'
    ] },
    { time: '13:50', show: ['Side by side: staff adds a bill → the customer app updates without refreshing → the phone shows a pop-up notification.'], say: [
      'Now real-time billing alerts. When staff add a bill, a database trigger creates a notification. Supabase Realtime pushes the change through a WebSocket, so the open app updates without refreshing.',
      'At the same time, a server function sends a Web Push notification, so the alert pops up on the phone even when the app is closed. The push keys are kept in an encrypted vault, never in the app.'
    ] },
    { time: '14:35', show: ['Security → audit log, App errors, and Backups panels.'], say: [
      'Every staff action is written to an audit log. Errors that happen on users\' phones are reported automatically, and supervisors are alerted if errors suddenly increase. The whole database is backed up every night at 2 AM and kept for 14 days.'
    ] },
    { time: '15:05', show: ['Slide: payment flow (Pay now → PayMongo → webhook → bill updated).'], say: [
      'Online payment with GCash, Maya and cards is ready through PayMongo. The amount always comes from the database, not from the phone, and the payment confirmation is accepted only with a valid signature. It switches on when OMECO adds its PayMongo keys.'
    ] },
    { time: '15:30', show: ['Slide: deployment — Vercel public site + separate private staff site, Docker, GitHub automatic checks.'], say: [
      'Finally, the customer site and the staff console are separate sites, and the staff console is not indexed by search engines. The pages use strict security headers, and every update is checked automatically on GitHub before it goes live.'
    ] }
  ]),
  space(),
  h2('Technical points Back-End Programmer 2 must be able to explain'),
  bullet([t('Row Level Security: ', { bold: true }), t('policies on every table; restrictive policies require a passed 2-step session (aal2) where 2-step is enabled; staff writes are limited by role with staff_can().')]),
  bullet([t('Secure functions: ', { bold: true }), t('SECURITY DEFINER functions with a fixed search_path; each checks the caller (is_omeco_admin(), staff role, or ownership) before doing anything.')]),
  bullet([t('Account management: ', { bold: true }), t('column-level grants (users may change only allowed fields), private storage buckets with per-user folders, accept_privacy_notice, export_my_data, delete_my_account.')]),
  bullet([t('Power interruptions: ', { bold: true }), t('complaints table with insert policy, set_complaint_sla trigger (target time by type), assign_complaint, update_complaint_status with history and notes, resolve_area_outage, rate_complaint.')]),
  bullet([t('Real-time alerts: ', { bold: true }), t('notifications table + triggers; Supabase Realtime (Postgres changes over WebSocket); Web Push through the send-push Edge Function using VAPID keys stored in Supabase Vault, called by pg_net.')]),
  bullet([t('Reliability: ', { bold: true }), t('client error reporting with a flood guard, error-spike alerts, audit_logs, nightly-backup Edge Function + pg_cron, GitHub Actions checks, Docker with the staff console bound to the local computer only.')]),
  bullet([t('Payments: ', { bold: true }), t('create-payment and paymongo-webhook Edge Functions; HMAC-SHA256 signature check; safe to receive the same event twice.')]),
  h3('Possible questions and answers'),
  bullet([t('What if someone copies a staff password? ', { bold: true }), t('They still cannot open staff data, because the database requires the authenticator code (aal2) for every staff request.')]),
  bullet([t('How does a consumer get alerts when the app is closed? ', { bold: true }), t('Web Push: the phone registers a push subscription; when a notification row is created, the server sends the push through the browser\'s push service.')]),
  bullet([t('How do you comply with the Data Privacy Act (RA 10173)? ', { bold: true }), t('Consent at sign-up, a privacy notice, data download, account deletion, private photos, staff access by role, and an audit log of staff actions.')]),
  pageBreak()
);

// 6. Closing
children.push(
  h1('6. Closing (all members)'),
  scenes([
    { time: '16:00', show: ['Slide: summary of features (three columns: Front end, Back end 1, Back end 2).'], say: [
      '[Front-End]: We designed an interface where consumers see their bill, due date and power status at a glance, and staff manage concerns and outages quickly.',
      '[Back-End 1]: Consumers of every type are authenticated, bills are calculated from the official rate schedule, and due-date reminders are sent automatically.',
      '[Back-End 2]: Everything is protected inside the database, outage reports reach staff instantly, and billing alerts arrive in real time, even as phone pop-ups.'
    ] },
    { time: '16:35', show: ['Slide: next steps — real OMECO rates, PayMongo live payments, Brevo e-mail, pilot with one municipality.'], say: [
      'Our next steps are to load OMECO\'s approved rates, switch on online payments and e-mail delivery, and run a pilot in one municipality.',
      'Thank you for watching! We are OMECOnnect.'
    ] }
  ]),
  space(),
  callout('Reminder:', 'Practice the hand-overs ("I will now pass it to …") so the video flows. If a demo step fails while recording, pause, fix it, and record that scene again; scenes can be joined in editing.'),
  pageBreak(),
  h1('7. Quick reference: where each feature is'),
  table([3000, 3013, 3013], ['Feature', 'Consumer app', 'Staff console'], [
    ['Bills and amount due', 'Home card, Bills', 'Bills'],
    ['Statement of Account (receipt)', 'Bills → tap a bill → View statement', 'Bills → Statement'],
    ['Rates (residential / commercial / industrial)', 'Home → Estimate my bill', 'Bills → Electricity rate'],
    ['Outage announcements', 'Home power card, Alerts', 'Announcements'],
    ['Report a power interruption', 'Home → Report no power, Concerns', 'Complaints → Outages by area'],
    ['Due-date reminders', 'Alerts + phone pop-up', 'Automatic daily job'],
    ['Concerns and ratings', 'Concerns', 'Complaints (assign, target time)'],
    ['Meter readings', 'Bills → Send your meter reading', 'Meter readings'],
    ['Account management and privacy', 'Profile', 'Verification, Security'],
    ['Staff roles, audit log, backups', '—', 'Security']
  ]),

);

// ---------------------------------------------------------------- document
const doc = new Document({
  creator: 'OMECOnnect team',
  title: 'OMECOnnect Video Presentation Script',
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 32, bold: true, color: NAVY }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0, keepNext: true } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 26, bold: true, color: NAVY }, paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 23, bold: true, color: '333F52' }, paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2, keepNext: true } }
    ]
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 300 } } } }] },
      { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] }
    ]
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1300, left: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t('OMECOnnect · Video Presentation Script', { size: 16, color: GREY })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [t('Page ', { size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GREY }), t(' of ', { size: 16, color: GREY }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: GREY })] })] }) },
    children
  }]
});

Packer.toBuffer(doc).then((buf) => {
  const out = process.argv[2];
  fs.writeFileSync(out, buf);
  console.log('written', out, buf.length, 'bytes');
});
