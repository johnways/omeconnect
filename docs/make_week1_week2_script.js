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


// ================================================================ helpers for this guide
const GREEN = '1E6B3A';
function rich(text, size, o = {}) {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
    part.startsWith('**') ? t(part.slice(2, -2), { size, bold: true, color: o.color || NAVY }) : t(part, { size, ...o }));
}
// One recording step: what to click, what appears, what to say.
function steps(list, startAt = 1) {
  const talk = list.some((x) => x.say && x.say.length);
  const W = talk ? [520, 4100, 4406] : [520, 8506];
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: W,
    rows: [
      new TableRow({ tableHeader: true, children: (talk ? ['#', 'Gawin sa screen (Do this)', 'Sabihin (Say)'] : ['#', 'Gawin (Do this)']).map((h, i) => cell(h, W[i], { fill: NAVY, run: { bold: true, color: 'FFFFFF', size: 19 } })) }),
      ...list.map((s, ri) => {
        const fill = ri % 2 ? 'F4F7FB' : undefined;
        const doParas = s.do.map((line) => new Paragraph({ children: [t('▸ ', { size: 19, color: AMBER, bold: true }), ...rich(line, 19)], spacing: { after: 50 } }));
        if (s.see) doParas.push(new Paragraph({ children: [t('✔ Makikita mo: ', { size: 18, bold: true, color: GREEN }), ...rich(s.see, 18, { color: GREEN })], spacing: { before: 40, after: 40 } }));
        const sayParas = (s.say && s.say.length ? s.say : ['(Hinto muna — walang sasabihin.)']).map(
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
const scene = (title, time, speaker) => [
  new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t(title)] }),
  new Paragraph({ keepNext: true, spacing: { after: 100 }, children: [t('Oras: ', { bold: true, size: 20, color: GREY }), t(time, { size: 20, color: GREY }), t('     Magsasalita: ', { bold: true, size: 20, color: GREY }), t(speaker, { size: 20, color: GREY })] })
];
const small = (text) => new Paragraph({ children: rich(text, 20), spacing: { before: 80, after: 80 } });
const tick = (text) => new Paragraph({ children: [t('☐  ', { size: 20 }), ...rich(text, 20)], spacing: { after: 70 }, indent: { left: 200 } });
const banner = (text, fill) => new Table({
  width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [CONTENT],
  rows: [new TableRow({ children: [new TableCell({
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
    width: { size: CONTENT, type: WidthType.DXA }, shading: { fill, type: ShadingType.CLEAR, color: 'auto' },
    margins: { top: 160, bottom: 160, left: 200, right: 200 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [t(text, { bold: true, size: 30, color: 'FFFFFF' })] })]
  })] })]
});

const children = [];

