"""OMECOnnect - Conceptual Architecture (current system).

One layout, two outputs:
  * draw.io page   -> used by make_architecture_diagrams.py (page 1) and written alone
  * PNG for slides -> SVG rendered by a headless browser

Run:  python docs/concept_architecture.py docs/OMECOnnect_Conceptual_Architecture
      (writes .drawio and .html; render_png() makes the .png)
"""
import sys
from html import escape
from xml.sax.saxutils import quoteattr

W, H = 1560, 870

COL = {
    "blue": ("#dae8fc", "#6c8ebf"), "green": ("#d5e8d4", "#82b366"), "yellow": ("#fff2cc", "#d6b656"),
    "orange": ("#ffe6cc", "#d79b00"), "purple": ("#e1d5e7", "#9673a6"), "grey": ("#f5f5f5", "#8a8a8a"),
    "teal": ("#d9f2ef", "#3e9c8f"),
}

# id: (x, y, w, h, colour, title, subtitle, items, dashed)
BOXES = {
    "app": (200, 130, 250, 215, "blue", "Customer App", "web + installable Android app (PWA / APK)",
            ["Bills, statement & barcode", "Bill estimator (meter → kWh → ₱)", "Power status · report no power",
             "Concerns · alerts · profile & privacy", "English / Filipino · light / dark"], False),
    "staff": (200, 440, 250, 215, "blue", "Staff Console", "private site · 2-step verification required",
              ["Verification · bills & rates · CSV import", "Concerns, target times, outages by area",
               "Meter readings · reports", "Staff roles · audit log · backups"], False),
    "host": (200, 700, 250, 76, "grey", "Hosting: Vercel", "public customer site + private staff site",
             ["Docker image for local runs"], False),

    "api": (525, 150, 190, 115, "green", "Data API (PostgREST)", "REST + RPC over HTTPS",
            ["sign-in token (JWT)", "on every request"], False),
    "rt": (525, 300, 190, 100, "teal", "Realtime", "WebSocket",
           ["live updates on", "open screens"], False),
    "store": (525, 440, 190, 115, "green", "Storage (private)", "own-folder access only",
              ["profile, concern &", "meter photos · backups"], False),

    "db": (775, 150, 200, 300, "yellow", "PostgreSQL Database", "",
           ["users · accounts (R / C / I / P)", "bills · rates · statements", "announcements · complaints",
            "meter readings · payments", "notifications · audit logs", "", "Row Level Security +", "staff roles on every table"], False),
    "cron": (775, 490, 200, 90, "purple", "Scheduled jobs (pg_cron)", "",
             ["8:00 AM bill reminders", "2:00 AM nightly backup"], False),
    "vault": (775, 620, 200, 80, "grey", "Vault", "encrypted secrets",
              ["push keys · hook secrets"], False),

    "auth": (1035, 150, 160, 140, "green", "Supabase Auth", "",
             ["email + password", "Google (OAuth PKCE)", "SMS one-time code", "authenticator 2-step"], False),
    "fn": (1035, 330, 160, 250, "purple", "Edge Functions", "server code (Deno)",
           ["send-push", "send-sms-textbee", "nightly-backup", "create-payment", "paymongo-webhook", "ai-assistant"], False),

    "google": (1250, 150, 270, 55, "orange", "Google Sign-In", "OAuth 2.0", [], False),
    "mail": (1250, 225, 270, 55, "orange", "Email service", "Supabase mailer · Brevo SMTP (add key)", [], False),
    "sms": (1250, 340, 270, 55, "orange", "textbee SMS gateway", "Android phone + PH SIM → customer", [], False),
    "push": (1250, 410, 270, 55, "orange", "Web Push service", "pop-up alerts on the customer's phone", [], False),
    "pay": (1250, 480, 270, 55, "orange", "PayMongo", "GCash · Maya · cards", [], True),
    "ai": (1250, 550, 270, 55, "orange", "Claude (Anthropic)", "AI assistant answers", [], True),
}

CONTAINER = (495, 100, 720, 680, "OMECOnnect Cloud Backend (Supabase)")

