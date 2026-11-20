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
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [t(text)] });
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


// ================================================================ recording-guide helpers
const GREEN = '1E6B3A';
// One recording step: what to click, what appears, what to say.
// steps([{ do: ['Click …', …], see: 'What appears', say: ['…'] }])
function steps(list, startAt = 1) {
  const talk = list.some((x) => x.say && x.say.length);
  const W = talk ? [520, 4100, 4406] : [520, 8506];
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: W,
    rows: [
      new TableRow({ tableHeader: true, children: (talk ? ['#', 'Do this on screen', 'Say (while doing it)'] : ['#', 'Do this']).map((h, i) => cell(h, W[i], { fill: NAVY, run: { bold: true, color: 'FFFFFF', size: 19 } })) }),
      ...list.map((s, ri) => {
        const fill = ri % 2 ? 'F4F7FB' : undefined;
        const doParas = s.do.map((line) => new Paragraph({ children: [t('▸ ', { size: 19, color: AMBER, bold: true }), ...rich(line, 19)], spacing: { after: 50 } }));
        if (s.see) doParas.push(new Paragraph({ children: [t('✔ You should see: ', { size: 18, bold: true, color: GREEN }), ...rich(s.see, 18, { color: GREEN })], spacing: { before: 40, after: 40 } }));
        const sayParas = (s.say && s.say.length ? s.say : ['(Pause — no talking.)']).map(
          (line) => new Paragraph({ children: [t(line.startsWith('(') ? line : `“${line}”`, { size: 19, italics: true, color: line.startsWith('(') ? GREY : '1F2633' })], spacing: { after: 70 } }));
        return new TableRow({
          cantSplit: true,
          children: [
            cell(String(startAt + ri), W[0], { fill, run: { size: 19, bold: true, color: NAVY } }),
            cell(doParas, W[1], { fill }),
            ...(talk ? [cell(sayParas, W[2], { fill })] : [])
          ]
        });
      })
    ]
  });
}
// **bold** inside a step line = an exact button / label on screen.
function rich(text, size, o = {}) {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
    part.startsWith('**') ? t(part.slice(2, -2), { size, bold: true, color: o.color || NAVY }) : t(part, { size, ...o }));
}
const scene = (title, time, speaker) => [
  new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t(title)] }),
  new Paragraph({ keepNext: true, spacing: { after: 100 }, children: [t('Time: ', { bold: true, size: 20, color: GREY }), t(time, { size: 20, color: GREY }), t('     Speaker: ', { bold: true, size: 20, color: GREY }), t(speaker, { size: 20, color: GREY })] })
];
const small = (text) => new Paragraph({ children: rich(text, 19), spacing: { before: 120, after: 80 } });
const tick = (text) => new Paragraph({ children: [t('☐  ', { size: 20 }), ...rich(text, 20)], spacing: { after: 70 }, indent: { left: 200 } });

// ================================================================ content
const children = [];