// ================================================================ TITLE
children.push(
  new Paragraph({ spacing: { before: 1800, after: 200 }, alignment: AlignmentType.CENTER, children: [t('OMECOnnect', { bold: true, size: 64, color: NAVY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [t('Video Presentation Script — Week 1 at Week 2', { size: 36, color: GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 500 }, children: [t('May kasamang step-by-step kung ano ang gagawin sa screen habang nagre-record', { size: 24, color: GREY })] }),
  rule(),
  table([3000, 6026], ['Role', 'Pangalan ng member'], [
    ['Front-End Programmer', '______________________________'],
    ['Back-End Programmer 1', '______________________________'],
    ['Back-End Programmer 2', '______________________________']
  ]),
  space(),
  p([t('Customer app: ', { bold: true }), t('https://omeconnect.vercel.app   ·   Staff console: private link (huwag ipakita ang address).')], { alignment: AlignmentType.CENTER }),
  space(),
  callout('Paano gamitin:', 'Bawat scene ay may table. Kaliwa = eksaktong i-click (naka-bold ang mismong pangalan ng button sa screen) at ang “Makikita mo”. Kanan = ang sasabihin mo habang ginagawa. Mas maraming Tagalog ang script; English pa rin ang mga technical term. Hindi kailangang basahin word for word — sabihin nang natural.')
);

// ================================================================ HOW TO
children.push(
  h1('1. Bago mag-record (gawin minsan lang)'),
  callout('Paalala:', 'I-record ang bawat Part nang hiwalay (Opening, Front-End, Back-End 1, Back-End 2, Closing). Kapag nagkamali, isang Part lang ang uulitin. Pagdugtungin sa Clipchamp sa dulo (Section 14).'),
  h2('1.1 Pagre-record gamit ang laptop'),
  steps([
    { do: ['Pindutin ang **Win + Shift + R** (Snipping Tool → Record). Kung may sariling screen recorder ang laptop mo, iyon na lang ang gamitin.'], see: 'Lalabo ang screen at may maliit na toolbar sa itaas.' },
    { do: ['I-drag ang kahon sa **buong screen**. I-on ang **microphone** sa toolbar.'], see: 'Naka-on ang mic icon (walang guhit).' },
    { do: ['I-click ang **Start**. Para tumigil, i-click ang pulang **Stop**. Naka-save sa **Videos → Screen Recordings**.'], see: 'May timer habang nagre-record.' },
    { do: ['Mag-test muna ng 10 segundo: magsalita, i-stop, panoorin. Dapat malinaw ang boses at nababasa ang text.'], see: 'Malinaw na test video.' }
  ]),
  h2('1.2 Ihanda ang dalawang window'),
  steps([
    { do: ['**Chrome** → https://omeconnect.vercel.app → **Continue with Google** → piliin ang demo account. Naka-tsek ang **Keep me signed in**.'], see: 'Customer **Home** screen.' },
    { do: ['Pindutin ang **F12**, tapos **Ctrl + Shift + M**, piliin ang **iPhone 12 Pro** para mukhang cellphone. Sa DevTools: **⋮ → Dock side → Undock**, tapos i-minimize ang DevTools.'], see: 'Customer app na kasing-laki ng cellphone.' },
    { do: ['**Win + Left arrow** para mapunta sa kaliwa ang customer app.'], see: 'Customer app sa kaliwa.' },
    { do: ['**Microsoft Edge** → buksan ang staff console link → mag-sign in (email, password, at 6-digit code sa authenticator). **Huwag i-record ang password at code.**'], see: '**Overview** at ang role chip na **Supervisor**.' },
    { do: ['Itago ang address: Edge **⋯ → Apps → Install this site as an app → Install**. **Win + Right arrow** para mapunta sa kanan.'], see: 'Customer sa kaliwa, staff console sa kanan, walang address bar.' }
  ]),
  h2('1.3 Huling check'),
  tick('Naka-**Do not disturb** ang laptop (**Win + N** → bell icon) para walang ibang pop-up.'),
  tick('Bukas ang slides (PowerPoint): Title, Problem, Team roles, Architecture (docs/OMECOnnect_Conceptual_Architecture.png), **Week 2 — Announcements & Notifications**, Thank you.'),
  tick('**Huwag ipakita** ang password, code, API keys o detalye ng ibang customer. (Week 2: naka-allow ang notifications sa phone.)')
);

// ================================================================ WEEK 1
children.push(
  h1('2. WEEK 1 — Overview'),
  banner('WEEK 1 · Bills, outages, due dates at concerns', NAVY),
  space(),
  table([2000, 7026], ['Member', 'Task sa Week 1'], [
    ['Front-End', 'Mag-design ng madaling gamitin na UI para sa pag-monitor ng electric bills, power outage announcements, due dates at consumer concerns — para sa consumers, field staff at admin.'],
    ['Back-End 1', 'Gumawa ng user-authenticated na mobile platform para sa residential, commercial at industrial consumers para ma-track ang bills, outage announcements at payment due dates.'],
    ['Back-End 2', 'Gumawa ng secure na mobile app para sa OMECO member-consumers: pag-manage ng accounts, pag-report ng power interruptions, at real-time billing alerts.']
  ]),
  space(),
  table([1600, 2600, 3426, 1400], ['Part', 'Magsasalita', 'Ipapakita', 'Oras'], [
    ['Opening', 'Lahat', 'Problema, layunin, roles', '0:00 – 1:30'],
    ['Part 1', 'Front-End', 'Home, Bills, Statement, Estimator, Alerts, Concerns, staff console', '1:30 – 6:00'],
    ['Part 2', 'Back-End 1', 'Sign-in, 2FA, rates, live na pag-post ng bill, due-date reminders', '6:00 – 10:00'],
    ['Part 3', 'Back-End 2', 'Link account, Report no power, real-time alerts, security', '10:00 – 14:00'],
    ['Closing', 'Lahat', 'Buod at pasasalamat', '14:00 – 15:00']
  ]),
  space(),
  callout('Demo data:', 'Customer account 1234567890 (Residential, San Jose, Barangay 5). November 2026 bill: UNPAID, ₱2,374.41, due Dec 2. Ang mga LIVE na gagawin: mag-post ng December bill (13037 → 13210 = 173 kWh = ₱2,185.41), mag-link ng account 05-0500-0001, at mag-report ng walang kuryente.')
);

children.push(
  h1('3. Week 1 — Opening (lahat)'),
  ...scene('Scene W1-O · Pagpapakilala', '0:00 – 1:30', 'Front-End, Back-End 1, Back-End 2'),
  steps([
    { do: ['Simulan ang recorder. Ipakita ang **Slide 1 (Title)**. Maghintay ng 2 segundo bago magsalita.'], see: 'OMECOnnect logo at pangalan ng team.', say: [
      '[Front-End] Magandang araw po! Kami po ang team na gumawa ng OMECOnnect — isang mobile app para sa Occidental Mindoro Electric Cooperative, o OMECO.'
    ] },
    { do: ['**→** para sa **Slide 2 (Problem)**.'], see: 'Mahabang pila, nakakalimutang due date, huli na nalalaman ang brownout.', say: [
      '[Back-End 1] Sa ngayon, maraming member-consumers ang pumupunta pa sa opisina para lang malaman ang bill nila. May mga nakakalimot sa due date, at madalas huli na nilang nalalaman na may brownout. Ang mga reklamo naman ay sa telepono lang, kaya mahirap i-follow up.',
      'Kaya ginawa namin ang OMECOnnect: nasa iisang app na ang bill, due date, outage announcements at concerns.'
    ] },
    { do: ['**Slide 3 (Team roles)**.'], see: 'Tatlong role at mga pangalan.', say: [
      '[Front-End] Ako po ang gumawa ng user interface at user experience — para sa consumers, field staff at admin.',
      '[Back-End 1] Ako po ang gumawa ng user-authenticated platform para sa residential, commercial at industrial consumers.',
      '[Back-End 2] Ako naman po ang gumawa ng security: pag-manage ng accounts, pag-report ng power interruption, at real-time billing alerts.'
    ] },
    { do: ['I-stop ang recording.'] }
  ])
);

children.push(
  h1('4. Week 1 — Part 1: Front-End Programmer'),
  p('Layunin: ipakita ang madaling gamitin na UI para sa bills, outage announcements, due dates at concerns. Titingnan lang — walang babaguhing data.'),
  ...scene('Scene W1-1 · Home screen', '1:30 – 2:30', 'Front-End'),
  steps([
    { do: ['Simulan ang recorder. I-click ang customer window → **Home**.'], see: 'Malaking **Amount due ₱2,374.41** at **Due date: Dec 2, 2026**, may **View bills** at **Report issue**.', say: [
      'Ito po ang home screen ng consumer. Ang tanong na sinagot ko sa design: magkano ang babayaran ko at kailan ang due date? Kaya pinakamalaki sa screen ang amount due at ang due date.'
    ] },
    { do: ['Ituro ang **Power in your area** (huwag pang pindutin ang Report no power).'], see: 'Power status ng Barangay 5, San Jose.', say: [
      'Sa ibaba, makikita agad ang power status ng sariling barangay ng consumer. Kung may brownout, isang tap lang para mag-report.'
    ] },
    { do: ['Mag-scroll pababa sa **Usage history** chart.'], see: 'Mga bar mula June hanggang November.', say: [
      'Ito naman ang usage chart — makikita ng consumer kung bakit tumaas o bumaba ang bill niya bawat buwan.'
    ] }
  ]),
  ...scene('Scene W1-2 · Bills at Statement of Account', '2:30 – 3:30', 'Front-End'),
  steps([
    { do: ['I-tap ang **Bills** sa ibaba.'], see: 'November **Unpaid**, June–October **Paid**.', say: [
      'Sa Bills, nakalista lahat ng bill. May kulay ang status — amber kapag hindi pa bayad, green kapag bayad na — para isang tingin lang, alam na.'
    ] },
    { do: ['I-tap ang **November 2026** → **View statement (receipt)**.'], see: 'Online Statement of Account na may 18 rate lines at barcode.', say: [
      'Ito po ang online Statement of Account. Ginaya ko ang itsura ng papel na bill ng OMECO para pamilyar sa mga tao — kumpleto ang charges, meter reading, at may barcode para sa cashier.'
    ] },
    { do: ['I-click ang **Print / Save as PDF** → **Cancel**. Isara ang statement.'], see: 'A4 print preview.', say: [
      'Puwede rin itong i-print o i-save bilang PDF.'
    ] }
  ]),
  ...scene('Scene W1-3 · Bill estimator', '3:30 – 4:15', 'Front-End'),
  steps([
    { do: ['Sa **Bills** i-tap ang **Estimate my next bill** → tab na **kWh** → i-type ang **188**.'], see: 'Tantiyang bill na **₱2,374.41**.', say: [
      'Ito ang bill estimator. Kapag nag-type ako ng 188 kilowatt-hours, lumalabas ang eksaktong halaga ng November bill — kasi parehong rate schedule ang gamit.'
    ] },
    { do: ['Tab na **Meter reading**: Previous **13037**, Present **13210**. Isara.'], see: '173 kWh ≈ ₱2,185.41.', say: [
      'Puwede ring i-type ang reading sa metro. Tandaan po natin ang 2,185 pesos — ipo-post mamaya ng teammate ko ang totoong December bill.'
    ] }
  ]),
  ...scene('Scene W1-4 · Alerts, Concerns, Filipino at dark mode', '4:15 – 5:00', 'Front-End'),
  steps([
    { do: ['I-tap ang **Alerts**, mag-scroll sa **OMECO advisories**.'], see: 'Mga notification at ang advisory para sa San Jose.', say: [
      'Sa Alerts, nandito lahat ng notification at ang mga announcement ng OMECO para sa lugar ng consumer.'
    ] },
    { do: ['I-tap ang **Concerns** → sa “Low voltage” i-tap ang **View updates**.'], see: 'Timeline: Submitted → Under review → In progress → Resolved.', say: [
      'Bawat concern ay may tracking number at timeline, parang nagta-track ng parcel. Laging alam ng consumer kung nasaan na ang reklamo niya.'
    ] },
    { do: ['**Home** → i-tap ang **EN** (magiging Filipino) → i-tap ang **buwan** (dark mode) → ibalik pareho.'], see: 'Filipino at dark mode, tapos balik sa dati.', say: [
      'May English at Filipino ang app, at may dark mode para sa gabi.'
    ] }
  ]),
  ...scene('Scene W1-5 · Staff console para sa admin at field staff', '5:00 – 6:00', 'Front-End'),
  steps([
    { do: ['Staff window → **Overview** → i-click ang **bell**.'], see: 'Summary cards; bumubukas ang notification drawer sa kaliwa.', say: [
      'Para sa OMECO staff, may hiwalay na console. Sa Overview, kita agad ang dapat asikasuhin, at ang notifications ay bumubukas sa gilid para hindi natatakpan ang trabaho.'
    ] },
    { do: ['Isara ang drawer → **Complaints** → i-click ang tabs na **Open**, **Assigned to me**, **Overdue**.'], see: 'Mga concern na may status, assigned staff at deadline.', say: [
      'Para sa field staff, may tabs dito — kaya ang lineman ay makikita lang ang sarili niyang trabaho, at naka-mark ang mga late na. Iyan po ang front end.'
    ] },
    { do: ['I-stop ang recording.'] }
  ])
);

children.push(
  h1('5. Week 1 — Part 2: Back-End Programmer 1'),
  p('Layunin: user-authenticated na platform para sa residential, commercial at industrial consumers para ma-track ang bills, outage announcements at due dates.'),
  ...scene('Scene W1-6 · Authentication at seguridad ng data', '6:00 – 7:15', 'Back-End 1'),
  steps([
    { do: ['Simulan ang recorder. Customer → **Profile**.'], see: '**Verified account 1234567890**.', say: [
      'Lahat ng screen na nakita ninyo ay kailangan ng sign-in. Gumagamit kami ng Supabase Auth — puwede ang email at password, Google, o one-time code sa text.',
      'Kapag bagong sign-up, wala pang makikitang bill. Kailangan munang i-verify ng staff ang OMECO account number. Para hindi makita ng ibang tao ang bill ng iba.'
    ] },
    { do: ['Staff window: ituro ang role chip na **Supervisor** (huwag i-click ang Sign out).'], see: 'Role chip sa itaas.', say: [
      'Mas mahigpit sa staff: pagkatapos ng password, kailangan pa ng six-digit code mula sa authenticator app — iyan ang two-factor authentication. Ang database mismo ang nagche-check nito.',
      'Gumagamit din kami ng row-level security: ang bawat consumer ay makakabasa lang ng sariling data, kahit tawagin pa nang direkta ang API.'
    ] }
  ]),
  ...scene('Scene W1-7 · Rates para sa residential, commercial at industrial', '7:15 – 8:00', 'Back-End 1'),
  steps([
    { do: ['Staff → **Bills** → buksan ang **Full rate schedule**. Isara nang hindi nagse-save.'], see: '18 rate lines: Generation, Distribution, VAT, Universal charges...', say: [
      'Ang bill ay kinukuwenta mula sa rate schedule na nasa database. Hiwalay ang rates ng residential, commercial at industrial, at may effective date — kaya hindi nababago ang lumang bills kapag nagbago ang rate.'
    ] }
  ]),
  ...scene('Scene W1-8 · LIVE: mag-post ng December bill', '8:00 – 9:15', 'Back-End 1'),
  steps([
    { do: ['Sa **New bill**: **Verified account** → **1234567890**, **Billing month** → **December 2026**, **Due date** → **01/04/2027**.'], see: 'Napunan ang form.', say: [
      'Ngayon, magpo-post tayo ng totoong bill para sa consumer.'
    ] },
    { do: ['Buksan ang **Meter reading & statement details**: **Previous reading 13037**, **Present reading 13210**, **Customer type Residential**. I-click ang **Calculate from rate schedule**.'], see: '**173 kWh** at **₱2,185.41**.', say: [
      'Ang server ang nagkuwenta — 173 kilowatt-hours, 2,185 pesos at 41 centavos — pareho sa na-predict ng estimator kanina.'
    ] },
    { do: ['I-click ang **Add bill**. Tingnan agad ang customer window.'], see: 'May bagong alert at nag-update ang Home sa December bill.', say: [
      'Pag-click ko ng Add bill, gumagawa ang database trigger ng payment reference at notification. Ang Supabase Realtime ang nagpapadala nito sa phone ng consumer sa loob ng isang segundo.'
    ] }
  ]),
  ...scene('Scene W1-9 · Due-date reminders', '9:15 – 10:00', 'Back-End 1'),
  steps([
    { do: ['Customer → **Alerts**. Ituro ang listahan.'], see: 'Mga bill at reminder notification.', say: [
      'Automatic ang paalala sa due date. May scheduled job gamit ang pg_cron na tumatakbo araw-araw: nagpapaalala tatlong araw bago ang due date, sa mismong due date, at kapag overdue na. Walang kailangang pumindot.',
      'Ngayon, ipapakita naman ng teammate ko ang security at alerts.'
    ] },
    { do: ['I-stop ang recording.'] }
  ])
);

children.push(
  h1('6. Week 1 — Part 3: Back-End Programmer 2'),
  p('Layunin: secure na app para sa member-consumers — pag-manage ng accounts, pag-report ng power interruption, at real-time billing alerts.'),
  ...scene('Scene W1-10 · LIVE: mag-link ng pangalawang account', '10:00 – 11:15', 'Back-End 2'),
  steps([
    { do: ['Simulan ang recorder. Customer → **Profile** → sa **Link another OMECO account** i-type ang **05-0500-0001** → **Request verification**.'], see: 'Naipadala na ang request.', say: [
      'Maraming member ang may higit sa isang koneksyon, halimbawa bahay at tindahan. Puwedeng mag-request na i-link ang isa pang account — pero request pa lang ito, wala pang makikitang bill.'
    ] },
    { do: ['Staff → **Verification** → sa 05-0500-0001 i-click ang **Approve** → **Approve and link account**.'], see: 'Customer: alert na **Account verified**.', say: [
      'Chine-check ng staff sa records ng OMECO. Ang staff lang na may tamang permission ang puwedeng mag-approve — ipinapatupad ito sa loob ng database. Pag-approve, may audit log at nano-notify agad ang consumer.'
    ] }
  ]),
  ...scene('Scene W1-11 · LIVE: Report no power', '11:15 – 12:30', 'Back-End 2'),
  steps([
    { do: ['Customer → **Home** → **Report no power** → **Tap again to confirm**.'], see: '“Report sent. Tracking number OMC-…”.', say: [
      'Isang tap lang para mag-report ng brownout; may pangalawang tap para iwas sa pagkakamali. Naka-save ito kasama ang barangay at tracking number.'
    ] },
    { do: ['Staff → **Complaints** → **Outages by area** → **Mark power restored** → i-tsek ang **Also post an advisory** → **Resolve 1 report**.'], see: 'Customer: alert at power card na may kuryente na.', say: [
      'Sa staff, naka-group ang reports per barangay. Kapag naayos na, isang click lang para ma-resolve lahat, ma-notify ang bawat bahay, at mag-post ng advisory.'
    ] }
  ]),
  ...scene('Scene W1-12 · Real-time alerts at security', '12:30 – 14:00', 'Back-End 2'),
  steps([
    { do: ['Staff → **Complaints** → sa “Billing concerns” i-click ang **Update** → **In progress** → mag-type ng maikling mensahe → **Save and notify customer**.'], see: 'Customer: bagong alert; sa **View updates** may bagong hakbang.', say: [
      'Kapag in-update ng staff ang concern, naitatala ito sa history table at agad na nakakatanggap ng alert ang consumer.'
    ] },
    { do: ['Staff → **Security** → **Staff and roles**, tapos **Audit log**.'], see: 'Roles at listahan ng lahat ng ginawa kanina.', say: [
      'May roles ang staff, at ang bawat mahalagang action ay naitatala sa audit log — sino, ano, at kailan. Automatic din ang backup ng database tuwing gabi. Salamat po.'
    ] },
    { do: ['I-stop ang recording.'] }
  ])
);

children.push(
  h1('7. Week 1 — Closing (lahat)'),
  steps([
    { do: ['Simulan ang recorder. Ipakita ang dalawang window, tapos ang **Slide 5 (Thank you)**.'], see: 'Customer Home at staff Overview.', say: [
      '[Front-End] Bilang buod: nakikita ng consumer ang bills, due dates, announcements at concerns sa iisang madaling app.',
      '[Back-End 1] Naka-authenticate ito para sa residential, commercial at industrial, at automatic ang computation at reminders.',
      '[Back-End 2] At secure ito: verified accounts, two-factor para sa staff, roles, audit log at real-time alerts.',
      '[Lahat] Maraming salamat po sa panonood!'
    ] },
    { do: ['Maghintay ng 2 segundo, i-stop ang recording.'] }
  ])
);

// ================================================================ WEEK 2
children.push(
  h1('8. WEEK 2 — Overview'),
  banner('WEEK 2 · Announcements at Notifications', 'B26A00'),
  space(),
  table([2000, 7026], ['Member', 'Task sa Week 2'], [
    ['Front-End', 'Mag-design at gumawa ng announcement at notification interface: announcement displays, notification icons, unread indicators at notification history, para madaling makita ng customer ang mahahalagang update ng OMECO.'],
    ['Back-End 1', 'I-plan at i-supervise ang announcement at notification feature, i-manage ang system integration, at siguraduhing tama at nasa oras ang natatanggap na update ng customers.'],
    ['Back-End 2', 'Gumawa ng database at server-side functions para sa paggawa, pag-manage at pag-publish ng announcements, at ng notification delivery para sa billing schedules, power interruptions, payment reminders at iba pang OMECO updates.']
  ]),
  small('Paalala: sa ibinigay na task, parehong nakalista sa Back-End 1 ang dalawang task. Dahil dalawa ang back-end programmer, hinati namin: ang una kay **Back-End 1**, ang pangalawa kay **Back-End 2**. Palitan kung iba ang hatian ninyo.'),
  table([1600, 2600, 3426, 1400], ['Part', 'Magsasalita', 'Ipapakita', 'Oras'], [
    ['Opening', 'Lahat', 'Ano ang bago ngayong Week 2', '0:00 – 1:00'],
    ['Part 1', 'Front-End', 'Alerts badge, unread, history, advisories, pop-up', '1:00 – 5:30'],
    ['Part 2', 'Back-End 1', 'Plano at daloy (flow), integration, LIVE na end-to-end test', '5:30 – 9:30'],
    ['Part 3', 'Back-End 2', 'Tables, triggers, publish, reminders, push function', '9:30 – 14:00'],
    ['Closing', 'Lahat', 'Buod at pasasalamat', '14:00 – 15:00']
  ]),
  space(),
  callout('LIVE na gagawin sa Week 2:', '(1) Mag-publish ng announcement: “Power interruption: San Jose, Dec 5” (Category: Power interruption, Area: San Jose, Mark as urgent). (2) I-Unpublish at i-Publish ulit. (3) Sa dulo, i-Delete ang test announcement. Kung uulitin ang take, i-Delete muna ang announcement sa staff console.')
);

children.push(
  h1('9. Week 2 — Opening (lahat)'),
  ...scene('Scene W2-O · Ano ang bago', '0:00 – 1:00', 'Lahat'),
  steps([
    { do: ['Simulan ang recorder. **Slide 1 (Title)**, tapos **Slide: Week 2 — Announcements & Notifications**.'], see: 'Title at Week 2 slide.', say: [
      '[Front-End] Magandang araw po ulit! Ngayong Week 2, ang focus namin ay ang announcements at notifications ng OMECOnnect.',
      '[Back-End 1] Ang layunin: lahat ng mahalagang update ng OMECO — bills, brownout, paalala sa bayad — ay makarating sa tamang customer, tama ang laman, at nasa oras.',
      '[Back-End 2] Ipapakita namin ang itsura sa app, ang daloy ng system, at ang database at server functions sa likod nito.'
    ] },
    { do: ['I-stop ang recording.'] }
  ])
);

children.push(
  h1('10. Week 2 — Part 1: Front-End Programmer'),
  p('Task: announcement at notification interface — announcement displays, notification icons, unread indicators at notification history.'),
  ...scene('Scene W2-1 · Notification icon at unread indicator', '1:00 – 2:00', 'Front-End'),
  steps([
    { do: ['Simulan ang recorder. Customer → **Home**. Ituro ang **Alerts** sa ibabang menu.'], see: 'Bell icon na may **pulang numero** (bilang ng hindi pa nababasa).', say: [
      'Ito po ang notification icon sa bottom navigation. Ang pulang numero ay ang unread indicator — ilan ang notification na hindi pa nababasa. Kapag lampas 9, “9+” ang lalabas para hindi masikip.',
      'Pinili ko ang bell icon dahil kilala na ito ng lahat bilang notifications, at pula ang badge para mapansin agad.'
    ] },
    { do: ['Ituro ang **Pop-ups** na button sa itaas ng Home.'], see: 'Maliit na bell button na “Pop-ups on”.', say: [
      'Dito naman makikita kung naka-on ang pop-up notifications sa phone. Automatic na itong nao-on pagkatapos mag-sign in — hindi na kailangang hanapin pa ng customer.'
    ] }
  ]),
  ...scene('Scene W2-2 · Notification history', '2:00 – 3:00', 'Front-End'),
  steps([
    { do: ['I-tap ang **Alerts**.'], see: 'Listahan sa ilalim ng **Notifications**; may **New** (amber) at **Read** (gray) na badge; naka-highlight ang mga bago.', say: [
      'Ito ang notification history. Nandito ang lahat ng update — bagong bill, bayad, paalala sa due date, at sagot sa concern.',
      'Ang hindi pa nababasa ay naka-highlight at may “New” na badge; ang nabasa na ay “Read”. Kaya kahit mabilis lang tumingin ang customer, alam niya kung alin ang bago.'
    ] },
    { do: ['I-tap ang isang **New** na notification.'], see: 'Naging **Read** ito at bumaba ang numero sa Alerts icon.', say: [
      'Kapag tinap ang notification, mamarkahan itong nabasa na at bababa agad ang bilang sa icon.'
    ] },
    { do: ['I-tap ang **Mark all as read**.'], see: 'Lahat ay naging **Read**; nawala ang pulang numero at ang button.', say: [
      'May “Mark all as read” din para isang tap lang. Lumalabas lang ang button na ito kapag may hindi pa nababasa — para malinis ang screen.'
    ] }
  ]),
  ...scene('Scene W2-3 · Announcement display', '3:00 – 4:00', 'Front-End'),
  steps([
    { do: ['Sa **Alerts**, mag-scroll pababa sa **OMECO advisories**.'], see: 'Mga card na may category tag (hal. **Scheduled maintenance**), pamagat, mensahe at petsa.', say: [
      'Ito naman ang announcement display. Bawat announcement ay card na may category tag — halimbawa Scheduled maintenance o Power interruption — may pamagat, mensahe at petsa.',
      'Ang mga urgent na announcement ay may ibang kulay para mapansin agad. Ang nakikita lang ng customer ay ang para sa sarili niyang lugar.'
    ] },
    { do: ['**Home** → ituro ang **Power in your area**.'], see: 'Advisory para sa Barangay 5, San Jose sa loob ng power card.', say: [
      'Lumalabas din sa Home ang advisory para sa barangay niya, kaya hindi na kailangang hanapin.'
    ] }
  ]),
  ...scene('Scene W2-4 · Pop-up notification', '4:00 – 5:30', 'Front-End (sabay sa staff window)'),
  steps([
    { do: ['Staff → **Announcements**. **Title**: Power interruption: San Jose, Dec 5. **Message**: May line maintenance sa Barangay 5 mula 8 AM hanggang 12 NN. **Category** → **Power interruption**. **Affected area** → **San Jose**. I-tsek ang **Mark as urgent**. Naka-tsek ang **Publish now**.'], see: 'Napunan ang form.', say: [
      'Ngayon, ipapakita ko kung paano lumalabas ang bagong announcement sa customer. Magpo-post ako ng urgent na power interruption para sa San Jose.'
    ] },
    { do: ['I-click ang **Publish announcement**. Tingnan agad ang customer window.'], see: 'Bumaba mula sa itaas ang **pop-up banner** na may tunog, at tumaas ang pulang numero sa **Alerts**.', say: [
      'Ayan po — lumabas agad ang pop-up sa itaas ng screen, may tunog at vibration, parang notification ng ibang apps. Tumaas din ang numero sa Alerts icon.',
      'Kapag naka-close ang app, lalabas pa rin ito bilang totoong notification sa Android phone.'
    ] },
    { do: ['I-tap ang **pop-up banner**.'], see: 'Napunta sa **Alerts**; nasa itaas ng **OMECO advisories** ang bagong urgent na announcement.', say: [
      'Kapag tinap ang pop-up, diretso na sa Alerts at makikita ang buong announcement. Iyan po ang announcement at notification interface. Ipapaliwanag naman ng mga back-end kung paano ito gumagana sa likod.'
    ] },
    { do: ['I-stop ang recording.'] }
  ])
);

children.push(
  h1('11. Week 2 — Part 2: Back-End Programmer 1'),
  p('Task: i-plan at i-supervise ang feature, i-manage ang system integration, at siguraduhing tama at nasa oras ang updates.'),
  ...scene('Scene W2-5 · Ang plano at daloy (flow)', '5:30 – 7:00', 'Back-End 1'),
  steps([
    { do: ['Simulan ang recorder. Ipakita ang **Architecture slide**. Ituro ang daloy gamit ang mouse: Staff console → Supabase database → Realtime / send-push → customer app at Android phone.'], see: 'Conceptual Architecture diagram.', say: [
      'Ako po ang nag-plano at nag-supervise ng announcement at notification feature. Ganito ang daloy:',
      'Una, gagawa ang staff ng announcement sa console. Pangalawa, ise-save ito sa database. Pangatlo, may trigger na gagawa ng notification para sa bawat customer na nasa lugar na iyon.',
      'Pang-apat, dalawang paraan ang paghahatid: Supabase Realtime kapag bukas ang app, at push notification sa pamamagitan ng send-push function kapag sarado ang app.'
    ] },
    { do: ['(Opsyonal) Ipakita ang slide na may tatlong salita: **Tama · Nasa oras · Para sa tamang tao**.'], see: 'Tatlong prinsipyo.', say: [
      'Tatlo ang sinigurado namin: tama ang laman — galing mismo sa database ang ipinapakita; nasa oras — ilang segundo lang mula pag-publish; at para sa tamang tao — naka-target ayon sa service area at sa account ng customer.'
    ] }
  ]),
  ...scene('Scene W2-6 · System integration', '7:00 – 8:00', 'Back-End 1'),
  steps([
    { do: ['Staff → **Announcements**. Ituro ang listahan sa **All announcements**: ang **Urgent**, **Published** o **Draft** na badge, at ang **Unpublish** / **Delete**.'], see: 'Ang bagong announcement na may **Urgent** at **Published**.', say: [
      'Pinagsasama-sama ng integration ang staff console, ang database, ang customer app, at ang Android notifications. Iisang database ang pinagkukunan ng lahat, kaya pare-pareho ang nakikita ng staff at ng customer.',
      'May Draft din: puwedeng isulat muna ang announcement nang hindi pa ipinapadala, at i-publish kapag handa na.'
    ] }
  ]),
  ...scene('Scene W2-7 · LIVE: end-to-end test (tama at nasa oras)', '8:00 – 9:30', 'Back-End 1'),
  steps([
    { do: ['Sa bagong announcement i-click ang **Unpublish**. Tingnan ang customer **Alerts**.'], see: 'Nawala ang announcement sa **OMECO advisories**.', say: [
      'I-test natin. Kapag in-unpublish ko, mawawala agad ito sa app ng customer — kaya hindi nakakakita ang customer ng maling o lumang impormasyon.'
    ] },
    { do: ['I-click ang **Publish** ulit. Tingnan ang customer window.'], see: 'Bumalik ang announcement at may bagong pop-up at alert.', say: [
      'Kapag ni-publish ko ulit, babalik ito at may bagong notification — ilang segundo lang. Ganito namin sinisigurado na nasa oras ang update.'
    ] },
    { do: ['Staff → **Security** → **Audit log**.'], see: 'Naitala ang paggawa at pagbabago ng announcement.', say: [
      'Bilang supervisor ng feature, mahalaga rin na may record: naitatala sa audit log kung sino ang nag-publish at kailan. Ngayon, ipapaliwanag ng teammate ko ang database at server functions.'
    ] },
    { do: ['I-stop ang recording.'] }
  ])
);

children.push(
  h1('12. Week 2 — Part 3: Back-End Programmer 2'),
  p('Task: database at server-side functions para sa paggawa, pag-manage at pag-publish ng announcements, at notification delivery para sa billing schedules, power interruptions, payment reminders at iba pa.'),
  callout('Ingat:', 'Sa Supabase dashboard, buksan lang ang Table Editor, Database, Integrations at Edge Functions. Huwag buksan ang Project Settings → API Keys, at huwag ipakita ang personal na data ng ibang customer.'),
  ...scene('Scene W2-8 · Ang database tables', '9:30 – 10:45', 'Back-End 2'),
  steps([
    { do: ['Simulan ang recorder. Buksan ang **Supabase dashboard** → **Table Editor** → table na **announcements**.'], see: 'Columns: title, content, category, affected_area, is_urgent, is_published, published_at.', say: [
      'Ako po ang gumawa ng database at server-side functions. Ito ang announcements table: may title, content, category, affected area, kung urgent, at kung published na.',
      'Ang affected area ang ginagamit para i-target kung sinong customers ang makakatanggap.'
    ] },
    { do: ['Buksan ang table na **notifications**.'], see: 'Columns: user_id, title, message, type, is_read, created_at, announcement_id, bill_id.', say: [
      'Ito naman ang notifications table — isang row para sa bawat customer. Ang is_read ang ginagamit ng unread indicator na ipinakita ng front-end. May row-level security ito: ang customer ay makakabasa lang ng sarili niyang notifications.'
    ] }
  ]),
  ...scene('Scene W2-9 · Triggers: paggawa at pag-publish', '10:45 – 12:00', 'Back-End 2'),
  steps([
    { do: ['**Database** → **Triggers** (piliin ang schema na **public**). Ituro ang **announcement_customer_notifications** at **new_bill_customer_notification**.'], see: 'Listahan ng triggers.', say: [
      'Ito ang mga trigger. Kapag may na-publish na announcement, tumatakbo ang announcement_customer_notifications: hinahanap nito ang lahat ng verified na customer sa affected area at gumagawa ng notification para sa bawat isa.',
      'Ganoon din sa bills: kapag may bagong bill, ang new_bill_customer_notification ang gumagawa ng paalala para sa may-ari ng account.'
    ] },
    { do: ['Ituro ang **push_new_notification** trigger.'], see: 'Trigger sa notifications table.', say: [
      'At kapag may bagong notification row, ang push_new_notification ang tumatawag sa send-push server function para lumabas ito sa phone — kahit sarado ang app.'
    ] }
  ]),
  ...scene('Scene W2-10 · Payment reminders at billing schedule', '12:00 – 13:00', 'Back-End 2'),
  steps([
    { do: ['**Integrations** → **Cron** (o Database → Cron Jobs). Ituro ang **omeconnect-bill-reminders**.'], see: 'Job na tumatakbo araw-araw.', say: [
      'Para sa payment reminders at billing schedule, gumamit kami ng pg_cron. Araw-araw tumatakbo ang omeconnect-bill-reminders: tatlong araw bago ang due date, sa mismong due date, at isang araw pagka-overdue, nagpapadala ito ng paalala.',
      'Hindi nauulit ang paalala dahil may record sa bawat bill kung kailan na naipadala.'
    ] }
  ]),
  ...scene('Scene W2-11 · Delivery: ang send-push function', '13:00 – 14:00', 'Back-End 2'),
  steps([
    { do: ['**Edge Functions** → **send-push** → tab na **Logs** (o Invocations).'], see: 'Mga tawag kanina na may status 200.', say: [
      'Ito ang send-push function na tumatakbo sa server. Gumagamit ito ng Web Push na may VAPID keys na nasa server lang — hindi kailanman nasa app.',
      'Kapag sinabi ng Google na expired na ang registration ng isang phone, binubura ito ng function, at kusang nagre-register ulit ang app pagbukas — kaya hindi tumitigil ang notifications.'
    ] },
    { do: ['Balik sa staff console → **Announcements** → sa test announcement i-click ang **Delete** → kumpirmahin.'], see: 'Nawala ang test announcement.', say: [
      'Sa huli, puwede ring burahin ang announcement — kasama nitong nabubura ang mga notification nito. Iyan po ang database at server side ng announcements at notifications. Salamat po.'
    ] },
    { do: ['I-stop ang recording.'] }
  ])
);

children.push(
  h1('13. Week 2 — Closing (lahat)'),
  steps([
    { do: ['Simulan ang recorder. Ipakita ang customer **Alerts** at ang **Slide: Thank you**.'], see: 'Alerts screen at Thank you slide.', say: [
      '[Front-End] Sa Week 2, ginawa namin ang announcement at notification interface — may icon, unread indicator, history at pop-up.',
      '[Back-End 1] Pinlano at pinagsama namin ang buong daloy para tama at nasa oras ang updates.',
      '[Back-End 2] At ginawa namin ang database, triggers, reminders at push function para maihatid ito sa bawat customer.',
      '[Lahat] Maraming salamat po sa panonood!'
    ] },
    { do: ['Maghintay ng 2 segundo, i-stop ang recording.'] }
  ])
);

// ================================================================ TROUBLESHOOTING + JOIN
children.push(
  h1('14. Kung may problema habang nagre-record'),
  table([3300, 5726], ['Problema', 'Gawin'], [
    ['Hindi agad lumabas ang alert sa customer', 'I-tap ang Alerts o i-pull down para mag-refresh. Sabihin: “Nag-a-update din ito kapag ni-refresh.” Ituloy lang ang recording.'],
    ['Walang tunog ang pop-up sa app', 'Mag-tap muna kahit saan sa customer app bago mag-publish (kailangan ito ng browser bago magpatunog).'],
    ['Humihingi ulit ng code ang staff console', 'I-pause ang recording, mag-sign in, ituloy. Huwag i-record ang code.'],
    ['“Present reading is lower than the previous reading.”', 'Nagkapalit ang numbers: Previous 13037, Present 13210.'],
    ['Nandoon pa ang December bill (pangalawang take)', 'Patakbuhin ang Part A ng backend/database/scripts/demo_data_cleanup.sql sa Supabase → SQL Editor, tapos i-reload ang dalawang window.'],
    ['Nandoon pa ang test announcement (Week 2 retake)', 'Staff → Announcements → Delete ang test announcement, tapos simulan ulit.'],
    ['Nagkamali sa pagsasalita', 'Tumigil ng 3 segundo, ulitin ang pangungusap. Putulin ang mali sa editing.']
  ]),
  space(),
  h2('Pagdugtungin ang mga clip (Clipchamp)'),
  steps([
    { do: ['Buksan ang **Clipchamp** (Start → i-type ang Clipchamp) → **Create a new video**.'], see: 'Walang lamang editor.' },
    { do: ['I-drag ang mga clip mula sa **Videos → Screen Recordings** sa tamang pagkakasunod: Opening, Front-End, Back-End 1, Back-End 2, Closing.'], see: 'Limang clip na magkakasunod.' },
    { do: ['Putulin ang mahahabang tigil: i-click ang clip, ilipat ang playhead, pindutin ang **S**, burahin ang hindi kailangan.'], see: 'Mas maiikling clip.' },
    { do: ['Optional: magdagdag ng **Text** sa simula ng bawat part (hal. “Week 2 · Back-End 2: <pangalan>”).'], see: 'May pamagat ang bawat part.' },
    { do: ['Panoorin ulit: walang password, code, personal na detalye, o address ng staff console. Kung meron, gamitin ang **Effects → Blur** o i-crop.', 'I-click ang **Export → 1080p**.'], see: 'Isang mp4 file na handa nang i-submit.' }
  ])
);
const doc = new Document({
  creator: 'OMECOnnect team',
  title: 'OMECOnnect Week 1 and Week 2 Video Script',
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
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t('OMECOnnect · Week 1 & Week 2 Video Script', { size: 16, color: GREY })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [t('Page ', { size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GREY }), t(' of ', { size: 16, color: GREY }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: GREY })] })] }) },
    children
  }]
});

Packer.toBuffer(doc).then((buf) => {
  const out = process.argv[2];
  fs.writeFileSync(out, buf);
  console.log('written', out, buf.length, 'bytes');
});