ACTORS = [  # x, y (top of figure), name, roles
    (95, 175, "Customer", "Residential · Commercial · Industrial"),
    (95, 485, "OMECO Staff", "Supervisor · Billing · Service · Engineering"),
]

# points, label, label position (x, y), arrow at end?, dashed?
EDGES = [
    ([(130, 230), (200, 230)], "uses", (165, 222), True, False),
    ([(130, 540), (200, 540)], "uses", (165, 532), True, False),
    # app/staff -> shared connection line -> backend
    ([(450, 240), (485, 240)], "", None, False, False),
    ([(450, 545), (485, 545)], "", None, False, False),
    ([(485, 205), (485, 545)], "", None, False, False),
    ([(485, 205), (525, 205)], "", None, True, False),
    ([(485, 350), (525, 350)], "", None, True, False),
    ([(485, 497), (525, 497)], "", None, True, False),
    ([(485, 205), (485, 128), (1115, 128), (1115, 150)], "sign up / sign in", (800, 121), True, False),
    # inside the backend
    ([(715, 205), (775, 205)], "queries", (745, 197), True, False),
    ([(775, 350), (715, 350)], "changes", (745, 342), True, False),
    ([(1035, 205), (975, 205)], "users", (1005, 197), True, False),
    ([(975, 400), (1035, 400)], "new alert", (1005, 392), True, False),
    ([(875, 490), (875, 450)], "reminders", (912, 474), True, False),
    ([(975, 535), (1035, 535)], "backup", (1005, 527), True, False),
    ([(1115, 290), (1115, 330)], "SMS hook", (1150, 314), True, False),
    ([(1060, 580), (1060, 660), (975, 660)], "keys", (1018, 652), True, False),
    ([(1140, 580), (1140, 735), (620, 735), (620, 555)], "nightly backup file", (880, 727), True, False),
    # to outside services
    ([(1195, 177), (1250, 177)], "OAuth", (1222, 169), True, False),
    ([(1195, 252), (1250, 252)], "emails", (1222, 244), True, False),
    ([(1195, 367), (1250, 367)], "SMS", (1222, 359), True, False),
    ([(1195, 437), (1250, 437)], "push", (1222, 429), True, False),
    ([(1195, 507), (1250, 507)], "pay", (1222, 499), True, True),
    ([(1195, 577), (1250, 577)], "ask", (1222, 569), True, True),
]

BUS_LABEL = ("HTTPS + sign-in token · WebSocket", 470, 375)  # vertical text beside the shared line

TITLE = "OMECOnnect – Conceptual Architecture"
SUBTITLE = "Who uses the system, the apps they use, the Supabase cloud backend, and the outside services it relies on."


