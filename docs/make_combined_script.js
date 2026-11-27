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
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [t('Video Script — Week 1 + Week 2 (isang recording)', { size: 34, color: GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 500 }, children: [t('Mabilis na bersyon: isang video, mga 15 minuto, may step-by-step sa screen', { size: 24, color: GREY })] }),
  rule(),
  table([3000, 6026], ['Role', 'Pangalan ng member'], [
    ['Front-End Programmer', '______________________________'],
    ['Back-End Programmer 1', '______________________________'],
    ['Back-End Programmer 2', '______________________________']
  ]),
  space(),
  p([t('Customer app: ', { bold: true }), t('https://omeconnect.vercel.app   ·   Staff console: private link (huwag ipakita ang address).')], { alignment: AlignmentType.CENTER }),
  space(),
  callout('Paano gamitin:', 'Kaliwa = eksaktong i-click (naka-bold ang pangalan ng button) at ang “Makikita mo”. Kanan = ang sasabihin. Mas maraming Tagalog; English ang technical terms. Sabihin nang natural, hindi kailangang word for word.')
);

// ================================================================ PLAN
children.push(
  h1('1. Ang plano (isang video para sa Week 1 at Week 2)'),
  p('Pinagsama ang Week 1 at Week 2 sa iisang video. Bawat member ay isang beses lang magsasalita, pero sakop na ang task niya sa dalawang linggo.'),
  table([1500, 1900, 4226, 1400], ['Part', 'Magsasalita', 'Sakop (Week 1 + Week 2)', 'Oras'], [
    ['Opening', 'Lahat', 'Problema, layunin, roles', '0:00 – 1:00'],
    ['Part 1', 'Front-End', 'W1: Home, bills, due date, concerns, staff console · W2: bell icon, unread badge, history, announcements, pop-up', '1:00 – 5:30'],
    ['Part 2', 'Back-End 1', 'W1: sign-in, 2FA, rates, live na bill · W2: plano at daloy, integration, test na tama at nasa oras', '5:30 – 10:00'],
    ['Part 3', 'Back-End 2', 'W1: link account, report no power, alerts · W2: tables, triggers, reminders, push function', '10:00 – 14:30'],
    ['Closing', 'Lahat', 'Buod at pasasalamat', '14:30 – 15:15']
  ]),
  space(),
  table([2000, 7026], ['Member', 'Mga task na ipapakita'], [
    ['Front-End', 'W1: madaling gamitin na UI para sa bills, outage announcements, due dates at concerns (consumers, field staff, admin). W2: announcement at notification interface — announcement displays, notification icons, unread indicators, notification history.'],
    ['Back-End 1', 'W1: user-authenticated platform para sa residential, commercial at industrial consumers (bills, outages, due dates). W2: i-plan at i-supervise ang announcement at notification feature, system integration, tama at nasa oras na updates.'],
    ['Back-End 2', 'W1: secure app — manage accounts, report power interruptions, real-time billing alerts. W2: database at server-side functions para sa announcements at notification delivery (billing, power interruptions, payment reminders).']
  ]),
  small('Paalala: sa ibinigay na task ng Week 2, parehong nakalista sa Back-End 1 ang dalawang task. Hinati namin: ang una kay **Back-End 1**, ang pangalawa kay **Back-End 2**. Palitan kung iba ang hatian ninyo.'),
  callout('Mga LIVE na gagawin (magkakadugtong):', '① Front-End: mag-publish ng announcement “Power interruption: San Jose, Dec 5”. ② Back-End 1: i-post ang December bill (13037 → 13210 = ₱2,185.41) at i-Unpublish/Publish ang announcement ni Front-End. ③ Back-End 2: i-link ang account 05-0500-0001, mag-Report no power, at sa dulo i-Delete ang announcement.')
);