// ---------------------------------------------------------------- Title
children.push(
  new Paragraph({ spacing: { before: 2000, after: 200 }, alignment: AlignmentType.CENTER, children: [t('OMECOnnect', { bold: true, size: 64, color: NAVY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [t('Video Presentation Script', { size: 40, color: GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 500 }, children: [t('with a step-by-step on-screen recording guide', { size: 28, color: GREY })] }),
  rule(),
  table([3000, 6026], ['Role', 'Member (write the name)'], [
    ['Front-End Programmer', '______________________________'],
    ['Back-End Programmer 1', '______________________________'],
    ['Back-End Programmer 2', '______________________________']
  ]),
  space(),
  p([t('Running time: ', { bold: true }), t('about 18 minutes. Every member speaks in the Opening, in their own Part, and in the Closing.')], { alignment: AlignmentType.CENTER }),
  p([t('Customer app: ', { bold: true }), t('https://omeconnect.vercel.app   ·   Staff console: private link (never show its address).')], { alignment: AlignmentType.CENTER }),
  space(),
  callout('How to read this guide:', 'Each scene is a table. Left column = exactly what to click (bold words are the exact button names on screen) and what should appear. Right column = what to say while you do it. The spoken lines are written in Taglish; technical terms stay in English. Say them naturally, not word for word.')
);

// ---------------------------------------------------------------- 1. Overview
children.push(
  h1('1. Presentation plan'),
  p('Each member explains and demonstrates their assigned responsibility. Record each part as its own clip, then join the clips (see Section 9). That way a mistake only means re-recording one part.'),
  table([1250, 2000, 4376, 1400], ['Part', 'Presenter', 'What is shown', 'Time'], [
    ['Opening', 'All members', 'Problem, goal, team roles, architecture slide', '0:00 – 1:45'],
    ['Part 1', 'Front-End Programmer', 'UI/UX for consumers, field staff and admins: bills, due dates, outage announcements, concerns; design system, dark mode, Filipino, phone and desktop layouts', '1:45 – 7:15'],
    ['Part 2', 'Back-End Programmer 1', 'User-authenticated platform for residential, commercial and industrial consumers: sign-in and 2FA, database and security rules, rate schedule and bill computation, live bill posting, outage announcements, due-date reminders, APIs', '7:15 – 12:15'],
    ['Part 3', 'Back-End Programmer 2', 'Secure app for member-consumers: linking and managing accounts, one-tap power-interruption reports, real-time billing and concern alerts, staff roles, audit log, privacy, backups', '12:15 – 17:15'],
    ['Closing', 'All members', 'Summary and next steps', '17:15 – 18:00']
  ]),
  space(),
  h2('What the demo account already has'),
  p('Your Google account is the demo customer. This is what is on screen before you start (do not change it before recording):'),
  table([2600, 6426], ['Item', 'Demo data'], [
    ['Customer', 'Your Google account · OMECO account 1234567890 · Residential · San Jose, Barangay 5 · meter 01234567'],
    ['Bills', 'June – October 2026 PAID (₱1,794.83, ₱1,744.43, ₱2,084.61, ₱2,399.62, ₱2,702.02). November 2026 UNPAID: 188 kWh, ₱2,374.41, due 2 Dec 2026, readings 12849 → 13037'],
    ['Concerns', '“Low voltage” — Resolved, 3-step timeline, not rated yet. “Billing concerns” — Submitted (open)'],
    ['Meter readings', '12846 accepted · 13052 submitted today (waiting for staff)'],
    ['Advisory', '“Scheduled maintenance: San Jose Barangay 5 feeder”'],
    ['Rates', 'Residential schedule (18 lines), ₱12.28 per kWh + ₱5.00 per month'],
    ['Staff', 'Your staff account (role: Supervisor) with the authenticator app on your phone']
  ]),
  space(),
  h2('Things you will do live (they change the data)'),
  table([700, 4000, 4326], ['Part', 'Live action', 'Values to type'], [
    ['2', 'Post the December 2026 bill', 'Previous 13037 · Present 13210 → 173 kWh → ₱2,185.41'],
    ['2', 'Publish a power-interruption announcement', 'Title: Power interruption: San Jose, Dec 3, 8 AM – 12 NN'],
    ['3', 'Link a second OMECO account', 'Account number 05-0500-0001'],
    ['3', 'Report no power, then mark power restored', 'One tap (tap twice to confirm)'],
    ['3', 'Update the billing concern', 'Status In progress + a message'],
    ['3', 'Accept a meter reading · rate a concern', 'Reading 13052 · 5 stars']
  ]),
  space(),
  callout('Retakes:', 'If you must redo Part 2 or Part 3, run the “Reset between takes” block in database/demo_data_cleanup.sql (Supabase → SQL Editor) first. It puts the demo back exactly as described above.')
);

// ---------------------------------------------------------------- 2. Setup
children.push(
  h1('2. Set up your computer (do this before pressing Record)'),
  h2('2.1 Your laptop’s screen recorder'),
  p('Use the screen recorder on your laptop. Whatever recorder it is, set it so that:'),
  tick('it records the **whole screen**, not one window (you will switch between the slides, the customer app and the staff console);'),
  tick('the **microphone is ON** (your voice is recorded);'),
  tick('it saves an **mp4** video; note the folder where the videos are saved.'),
  small('The steps below use the **Snipping Tool**, which is built into Windows 11. If your laptop has its own recorder, do the same things in it.'),
  steps([
    { do: ['Press **Win + Shift + R** (or open **Snipping Tool** → click the **video camera** icon → **+ New**).'], see: 'The screen dims and a small toolbar appears at the top.', say: [] },
    { do: ['Drag a box over the **whole screen**, from the top-left corner to the bottom-right corner.'], see: 'The whole screen inside a dashed border.', say: [] },
    { do: ['On the toolbar turn the **microphone** icon **on** (no line through it). Leave **system audio** off.'], see: 'Microphone icon on.', say: [] },
    { do: ['Click **Start**. A 3-second countdown begins, then recording starts.'], see: 'A timer on the toolbar.', say: [] },
    { do: ['To finish, click the red **Stop** button on the toolbar.', 'The video opens in Snipping Tool; click **Save** (or it is saved automatically in **Videos → Screen Recordings**).'], see: 'An mp4 file in Videos → Screen Recordings.', say: [] },
    { do: ['Do a **10-second test** first: say a sentence, stop, play it back. Check the voice is clear and the text on screen is readable.'], see: 'A clear test video.', say: [] }
  ]),
  callout('Avoid:', 'the Xbox Game Bar recorder (Win + Alt + R / Win + G). It records only one app window, so the slides and the other browser window would not appear in the video. Also, close the recorder’s toolbar preview window between clips so it does not cover the apps.'),
  h2('2.2 Clean the screen'),
  tick('Close chat apps, email and anything with personal messages. Turn on **Do not disturb** (**Win + N** → bell icon) so pop-ups do not appear.'),
  tick('Hide desktop icons (right-click desktop → **View** → untick **Show desktop icons**).'),
  tick('Set browser zoom to **100%** (**Ctrl + 0**).'),
  tick('Never show passwords, authenticator codes, API keys, or other customers’ personal details.'),
  h2('2.3 Window 1 — the customer app as a phone'),
  steps([
    { do: ['Open **Google Chrome** and go to **https://omeconnect.vercel.app**.'], see: 'The OMECOnnect sign-in page.', say: [] },
    { do: ['Click **Continue with Google**, choose your account, keep **Keep me signed in** ticked.'], see: 'The customer **Home** screen with “Amount due ₱2,374.41”.', say: [] },
    { do: ['Press **F12** (DevTools), then **Ctrl + Shift + M** (device toolbar). At the top choose **iPhone 12 Pro** (390 × 844).'], see: 'The app shown in phone size.', say: [] },
    { do: ['In DevTools click **⋮** → **Dock side** → **Undock into separate window**. Minimize that DevTools window (do not close it).'], see: 'The page stays in phone size and DevTools is out of the way.', say: [] },
    { do: ['Press **Win + Left arrow** to snap this window to the left half.'], see: 'Phone-size app on the left.', say: [] }
  ]),
  h2('2.4 Window 2 — the staff console (address hidden)'),
  steps([
    { do: ['Open **Microsoft Edge** (a different browser keeps the staff sign-in separate) and open the staff console link.'], see: 'Staff sign-in page.', say: [] },
    { do: ['Sign in with your staff email and password, then type the 6-digit code from your authenticator app in **Two-step verification**. Never record your password or code.'], see: '**Overview** with your role chip **Supervisor**.', say: [] },
    { do: ['Hide the address bar: Edge **⋯** → **Apps** → **Install this site as an app** → **Install**. Use the app window that opens.'], see: 'The console in its own window with no address bar.', say: [] },
    { do: ['Press **Win + Right arrow** to snap it to the right half.'], see: 'Customer phone on the left, staff console on the right.', say: [] }
  ]),
  h2('2.5 Slides'),
  tick('Make 5 simple slides in PowerPoint or Google Slides: **Title** (logo + names), **The problem**, **Team roles**, **Architecture** (insert docs/OMECOnnect_Conceptual_Architecture.png), **Thank you**.'),
  tick('Open the slides full screen (**F5**) when a scene says “Slide”. Press **Esc** to go back to the browsers, **Alt + Tab** to switch windows.'),
  h2('2.6 Final check (30 seconds)'),
  tick('Customer Home shows **₱2,374.41**, due **2 Dec 2026**, and the **Power in your area** card.'),
  tick('Staff **Complaints** shows the open “Billing concerns”; **Meter readings** shows 13052 waiting.'),
  tick('Phone on silent, water nearby, script printed or on a second screen.')
);

// ---------------------------------------------------------------- 3. Opening
children.push(
  h1('3. Opening — all members (0:00 – 1:45)'),
  ...scene('Scene O-1 · Title and problem', '0:00 – 0:50', 'Front-End Programmer, then Back-End 1'),
  steps([
    { do: ['Start your screen recorder (Win + Shift + R → whole screen → Start). Show **Slide 1 (Title)**. Wait 2 seconds before talking.'], see: 'OMECOnnect logo and team names.', say: [
      '[Front-End] Magandang araw po! Kami po ang developers ng OMECOnnect, isang mobile platform para sa Occidental Mindoro Electric Cooperative, o OMECO.'
    ] },
    { do: ['Press **→** for **Slide 2 (The problem)**.'], see: 'Long lines, missed due dates, outage news only on Facebook or radio, concerns hard to follow up.', say: [
      '[Back-End 1] Sa ngayon, maraming member-consumers pa rin ang pumipila sa office para lang magtanong tungkol sa bill nila, nalalampasan ang due date, o huli na nalalaman na may brownout. Ang concerns naman ay tinatawag lang sa phone, kaya mahirap i-follow up.',
      'Kaya ginawa namin ang OMECOnnect: nasa iisang app na ang bill, due date, outage announcements at concerns para sa consumers, at may secure na console naman ang OMECO staff para i-manage lahat ng ito.'
    ] }
  ]),
  space(),
  ...scene('Scene O-2 · Team roles and architecture', '0:50 – 1:45', 'Each member says their own line'),
  steps([
    { do: ['**Slide 3 (Team roles)**.'], see: 'Three roles with names.', say: [
      '[Front-End] Ako po ang nag-design ng user interface at user experience para sa consumers, field staff at administrators.',
      '[Back-End 1] Ako naman po ang nag-develop ng user-authenticated platform kung saan nata-track ng residential, commercial at industrial consumers ang kanilang bills, outage announcements at due dates.',
      '[Back-End 2] At ako po ang gumawa ng secure side para sa member-consumers: pag-manage ng accounts, pag-report ng power interruptions, at real-time billing alerts.'
    ] },
    { do: ['**Slide 4 (Architecture)**. Point with the mouse: left = users, middle = the two web apps, right = Supabase, bottom = outside services.'], see: 'The Conceptual Architecture diagram.', say: [
      '[Back-End 2] Ginagamit ng consumers ang customer app sa phone nila; ang staff naman ay may hiwalay at private na console. Pareho silang konektado sa Supabase: authentication, PostgreSQL database na may row-level security, real-time updates, file storage at server functions. Ang text messages, email at payments ay dumadaan sa secured server functions.'
    ] },
    { do: ['Press **Esc**. Click the customer window. Stop recording (red Stop button) — end of the Opening clip.'], see: 'Both browser windows.', say: [] }
  ])
);

// ---------------------------------------------------------------- 4. Part 1 Front-End
children.push(
  h1('4. Part 1 — Front-End Programmer (1:45 – 7:15)'),
  p('Goal: show an intuitive UI for monitoring electric bills, power outage announcements, due dates and consumer concerns — for consumers, field staff and admins. Only look, do not change data, except the estimator (it saves nothing).'),
  ...scene('Scene 1-1 · Customer Home: bill, due date, power status', '1:45 – 2:45', 'Front-End Programmer'),
  steps([
    { do: ['Start recording. Click the customer window. Scroll to the top of **Home**.'], see: 'Greeting, big **Amount due ₱2,374.41**, **Due date: Dec 2, 2026**, buttons **View bills** and **Report issue**.', say: [
      'Ito po ang home screen ng consumer. Dinesign ko ito base sa isang tanong: magkano ang babayaran ko at kailan ang due? Kaya ang amount due at due date ang pinakamalaki sa screen.'
    ] },
    { do: ['Point at the **Power in your area** card (do NOT tap Report no power yet).'], see: 'Power status for Barangay 5, San Jose and the **Report no power** button.', say: [
      'Sa ibaba naman, makikita ang power status ng sariling barangay ng consumer, may one-tap button para mag-report ng outage. Ide-demo ito mamaya ng teammate ko.'
    ] },
    { do: ['Scroll down slowly to the usage chart (**Usage history**).'], see: 'Bars for June to November 2026; the trend line.', say: [
      'Ang usage chart ay nagpapakita ng kilowatt-hours sa mga nakaraang buwan, para makita ng consumer kung bakit tumaas ang bill — halimbawa, October ang pinakamataas, 214 kWh.'
    ] }
  ]),
  space(),
  ...scene('Scene 1-2 · Bills and the online Statement of Account', '2:45 – 3:45', 'Front-End Programmer'),
  steps([
    { do: ['Tap **Bills** in the bottom navigation.'], see: 'List of bills: November 2026 **Unpaid**, June–October **Paid**, total still owed.', say: [
      'Sa Bills screen, nakalista lahat ng bills na may malinaw na kulay ng status — amber kapag unpaid, green kapag paid — at nasa itaas ang kabuuang babayaran pa.'
    ] },
    { do: ['Tap the **November 2026** bill.'], see: 'A bottom sheet: 188 kWh, readings 12849 → 13037, charge breakdown, due date, compare with last month.', say: [
      'Kapag tinap ang isang bill, magbubukas ang bottom sheet — pamilyar na pattern ito sa mobile apps. Makikita dito ang meter readings, ang charges, at ang comparison sa nakaraang buwan.'
    ] },
    { do: ['Tap **View statement (receipt)**.'], see: 'The online Statement of Account: header, readings, 18 rate lines, total ₱2,374.41, 20-digit payment reference with barcode.', say: [
      'Ito naman ang online Statement of Account. Ginaya ko ang itsura ng printed bill ng OMECO para pamilyar sa consumers: parehong grupo ng charges, ang meter readings, at payment reference na may barcode na puwedeng i-scan sa cashier.'
    ] },
    { do: ['Click **Print / Save as PDF**, show the print preview 2 seconds, click **Cancel**. Close the statement.'], see: 'A clean A4 print preview.', say: [
      'Puwede rin itong i-print o i-save as PDF sa isang tap lang.'
    ] }
  ]),
  space(),
  ...scene('Scene 1-3 · Bill estimator', '3:45 – 4:30', 'Front-End Programmer'),
  steps([
    { do: ['On **Bills** tap **Estimate my next bill** (or on Home **Estimate my bill**). Choose the **kWh** tab and type **188**.'], see: 'Estimated bill **₱2,374.41** — the same as the real November bill.', say: [
      'Ang bill estimator ay tumutulong sa consumers na ma-predict ang bill nila. Kapag nag-type ako ng 188 kilowatt-hours, eksaktong parehong amount ang lumalabas sa totoong November bill, kasi parehong rate schedule ang ginagamit na sine-set ng OMECO staff.'
    ] },
    { do: ['Tap the **Meter reading** tab. Previous **13037**, Present **13210**.'], see: '173 kWh → about **₱2,185.41**.', say: [
      'Puwede ring i-type ang dalawang reading mula sa metro. Tandaan po natin ang amount na ito — 2,185 pesos — dahil ipo-post ng teammate ko mamaya ang totoong December bill.'
    ] },
    { do: ['Tap the **Appliances** tab and show the list briefly. Close the estimator.'], see: 'Appliance watts and hours per day.', say: [
      'O kaya, ilista ang appliances ayon sa watts at oras ng gamit kada araw. Lahat ng ito ay tumatakbo sa phone mismo; walang ipinapadala sa server.'
    ] }
  ]),
  space(),
  ...scene('Scene 1-4 · Alerts, advisories and concerns', '4:30 – 5:20', 'Front-End Programmer'),
  steps([
    { do: ['Tap **Alerts**.'], see: 'Notifications (bill posted, payment received, concern updates) and the unread count.', say: [
      'Sa Alerts, naka-ipon lahat ng notifications: bagong bills, payments, due-date reminders at concern updates. Naka-highlight ang mga hindi pa nababasa.'
    ] },
    { do: ['Scroll to **OMECO advisories**.'], see: '“Scheduled maintenance: San Jose Barangay 5 feeder”.', say: [
      'Dito lumalabas ang outage at maintenance announcements, naka-filter sa sariling municipality ng consumer.'
    ] },
    { do: ['Tap **Concerns**. Under “Low voltage” tap **View updates**.'], see: 'Timeline: Submitted → Under review → In progress → Resolved, each with a staff message.', say: [
      'Sa Concerns, bawat report ay may tracking number at timeline, parang nagta-track ng parcel. Kaya laging alam ng consumer kung ano na ang nangyayari.'
    ] }
  ]),
  space(),
  ...scene('Scene 1-5 · Accessibility: Filipino and dark mode', '5:20 – 5:45', 'Front-End Programmer'),
  steps([
    { do: ['Tap **Home**. Tap the **EN** language pill at the top.'], see: 'The app switches to Filipino (FIL).', say: [
      'Available ang buong app sa English at Filipino, isang tap lang.'
    ] },
    { do: ['Tap the **moon** (theme) button. Wait 2 seconds. Tap it again, then tap **FIL** to go back to English.'], see: 'Dark mode, then back to light and English.', say: [
      'May dark mode din para sa gabi at para makatipid sa battery. Lahat ng kulay ay galing sa iisang set ng design tokens, kaya readable pa rin sa parehong theme.'
    ] }
  ]),
  space(),
  ...scene('Scene 1-6 · Staff console UI for admins and field staff', '5:45 – 7:15', 'Front-End Programmer'),
  steps([
    { do: ['Click the staff console window. Click **Overview**.'], see: 'Summary cards: customers, unpaid bills, open concerns, pending requests.', say: [
      'Para sa OMECO staff, gumawa ako ng hiwalay na console. Sa Overview, makikita agad kung ano ang kailangang asikasuhin ngayong araw.'
    ] },
    { do: ['Click the **bell** at the top.'], see: 'The notification drawer slides in from the left with **New** and **Earlier** groups and icons.', say: [
      'Ang staff notifications ay bumubukas sa side drawer sa kaliwa, naka-group at may icons, para nakikita pa rin ang page na ginagawa.'
    ] },
    { do: ['Close the drawer. Click **Customers** → **Service areas** → click **San Jose**.'], see: 'Barangays of San Jose open inside the row, with search and counts; **Barangay 5** shows 1 customer.', say: [
      'Sa Service areas, nakalista ang bawat municipality; kapag kinlik, bumubukas sa loob nito ang mga barangay, may search at sorting pa.'
    ] },
    { do: ['Click **Complaints**. Click the tabs **Open**, **Assigned to me**, **Overdue**.'], see: 'Open concerns with status badges, the assigned staff and a due time.', say: [
      'Para sa field staff, may quick tabs ang Complaints — Open, Assigned to me, Unassigned at Overdue — para ang lineman ay makita lang ang sarili niyang trabaho, at naka-mark ang mga late na.'
    ] },
    { do: ['Click **Meter readings**.'], see: 'The 13052 reading with its status **Submitted**.', say: [
      'Dito naman naghihintay ng review ang meter readings na sinend ng consumers.'
    ] },
    { do: ['Click the **theme** toggle in the top bar, then back.'], see: 'The console in dark mode, then light.', say: [
      'May dark mode din ang console at gumagana sa tablets at phones, kaya magagamit ito ng field staff kahit nasa labas. Iyan po ang front end. Susunod naman, ang back end.'
    ] },
    { do: ['Stop recording (end of Part 1).'], say: [] }
  ])
);

// ---------------------------------------------------------------- 5. Part 2 Back-End 1
children.push(
  h1('5. Part 2 — Back-End Programmer 1 (7:15 – 12:15)'),
  p('Goal: a user-authenticated mobile platform for residential, commercial and industrial consumers to track electric bills, outage announcements and payment due dates. Show the server side working: authentication, database rules, bill computation, real-time delivery, scheduled reminders.'),
  ...scene('Scene 2-1 · Authentication', '7:15 – 8:30', 'Back-End Programmer 1'),
  steps([
    { do: ['Start recording. Show the customer window. Tap **Profile**.'], see: 'Your name, email, **Verified account 1234567890**, service area.', say: [
      'Lahat ng screen na nakita ninyo ay nangangailangan ng sign-in. Gumagamit kami ng Supabase Auth. Puwedeng mag-sign in ang consumers gamit ang email at password, Google, o one-time code sa text message.'
    ] },
    { do: ['(Do not sign out.) Point at **Verified account**.'], see: 'Account number 1234567890.', say: [
      'Kapag nag-sign up, wala pang makikitang bills. Kailangan munang mag-request ng verification ng OMECO account number, at kapag na-approve lang ng staff saka makikita ang account. Para hindi makita ng ibang tao ang bill ng iba.'
    ] },
    { do: ['Click the staff window. Point at the **Supervisor** role chip and **Sign out** (do not click).'], see: 'Role chip in the top bar.', say: [
      'Mas mahigpit naman sa staff accounts: pagkatapos ng password, kailangan pa ng six-digit code mula sa authenticator app — two-factor authentication. Ang database mismo ang nagche-check na dumaan sa two-factor ang session, hindi lang ang screen.'
    ] },
    { do: ['Slide (optional): show the Architecture slide again and point at **Supabase**.'], see: 'Database, Auth, Realtime, Storage, Edge Functions.', say: [
      'Ang security ay ipinapatupad sa database gamit ang row-level security policies. Ang request ng consumer ay makakabasa lang ng rows na para sa sarili niyang verified account — kahit tawagin pa nang direkta ang API, tatanggihan ng database ang data ng ibang tao.'
    ] }
  ]),
  space(),
  ...scene('Scene 2-2 · Rates for residential, commercial and industrial', '8:30 – 9:30', 'Back-End Programmer 1'),
  steps([
    { do: ['Staff console → **Bills**. Point at the chip **Electricity rate (₱ per kWh)**.'], see: '₱12.28/kWh.', say: [
      'Ang bills ay kinukuwenta mula sa rate schedule na naka-store sa database.'
    ] },
    { do: ['Open **Full rate schedule**.'], see: '18 lines in groups: Generation, Distribution, Others, VAT, Universal charges, Local tax. Some per kWh, one per month, two are a percentage of a group.', say: [
      'Bawat line ay per kilowatt-hour, per month, o percentage ng isang group, gaya ng VAT sa distribution. Naka-hiwalay ang rates per customer class — residential, commercial at industrial — at may effective date, kaya hindi nababago ang lumang bills kapag nagbago ang rate.'
    ] },
    { do: ['Close the schedule without saving (do not click **Save rate**).'], see: 'Bills page.', say: [
      'Kapag gumawa ng bill, isang database function na compute_bill ang nagkukuwenta ng bawat line, at naka-freeze ang mga line sa bill para laging tugma ang statement sa sinisingil.'
    ] }
  ]),
  space(),
  ...scene('Scene 2-3 · LIVE: post the December bill → consumer gets it instantly', '9:30 – 11:00', 'Back-End Programmer 1'),
  steps([
    { do: ['In **New bill**: **Verified account** → choose **1234567890**. **Billing month** → **December 2026**. **Due date** → **01/04/2027** (4 Jan 2027).'], see: 'Form filled in.', say: [
      'Ngayon, mag-post tayo ng totoong bill. Pipiliin ko ang verified account ng consumer, ang billing month at ang due date.'
    ] },
    { do: ['Open **Meter reading & statement details**. **Previous reading 13037**, **Present reading 13210**. **Reading date 12/19/2026**, **Period from 11/19/2026**, **Period to 12/19/2026**, **Customer type Residential**.'], see: 'The readings filled in.', say: [
      'Ilalagay ko ang meter readings — previous 13037, present 13210.'
    ] },
    { do: ['Click **Calculate from rate schedule**.'], see: '**Consumption 173 kWh**, **Amount ₱2,185.41** filled in automatically.', say: [
      'Ang server ang nagkuwenta: 173 kilowatt-hours at 2,185 pesos at 41 centavos — parehong amount na na-predict ng estimator sa demo ng teammate ko.'
    ] },
    { do: ['Click **Add bill**. Immediately look at the customer window.'], see: 'Staff: a success message. Customer: a new alert pops in and Home updates to the December bill (refresh with the bell or pull down if needed).', say: [
      'Pag-click ko ng Add bill, gagawa ang database trigger ng 20-digit payment reference at ng notification. Ipu-push ito ng Supabase Realtime sa phone ng consumer sa loob ng isang segundo — hindi na kailangang mag-refresh.'
    ] },
    { do: ['Customer: **Bills** → tap **December 2026** → **View statement (receipt)**. Point at the payment reference and barcode. Close.'], see: 'Statement for 173 kWh, ₱2,185.41, new payment reference.', say: [
      'Ang statement ay binubuo ng get_statement API mula sa naka-freeze na lines, kaya pareho ang nakikita ng consumer at ng cashier.'
    ] },
    { do: ['Customer: **Bills** → tap **October 2026** → **View statement (receipt)**.'], see: 'A **PAID** mark with the payment date and reference (GCash).', say: [
      'Sa paid bills naman, makikita ang payment na nag-settle dito.'
    ] }
  ]),
  space(),
  ...scene('Scene 2-4 · LIVE: outage announcement + due-date reminders', '11:00 – 12:15', 'Back-End Programmer 1'),
  steps([
    { do: ['Staff → **Announcements**. **Title**: Power interruption: San Jose, Dec 3, 8 AM – 12 NN. **Message**: Line maintenance on the Barangay 5 feeder. Please plan ahead. **Category** → **Power interruption**. **Affected area** → **San Jose**. Keep **Publish now** ticked.'], see: 'The form filled in.', say: [
      'Ang outage announcements ay naka-target per area. Pinili ko ang San Jose, kaya ang consumers lang sa San Jose ang mano-notify.'
    ] },
    { do: ['Click **Publish announcement**. Look at the customer window → **Alerts**.'], see: 'The new announcement at the top of **OMECO advisories** and a new alert.', say: [
      'May trigger na naghahanap ng lahat ng consumers na tugma ang service area at gumagawa ng notification para sa bawat isa, at agad itong dine-deliver ng Realtime.'
    ] },
    { do: ['Customer **Alerts**: point at a “due” reminder if one is listed (or just at the list).'], see: 'Bill and reminder notifications.', say: [
      'Automatic ang due-date reminders. May scheduled job gamit ang pg_cron na tumatakbo araw-araw at nagpapaalala sa consumers tatlong araw bago ang due date, mismong due date, at kapag overdue na — walang kailangang pumindot ng kahit ano.',
      'Lahat ng ito ay dumadaan sa REST API at database functions ng Supabase, protektado ng sign-in token ng user. Ngayon, ipapakita naman ng teammate ko ang secure account at alert features.'
    ] },
    { do: ['Stop recording (end of Part 2).'], say: [] }
  ])
);

// ---------------------------------------------------------------- 6. Part 3 Back-End 2
children.push(
  h1('6. Part 3 — Back-End Programmer 2 (12:15 – 17:15)'),
  p('Goal: a secure mobile app for OMECO member-consumers to manage accounts, report power interruptions, and receive real-time billing alerts. Every scene is customer action → staff action → instant result.'),
  ...scene('Scene 3-1 · LIVE: link and manage a second account', '12:15 – 13:30', 'Back-End Programmer 2'),
  steps([
    { do: ['Start recording. Customer → **Profile**. In **Link another OMECO account**, type **05-0500-0001** in **OMECO account number**. Tap **Request verification**.'], see: 'A message that the request was sent and is waiting for OMECO.', say: [
      'Maraming members ang may higit sa isang koneksyon — halimbawa, bahay at tindahan. Puwedeng mag-request ang consumer na i-link ang isa pang OMECO account. Request pa lang ito; wala pang bills na makikita.'
    ] },
    { do: ['Staff → **Verification**. On the new row for 05-0500-0001 click **Approve**.'], see: 'The **Approve verification** window with the account number, Meter number and Note.', say: [
      'Chine-check ng staff ang number laban sa records ng OMECO. Ang staff lang na may accounts permission ang puwedeng mag-approve — at ito ay ipinapatupad sa loob ng database function, hindi lang sa pagtago ng button.'
    ] },
    { do: ['Click **Approve and link account**.'], see: 'Staff: “Approved… has been notified.” Customer: alert **Account verified**.', say: [
      'Pag-approve, nali-link ang account, nagsusulat ng audit-log entry, at nano-notify agad ang consumer in real time.'
    ] },
    { do: ['Customer → **Home**: use the account switcher to choose **05-0500-0001**, then switch back to **1234567890**.'], see: 'The new account (no bills yet), then the main account again.', say: [
      'Ngayon, puwede nang mag-switch ang consumer sa pagitan ng accounts. Hiwalay ang data ng bawat account kasi chine-check ng security rules na sa user na ito talaga ang account.'
    ] }
  ]),
  space(),
  ...scene('Scene 3-2 · LIVE: one-tap power-interruption report', '13:30 – 14:45', 'Back-End Programmer 2'),
  steps([
    { do: ['Customer → **Home** → **Power in your area** → tap **Report no power**.'], see: 'The button changes to **Tap again to confirm** (prevents accidental reports).', say: [
      'Isang tap lang para mag-report ng brownout. Humihingi kami ng pangalawang tap para iwas sa accidental na reports.'
    ] },
    { do: ['Tap **Tap again to confirm**.'], see: '“Report sent. Tracking number OMC-…”.', say: [
      'Naka-save ang report bilang concern, kasama ang barangay ng consumer at tracking number, at nano-notify agad ang staff.'
    ] },
    { do: ['Staff → **Complaints** → section **Outages by area**.'], see: 'Brgy. Barangay 5, San Jose with 1 report.', say: [
      'Sa staff side, naka-group ang outage reports per barangay, kaya kita agad ng team kung saan ang outage at ilang bahay ang apektado.'
    ] },
    { do: ['Click **Mark power restored**. Note: Power restored after replacing a blown fuse. Tick **Also post an advisory: “Power restored”**. Click **Resolve 1 report**.'], see: 'Staff: “Outage resolved. Customers have been notified.” Customer: alert and the power card shows power on.', say: [
      'Kapag naayos na ng crew, isang action lang para ma-resolve lahat ng reports sa barangay na iyon, ma-notify ang bawat household, at puwede pang mag-post ng public advisory.'
    ] }
  ]),
  space(),
  ...scene('Scene 3-3 · LIVE: real-time concern and billing alerts', '14:45 – 16:00', 'Back-End Programmer 2'),
  steps([
    { do: ['Staff → **Complaints** → **Open**. On “Billing concerns” click **Assign** → choose yourself → **Save**.'], see: 'The concern now shows the assigned staff and a due time (SLA).', say: [
      'Bawat concern ay may automatic na deadline depende sa type nito, at puwede itong i-assign sa isang staff member.'
    ] },
    { do: ['Click **Update**. Status → **In progress**. Message: We checked your November bill: 188 kWh at the current rate. Please see the statement for the details. Click **Save and notify customer**.'], see: 'Customer: a new alert; **Concerns** → **View updates** shows the new step and message.', say: [
      'Kapag in-update ng staff ang status, nire-record ng database ang pagbabago sa history table at agad na pinapadalhan ng alert ang consumer.'
    ] },
    { do: ['Staff → **Meter readings** → on **13052** click **Accept**.'], see: 'Status **Accepted**; customer gets an alert.', say: [
      'Ganoon din nire-review ang meter readings na sinend ng consumers.'
    ] },
    { do: ['Customer → **Concerns** → “Low voltage” → **How did we do?** → tap **5 stars** → **Send rating**.'], see: 'Thanks message; staff list shows ★★★★★.', say: [
      'Kapag resolved na ang concern, puwedeng i-rate ng consumer ang serbisyo, at napupunta ito sa staff reports.'
    ] }
  ]),
  space(),
  ...scene('Scene 3-4 · Security, audit, privacy and backups', '16:00 – 17:15', 'Back-End Programmer 2'),
  steps([
    { do: ['Staff → **Security** → **Staff and roles**.'], see: 'Staff list with roles: Supervisor, Billing, Service, Engineering.', say: [
      'May roles ang staff. Ang billing staff ay puwedeng mag-post ng bills pero hindi puwedeng mag-approve ng accounts; ang service staff naman ang humahawak ng concerns. Chine-check ng database ang role sa bawat write.'
    ] },
    { do: ['Scroll to **Audit log**.'], see: 'Today’s actions: verification approved, bill added, concern updated, outage resolved.', say: [
      'Bawat mahalagang action ay naisusulat sa audit log — sino ang gumawa, ano, at kailan. Makikita ninyo dito lahat ng ginawa natin kanina.'
    ] },
    { do: ['Point at **App errors** and **Backups** (do not click **Back up now** unless you want to).'], see: 'Error list and nightly backup list.', say: [
      'Naka-log ang app errors at nano-notify ang staff kapag biglang dumami ang errors. Automatic din ang backup ng database tuwing gabi.'
    ] },
    { do: ['Customer → **Profile** → **Your data and privacy** → **Download my data**. (Never click **Delete my account**.)'], see: 'A JSON file downloads.', say: [
      'Alinsunod sa Data Privacy Act, tumatanggap ang consumers ng privacy notice, puwede nilang i-download lahat ng data nila, at puwedeng mag-request ng deletion. Hindi namin sine-save ang passwords — secure hashes lang ang naka-store sa Supabase — at ang payment at API keys ay nasa server-side secrets, hindi kailanman nasa app.'
    ] },
    { do: ['Stop recording (end of Part 3).'], say: [] }
  ])
);

// ---------------------------------------------------------------- 7. Closing
children.push(
  h1('7. Closing — all members (17:15 – 18:00)'),
  steps([
    { do: ['Start recording. Show both windows side by side (customer Home with the December bill, staff Overview).'], see: 'Both apps.', say: [
      '[Front-End] Bilang summary: nakikita ng consumers ang bills, due dates, outage announcements at concerns nila sa iisang simpleng app, sa English o Filipino.',
      '[Back-End 1] Sa likod nito ay isang authenticated platform para sa residential, commercial at industrial consumers, kung saan ang bills ay kinukuwenta mula sa official rate schedule at automatic ang reminders.',
      '[Back-End 2] At secure ito: verified accounts, two-factor sign-in para sa staff, role-based permissions, audit logs, backups at real-time alerts.'
    ] },
    { do: ['**Slide 5 (Thank you)**.'], see: 'Thank you slide with names.', say: [
      '[All] Ang next steps namin ay i-on ang online payments at ang AI assistant, at i-load ang approved rates ng OMECO. Maraming salamat po sa panonood!'
    ] },
    { do: ['Wait 2 seconds, then stop recording.'], say: [] }
  ])
);

// ---------------------------------------------------------------- 8. Troubleshooting
children.push(
  h1('8. If something goes wrong while recording'),
  table([3300, 5726], ['Problem', 'What to do'], [
    ['The customer alert does not appear right away', 'Tap the bell or pull down to refresh. Say: “Nag-a-update din ito kapag ni-refresh.” Then continue — do not stop recording.'],
    ['Staff console asks for the code again', 'Pause recording, sign in with the authenticator code, resume. Never record the code.'],
    ['“Present reading is lower than the previous reading.”', 'You swapped the numbers. Previous 13037, Present 13210.'],
    ['Verification: “already linked to another customer”', 'Use another number, for example 05-0500-0002.'],
    ['Outages by area is empty', 'The report did not send. Go back to the customer Home and tap Report no power twice.'],
    ['The December bill already exists (second take)', 'Run the “Reset between takes” block of database/demo_data_cleanup.sql, reload both windows.'],
    ['You made a mistake in speech', 'Pause 3 seconds, repeat the sentence. Cut the pause when editing.'],
    ['Phone size is lost', 'Open the undocked DevTools window again and press Ctrl + Shift + M.']
  ]),
  space(),
  h1('9. Join the clips and finish'),
  steps([
    { do: ['Open **Clipchamp** (built into Windows 11: Start → type Clipchamp) → **Create a new video**.'], see: 'Empty editor.', say: [] },
    { do: ['Drag the clips from **Videos → Screen Recordings** in order: Opening, Part 1, Part 2, Part 3, Closing onto the timeline.'], see: 'Five clips in a row.', say: [] },
    { do: ['Cut long pauses: click the clip, move the playhead, press **S** (split), delete the unwanted piece.'], see: 'Shorter clips.', say: [] },
    { do: ['Optional: add a **Text** title at the start of each part (e.g. “Part 2 — Back-End Programmer 1: <name>”).'], see: 'Title overlays.', say: [] },
    { do: ['Check the whole video once: no passwords, codes, personal details or staff address visible. If the address shows, use **Effects** → **Blur** on that part, or crop it.'], see: 'A clean video.', say: [] },
    { do: ['Click **Export** → **1080p**.'], see: 'An mp4 file in Downloads, ready to submit.', say: [] }
  ]),
  space(),
  h2('After recording — clean up the demo'),
  tick('Open Supabase → **SQL Editor** → paste **database/demo_data_cleanup.sql** → **Run** (only when you no longer need the demo).'),
  tick('This removes the demo bills, payments, concerns, meter readings, advisories, the linked test account 05-0500-0001 and its request. Your sign-in and account 1234567890 are kept.')
);
const doc = new Document({
  creator: 'OMECOnnect team',
  title: 'OMECOnnect Video Presentation Script and Recording Guide (Taglish)',
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
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t('OMECOnnect · Video Script and Recording Guide (Taglish)', { size: 16, color: GREY })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [t('Page ', { size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GREY }), t(' of ', { size: 16, color: GREY }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: GREY })] })] }) },
    children
  }]
});

Packer.toBuffer(doc).then((buf) => {
  const out = process.argv[2];
  fs.writeFileSync(out, buf);
  console.log('written', out, buf.length, 'bytes');
});