# ---------------------------------------------------------------- draw.io
def drawio_cells(pid="concept"):
    cells = []
    n = [0]

    def nid():
        n[0] += 1
        return f"{pid}-{n[0]}"

    def vertex(label, x, y, w, h, style):
        cells.append(f'<mxCell id="{nid()}" value={quoteattr(label)} style={quoteattr(style)} vertex="1" parent="1">'
                     f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')

    vertex(f"<b style='font-size:20px'>{TITLE}</b><br><span style='font-size:12px;color:#555'>{SUBTITLE}</span>",
           40, 20, 1400, 50, "text;html=1;align=left;verticalAlign=middle;whiteSpace=wrap;")
    cx, cy, cw, ch, ctitle = CONTAINER
    vertex(f"<b>{ctitle}</b>", cx, cy, cw, ch,
           "rounded=1;whiteSpace=wrap;html=1;arcSize=2;dashed=1;fillColor=#fafafa;strokeColor=#999999;"
           "verticalAlign=bottom;align=right;spacingRight=12;spacingBottom=6;fontColor=#555555;")
    for x, y, name, roles in ACTORS:
        vertex(f"<b>{name}</b><br><span style='font-size:10px'>{roles}</span>", x - 15, y, 40, 70,
               "shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;whiteSpace=wrap;")
    for x, y, w, h, colour, title, sub, items, dashed in BOXES.values():
        fill, stroke = COL[colour]
        label = f"<b>{escape(title)}</b>"
        if sub:
            label += f"<br><i style='font-size:10px;color:#555'>{escape(sub)}</i>"
        label += "".join(f"<br>{escape(i)}" if i else "<br>" for i in items)
        style = (f"rounded=1;whiteSpace=wrap;html=1;arcSize=6;fontSize=11;fillColor={fill};strokeColor={stroke};"
                 + ("dashed=1;" if dashed else ""))
        vertex(label, x, y, w, h, style)
    for pts, label, _pos, arrow, dashed in EDGES:
        (x1, y1), (x2, y2) = pts[0], pts[-1]
        mid = "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in pts[1:-1])
        style = ("html=1;rounded=0;fontSize=10;labelBackgroundColor=#ffffff;strokeColor=#444444;"
                 + ("endArrow=block;endFill=1;" if arrow else "endArrow=none;")
                 + ("dashed=1;" if dashed else ""))
        cells.append(f'<mxCell id="{nid()}" value={quoteattr(label)} style={quoteattr(style)} edge="1" parent="1">'
                     f'<mxGeometry relative="1" as="geometry"><mxPoint x="{x1}" y="{y1}" as="sourcePoint"/>'
                     f'<mxPoint x="{x2}" y="{y2}" as="targetPoint"/>'
                     + (f'<Array as="points">{mid}</Array>' if mid else "") + '</mxGeometry></mxCell>')
    bl, bx, by = BUS_LABEL
    vertex(f"<span style='font-size:10px;color:#444'>{bl}</span>", bx - 150, by - 10, 300, 20,
           "text;html=1;align=center;verticalAlign=middle;rotation=-90;labelBackgroundColor=#ffffff;")
    # legend
    vertex("<b>Legend</b>  —  solid box: built and live  ·  dashed box: built, switches on when OMECO adds its account keys",
           40, 815, 1000, 24, "text;html=1;align=left;verticalAlign=middle;fontSize=11;fontColor=#444444;")
    return "".join(cells)


def drawio_page(pid="concept", name="1. Conceptual Architecture"):
    return (f'<diagram id="{pid}" name={quoteattr(name)}><mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" '
            f'guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{W}" '
            f'pageHeight="{H}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
            f'{drawio_cells(pid)}</root></mxGraphModel></diagram>')


# ---------------------------------------------------------------- SVG (for the PNG)
def svg():
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
           'font-family="Segoe UI, Arial, sans-serif">',
           '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">'
           '<path d="M0,0 L10,5 L0,10 z" fill="#444"/></marker></defs>',
           f'<rect width="{W}" height="{H}" fill="#ffffff"/>',
           f'<text x="40" y="45" font-size="26" font-weight="700" fill="#0b2e6b">{escape(TITLE)}</text>',
           f'<text x="40" y="70" font-size="14" fill="#555">{escape(SUBTITLE)}</text>']
    cx, cy, cw, ch, ctitle = CONTAINER
    out.append(f'<rect x="{cx}" y="{cy}" width="{cw}" height="{ch}" rx="14" fill="#fafafa" stroke="#999" stroke-dasharray="7 5"/>')
    out.append(f'<text x="{cx + cw - 14}" y="{cy + ch - 12}" font-size="14" font-weight="700" fill="#555" text-anchor="end">{escape(ctitle)}</text>')

    for x, y, name, roles in ACTORS:  # stick figure, centred on x
        out.append(f'<g stroke="#333" stroke-width="2" fill="none"><circle cx="{x}" cy="{y + 10}" r="10"/>'
                   f'<line x1="{x}" y1="{y + 20}" x2="{x}" y2="{y + 48}"/><line x1="{x - 16}" y1="{y + 30}" x2="{x + 16}" y2="{y + 30}"/>'
                   f'<line x1="{x}" y1="{y + 48}" x2="{x - 13}" y2="{y + 68}"/><line x1="{x}" y1="{y + 48}" x2="{x + 13}" y2="{y + 68}"/></g>')
        out.append(f'<text x="{x}" y="{y + 88}" font-size="14" font-weight="700" text-anchor="middle" fill="#222">{escape(name)}</text>')
        words = roles.split(" · ")
        for i, wd in enumerate(words):
            out.append(f'<text x="{x}" y="{y + 106 + i * 15}" font-size="11" text-anchor="middle" fill="#555">{escape(wd)}</text>')

    for x, y, w, h, colour, title, sub, items, dashed in BOXES.values():
        fill, stroke = COL[colour]
        dash = ' stroke-dasharray="6 4"' if dashed else ""
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{fill}" stroke="{stroke}" stroke-width="1.5"{dash}/>')
        cxm = x + w / 2
        lines = [(title, "700", 14, "#1b2430")]
        if sub:
            lines.append((sub, "400", 11, "#555"))
        lines += [(i, "700" if i.startswith("Row Level") or i.startswith("staff roles") else "400", 12, "#222") for i in items]
        total = sum(18 if s >= 14 else 15 for _, _, s, _ in lines)
        ty = y + (h - total) / 2 + 13
        for text, weight, size, color in lines:
            style = ' font-style="italic"' if (text == sub and sub) else ""
            if text:
                out.append(f'<text x="{cxm}" y="{ty:.1f}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="middle"{style}>{escape(text)}</text>')
            ty += 18 if size >= 14 else 15

    for pts, label, pos, arrow, dashed in EDGES:
        d = "M" + " L".join(f"{x},{y}" for x, y in pts)
        out.append(f'<path d="{d}" fill="none" stroke="#444" stroke-width="1.6"'
                   + (' stroke-dasharray="6 4"' if dashed else "") + (' marker-end="url(#arr)"' if arrow else "") + "/>")
        if label and pos:
            lx, ly = pos
            tw = len(label) * 6.2 + 8
            out.append(f'<rect x="{lx - tw / 2:.1f}" y="{ly - 11}" width="{tw:.1f}" height="15" fill="#ffffff" opacity="0.92"/>')
            out.append(f'<text x="{lx}" y="{ly}" font-size="11" fill="#333" text-anchor="middle">{escape(label)}</text>')
    bl, bx, by = BUS_LABEL
    out.append(f'<text x="{bx}" y="{by}" font-size="11" fill="#333" text-anchor="middle" transform="rotate(-90 {bx} {by})">{escape(bl)}</text>')

    # legend
    ly = 830
    out.append(f'<text x="40" y="{ly}" font-size="13" font-weight="700" fill="#333">Legend</text>')
    out.append(f'<rect x="110" y="{ly - 14}" width="34" height="18" rx="4" fill="#ffe6cc" stroke="#d79b00"/>')
    out.append(f'<text x="152" y="{ly}" font-size="12" fill="#333">built and live</text>')
    out.append(f'<rect x="250" y="{ly - 14}" width="34" height="18" rx="4" fill="#ffe6cc" stroke="#d79b00" stroke-dasharray="5 3"/>')
    out.append(f'<text x="292" y="{ly}" font-size="12" fill="#333">built — switches on when OMECO adds its account keys</text>')
    out.append(f'<line x1="640" y1="{ly - 5}" x2="690" y2="{ly - 5}" stroke="#444" stroke-width="1.6" marker-end="url(#arr)"/>')
    out.append(f'<text x="698" y="{ly}" font-size="12" fill="#333">data / request flow</text>')
    out.append("</svg>")
    return "".join(out)


if __name__ == "__main__":
    base = sys.argv[1]
    with open(base + ".drawio", "w", encoding="utf-8") as f:
        f.write('<mxfile host="app.diagrams.net" agent="OMECOnnect generator" version="24.0.0">' + drawio_page() + "</mxfile>")
    with open(base + ".html", "w", encoding="utf-8") as f:
        f.write(f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;background:#fff}}</style></head><body>{svg()}</body></html>')
    print("wrote", base + ".drawio", "and", base + ".html")