// ================================================================ SETUP
children.push(
  h1('2. Bago mag-record (5 minuto lang)'),
  steps([
    { do: ['**Chrome** → https://omeconnect.vercel.app → **Continue with Google** (demo account). **F12** → **Ctrl + Shift + M** → **iPhone 12 Pro**. Sa DevTools **⋮ → Dock side → Undock**, i-minimize. **Win + Left arrow**.'], see: 'Customer app na mukhang cellphone, nasa kaliwa.' },
    { do: ['**Edge** → staff console → mag-sign in (password at 6-digit code — **huwag i-record**). **⋯ → Apps → Install this site as an app**. **Win + Right arrow**.'], see: 'Staff console sa kanan, walang address bar.' },
    { do: ['Buksan ang **Supabase dashboard** sa isa pang tab (para kay Back-End 2). Buksan ang slides: Title, Problem, Team roles, Architecture, Thank you.'], see: 'Handa ang lahat ng window.' },
    { do: ['**Win + N** → Do not disturb. Mag-tap kahit saan sa customer app (para may tunog ang pop-up).'], see: 'Walang ibang pop-up sa laptop.' },
    { do: ['Recorder: **Win + Shift + R** → buong screen → naka-on ang **microphone** → **Start**. Pang-stop: pulang **Stop**. Naka-save sa **Videos → Screen Recordings**.'], see: 'May timer habang nagre-record.' }
  ]),
  callout('Tip para mabilis:', 'Puwedeng tuloy-tuloy ang recording mula Opening hanggang Closing — ipasa lang ang mouse sa susunod na member. Kung magkamali, tumigil ng 3 segundo at ulitin ang pangungusap; puputulin na lang sa Clipchamp.')
);

// ================================================================ OPENING
children.push(
  h1('3. Opening — lahat (0:00 – 1:00)'),
  steps([
    { do: ['Simulan ang recorder. **Slide 1 (Title)**. Maghintay ng 2 segundo.'], see: 'OMECOnnect logo at pangalan.', say: [
      '[Front-End] Magandang araw po! Kami po ang team ng OMECOnnect — mobile app para sa Occidental Mindoro Electric Cooperative. Ipapakita namin ngayon ang progress namin sa Week 1 at Week 2.'
    ] },
    { do: ['**Slide 2 (Problem)**.'], see: 'Pila, nakakalimutang due date, huling balita sa brownout.', say: [
      '[Back-End 1] Maraming consumer ang pumupunta pa sa opisina para lang malaman ang bill, nakakalimot sa due date, at huli na nalalaman ang brownout. Kaya nasa iisang app na ngayon ang bills, due dates, announcements, notifications at concerns.'
    ] },
    { do: ['**Slide 3 (Team roles)**.'], see: 'Tatlong role.', say: [
      '[Front-End] Ako po ang sa interface at user experience.',
      '[Back-End 1] Ako po ang sa authentication, billing platform, at sa plano at integration ng notifications.',
      '[Back-End 2] Ako po ang sa security ng accounts, outage reports, at sa database at server functions ng announcements at notifications.'
    ] }
  ])
);

// ================================================================ FRONT-END
children.push(
  h1('4. Part 1 — Front-End Programmer (1:00 – 5:30)'),
  ...scene('Scene 1A · Bills at due date (Week 1)', '1:00 – 2:15', 'Front-End'),
  steps([
    { do: ['Customer → **Home**.'], see: 'Malaking **Amount due ₱2,374.41**, **Due date: Dec 2, 2026**, at **Power in your area**.', say: [
      'Ito po ang home screen ng consumer. Dinesign ko ito para sagutin agad: magkano ang babayaran at kailan ang due date? Kaya ito ang pinakamalaki. Sa ibaba, kita agad ang power status ng sariling barangay.'
    ] },
    { do: ['**Bills** → i-tap ang **November 2026** → **View statement (receipt)** → isara.'], see: 'Listahan na may Unpaid/Paid na kulay, at ang online Statement of Account.', say: [
      'Sa Bills, may kulay ang status — amber kapag hindi pa bayad, green kapag bayad na. At ito ang online Statement of Account na kamukha ng papel na bill ng OMECO, may barcode pa para sa cashier.'
    ] },
    { do: ['**Concerns** → sa “Low voltage” i-tap ang **View updates**.'], see: 'Timeline: Submitted → Under review → In progress → Resolved.', say: [
      'Bawat concern ay may tracking number at timeline, parang nagta-track ng parcel.'
    ] }
  ]),
  ...scene('Scene 1B · Notification icon, unread at history (Week 2)', '2:15 – 3:30', 'Front-End'),
  steps([
    { do: ['Ituro ang **Alerts** sa ibabang menu.'], see: 'Bell icon na may **pulang numero**.', say: [
      'Para sa Week 2, ginawa ko ang notification interface. Ito ang notification icon — ang pulang numero ay ang unread indicator, kung ilan ang hindi pa nababasa.'
    ] },
    { do: ['I-tap ang **Alerts**. I-tap ang isang notification na may **New**.'], see: 'Notification history; naging **Read** ang tinap at bumaba ang numero.', say: [
      'Ito ang notification history: bills, bayad, paalala at sagot sa concern. Naka-highlight at may “New” ang hindi pa nababasa. Kapag tinap, nagiging “Read” at bumababa agad ang bilang.'
    ] },
    { do: ['I-tap ang **Mark all as read**. Mag-scroll sa **OMECO advisories**.'], see: 'Nawala ang pulang numero; mga announcement card na may category tag.', say: [
      'May “Mark all as read” para isang tap lang. At ito ang announcement display — bawat card ay may category, pamagat at petsa, at para lang sa lugar ng consumer.'
    ] }
  ]),
  ...scene('Scene 1C · LIVE: bagong announcement at pop-up (Week 2)', '3:30 – 4:45', 'Front-End'),
  steps([
    { do: ['Staff → **Announcements**. **Title**: Power interruption: San Jose, Dec 5. **Message**: May line maintenance sa Barangay 5, 8 AM – 12 NN. **Category** → **Power interruption**. **Affected area** → **San Jose**. I-tsek ang **Mark as urgent**. I-click ang **Publish announcement**.'], see: 'Lumabas ang pop-up sa customer app.', say: [
      'Ngayon, magpo-post tayo ng urgent na announcement para makita ninyo ang pop-up.'
    ] },
    { do: ['Tingnan ang customer window. I-tap ang **pop-up**.'], see: 'Pop-up sa itaas na may tunog; tumaas ang numero sa Alerts; napunta sa **Alerts** at nasa itaas ang bagong announcement.', say: [
      'Ayan — lumabas agad ang pop-up na may tunog at vibration, at tumaas ang numero sa Alerts. Kapag tinap, diretso sa announcement. Kapag sarado ang app, lalabas ito bilang totoong notification sa Android phone.'
    ] }
  ]),
  ...scene('Scene 1D · Staff console para sa admin at field staff (Week 1)', '4:45 – 5:30', 'Front-End'),
  steps([
    { do: ['Staff → **Overview** → i-click ang **bell** → isara → **Complaints** → tabs na **Assigned to me** at **Overdue**.'], see: 'Summary cards, notification drawer sa kaliwa, at mga concern tab.', say: [
      'Para sa staff, may hiwalay na console. Ang notifications ay bumubukas sa gilid para hindi natatakpan ang trabaho, at ang field staff ay may sariling tabs — Assigned to me at Overdue. Iyan po ang front end.'
    ] }
  ])
);

// ================================================================ BACK-END 1
children.push(
  h1('5. Part 2 — Back-End Programmer 1 (5:30 – 10:00)'),
  ...scene('Scene 2A · Authentication at seguridad (Week 1)', '5:30 – 6:30', 'Back-End 1'),
  steps([
    { do: ['Customer → **Profile**. Ituro ang **Verified account 1234567890**. Staff: ituro ang **Supervisor** chip.'], see: 'Verified account at role chip.', say: [
      'Lahat ng screen ay kailangan ng sign-in gamit ang Supabase Auth — email at password, Google, o code sa text. Ang bagong user ay walang makikitang bill hangga’t hindi naa-approve ng staff ang account number niya.',
      'Sa staff, may two-factor authentication: password at six-digit code. At may row-level security ang database — ang bawat consumer ay sariling data lang ang nababasa.'
    ] }
  ]),
  ...scene('Scene 2B · LIVE: rates at December bill (Week 1)', '6:30 – 8:00', 'Back-End 1'),
  steps([
    { do: ['Staff → **Bills** → buksan sandali ang **Full rate schedule** → isara (huwag i-Save).'], see: '18 rate lines.', say: [
      'Ang bills ay kinukuwenta mula sa rate schedule — hiwalay para sa residential, commercial at industrial, may effective date pa.'
    ] },
    { do: ['**New bill**: **Verified account** 1234567890, **Billing month** December 2026, **Due date** 01/04/2027. **Meter reading & statement details**: Previous **13037**, Present **13210**, Customer type **Residential**. **Calculate from rate schedule** → **Add bill**.'], see: '173 kWh, ₱2,185.41; may bagong alert sa customer.', say: [
      'Ang server ang nagkuwenta: 173 kilowatt-hours, 2,185 pesos at 41 centavos. Pag-click ng Add bill, gumagawa ang trigger ng payment reference at notification, at dumarating agad sa consumer.'
    ] }
  ]),
  ...scene('Scene 2C · Plano at integration ng notifications (Week 2)', '8:00 – 9:00', 'Back-End 1'),
  steps([
    { do: ['**Architecture slide**. Ituro ang daloy: staff console → database → Realtime / send-push → customer app at phone.'], see: 'Conceptual Architecture diagram.', say: [
      'Para sa Week 2, ako ang nag-plano at nag-supervise ng announcement at notification feature. Ang daloy: gagawa ang staff ng announcement, ise-save sa database, gagawa ang trigger ng notification para sa bawat customer sa lugar na iyon, at ihahatid ito — Realtime kapag bukas ang app, push notification kapag sarado.',
      'Tatlo ang sinigurado namin: tama ang laman, nasa oras, at para sa tamang tao.'
    ] }
  ]),
  ...scene('Scene 2D · LIVE: test na tama at nasa oras (Week 2)', '9:00 – 10:00', 'Back-End 1'),
  steps([
    { do: ['Staff → **Announcements** → sa announcement ni Front-End i-click ang **Unpublish**. Tingnan ang customer **Alerts**.'], see: 'Nawala ang announcement sa customer.', say: [
      'I-test natin. Kapag in-unpublish, nawawala agad sa customer — kaya walang maling o lumang impormasyon.'
    ] },
    { do: ['I-click ang **Publish** ulit. Tapos **Security → Audit log**.'], see: 'Bumalik ang announcement na may bagong alert; nakatala sa audit log.', say: [
      'Kapag ni-publish ulit, babalik ito sa loob ng ilang segundo. At bawat publish ay nakatala sa audit log — sino at kailan. Automatic din ang paalala sa due date araw-araw. Ipapaliwanag ng teammate ko ang database sa likod nito.'
    ] }
  ])
);

// ================================================================ BACK-END 2
children.push(
  h1('6. Part 3 — Back-End Programmer 2 (10:00 – 14:30)'),
  ...scene('Scene 3A · LIVE: account at outage report (Week 1)', '10:00 – 11:45', 'Back-End 2'),
  steps([
    { do: ['Customer → **Profile** → **Link another OMECO account** → i-type **05-0500-0001** → **Request verification**. Staff → **Verification** → **Approve** → **Approve and link account**.'], see: 'Customer: alert na **Account verified**.', say: [
      'Puwedeng mag-link ng isa pang account, halimbawa bahay at tindahan — pero request muna, at staff na may tamang permission lang ang puwedeng mag-approve. Ipinapatupad ito sa database, at nano-notify agad ang consumer.'
    ] },
    { do: ['Customer → **Home** → **Report no power** → **Tap again to confirm**. Staff → **Complaints** → **Outages by area** → **Mark power restored** → **Resolve 1 report**.'], see: 'Tracking number; tapos alert na may kuryente na.', say: [
      'Isang tap lang para mag-report ng brownout, may kumpirmasyon para iwas-pagkakamali. Sa staff, naka-group per barangay, at isang click lang para ma-resolve at ma-notify ang lahat ng apektado.'
    ] }
  ]),
  callout('Ingat:', 'Sa Supabase dashboard, buksan lang ang Table Editor, Database, Integrations at Edge Functions. Huwag buksan ang Project Settings → API Keys.'),
  ...scene('Scene 3B · Database at triggers ng announcements (Week 2)', '11:45 – 13:15', 'Back-End 2'),
  steps([
    { do: ['**Supabase** → **Table Editor** → **announcements**, tapos **notifications**.'], see: 'Columns: title, category, affected_area, is_urgent, is_published · user_id, is_read, announcement_id, bill_id.', say: [
      'Para sa Week 2, ako ang gumawa ng database at server functions. Ang announcements table ay may category, affected area, urgent at published. Ang notifications table ay isang row bawat customer — ang is_read ang gamit ng unread indicator. May row-level security ito.'
    ] },
    { do: ['**Database** → **Triggers** (schema **public**): ituro ang **announcement_customer_notifications**, **new_bill_customer_notification** at **push_new_notification**.'], see: 'Listahan ng triggers.', say: [
      'Kapag may na-publish, hinahanap ng trigger ang lahat ng customer sa affected area at gumagawa ng notification. Ganoon din sa bagong bill. At ang push_new_notification ang tumatawag sa send-push para lumabas sa phone.'
    ] }
  ]),
  ...scene('Scene 3C · Reminders, push at pag-delete (Week 2)', '13:15 – 14:30', 'Back-End 2'),
  steps([
    { do: ['**Integrations** → **Cron**: ituro ang **omeconnect-bill-reminders**. Tapos **Edge Functions** → **send-push** → **Logs**.', 'Staff → **Announcements** → sa test announcement i-click ang **Delete** → kumpirmahin.'], see: 'Daily job, mga tawag na may status 200, at nawala ang announcement.', say: [
      'Ang payment reminders ay galing sa pg_cron na tumatakbo araw-araw: tatlong araw bago ang due date, sa mismong araw, at kapag overdue. Ang send-push ang naghahatid sa phone gamit ang Web Push; ang keys ay nasa server lang.',
      'At puwedeng i-delete ang announcement — kasama nitong nabubura ang mga notification nito. Iyan po ang back end namin.'
    ] }
  ])
);

// ================================================================ CLOSING
children.push(
  h1('7. Closing — lahat (14:30 – 15:15)'),
  steps([
    { do: ['**Slide: Thank you**.'], see: 'Thank you slide.', say: [
      '[Front-End] Sa Week 1 at 2: madaling makita ang bills, due dates, concerns, announcements at notifications.',
      '[Back-End 1] Naka-authenticate, tama ang computation, at planado ang daloy para nasa oras ang updates.',
      '[Back-End 2] Secure ang accounts, at may database, triggers, reminders at push para maihatid ito sa bawat customer.',
      '[Lahat] Maraming salamat po!'
    ] },
    { do: ['Maghintay ng 2 segundo → **Stop**.'] }
  ])
);

// ================================================================ AFTER
children.push(
  h1('8. Kung may problema, at pagkatapos mag-record'),
  table([3300, 5726], ['Problema', 'Gawin'], [
    ['Hindi agad lumabas ang alert', 'I-tap ang Alerts o i-refresh. Ituloy lang ang recording.'],
    ['Walang tunog ang pop-up', 'Mag-tap muna sa customer app bago mag-publish.'],
    ['Humihingi ulit ng code ang staff console', 'I-pause, mag-sign in, ituloy. Huwag i-record ang code.'],
    ['“Present reading is lower…”', 'Previous 13037, Present 13210.'],
    ['Uulitin ang buong take', 'Staff → Announcements → Delete ang test announcement. Supabase → SQL Editor → patakbuhin ang Part A ng backend/database/scripts/demo_data_cleanup.sql. I-reload ang dalawang window.']
  ]),
  space(),
  h2('I-edit at i-export (Clipchamp)'),
  steps([
    { do: ['**Clipchamp** → **Create a new video** → i-drag ang recording mula sa **Videos → Screen Recordings**.'], see: 'Nasa timeline ang video.' },
    { do: ['Putulin ang mga mali: ilipat ang playhead → **S** → burahin ang hindi kailangan. Optional: **Text** na pangalan ng bawat member.'], see: 'Malinis na video.' },
    { do: ['Panoorin ulit: walang password, code o address ng staff console (gamitin ang **Effects → Blur** kung meron). **Export → 1080p**.'], see: 'Isang mp4 na handa nang i-submit.' }
  ])
);
const doc = new Document({
  creator: 'OMECOnnect team',
  title: 'OMECOnnect Week 1 + Week 2 Combined Video Script',
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
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t('OMECOnnect · Week 1 + Week 2 Video Script (combined)', { size: 16, color: GREY })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [t('Page ', { size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GREY }), t(' of ', { size: 16, color: GREY }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: GREY })] })] }) },
    children
  }]
});

Packer.toBuffer(doc).then((buf) => {
  const out = process.argv[2];
  fs.writeFileSync(out, buf);
  console.log('written', out, buf.length, 'bytes');
});
