"""OMECOnnect - Conceptual Architecture, large-print version.

Every label is 13-18 px so the whole diagram is readable in draw.io at 100% zoom
(canvas 1690 x 950, fits a normal laptop/desktop screen).

Run:  python docs/make_conceptual_architecture_large.py
Writes docs/OMECOnnect_Conceptual_Architecture_Readable.drawio
"""
import os
from html import escape
from xml.sax.saxutils import quoteattr

W, H = 1690, 950
COL = {
    "blue": ("#dae8fc", "#6c8ebf"), "green": ("#d5e8d4", "#82b366"), "yellow": ("#fff2cc", "#d6b656"),
    "orange": ("#ffe6cc", "#d79b00"), "purple": ("#e1d5e7", "#9673a6"), "grey": ("#f5f5f5", "#666666"),
    "teal": ("#d9f2ef", "#3e9c8f"),
}

cells = []


def add(cid, value, style, x, y, w, h):
    cells.append(f'<mxCell id="{cid}" value={quoteattr(value)} style="{style}" vertex="1" parent="1">'
                 f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')


def box(cid, x, y, w, h, colour, title, sub="", items=(), dashed=False):
    fill, stroke = COL[colour]
    v = f'<b style="font-size:17px">{escape(title)}</b>'
    if sub:
        v += f'<br><i style="font-size:13px;color:#444444">{escape(sub)}</i>'
    if items:
        v += '<div style="margin-top:6px">' + "<br>".join("• " + escape(i) for i in items) + "</div>"
    style = (f"rounded=1;whiteSpace=wrap;html=1;arcSize=6;fillColor={fill};strokeColor={stroke};strokeWidth=2;"
             f"fontSize=14;align=left;verticalAlign=top;spacingLeft=12;spacingTop=8;spacingRight=8;"
             + ("dashed=1;dashPattern=8 4;" if dashed else ""))
    add(cid, v, style, x, y, w, h)


def layer(cid, x, y, w, h, title, colour="#999999"):
    add(cid + "-bg", "", f"rounded=1;whiteSpace=wrap;html=1;arcSize=2;fillColor=#fbfbfb;strokeColor={colour};"
        "strokeWidth=2;dashed=1;", x, y, w, h)
    add(cid + "-hd", f"<b>{escape(title)}</b>", "text;html=1;align=center;verticalAlign=middle;fontSize=16;"
        f"fontColor=#ffffff;fillColor={colour};rounded=1;arcSize=20;", x, y - 34, w, 30)


def edge(eid, src, dst, label="", dashed=False, points=(), exit_=None, entry=None):
    style = ("edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=1;endSize=10;strokeWidth=3;"
             "strokeColor=#1f2d3d;fontSize=14;fontStyle=1;fontColor=#1f2d3d;labelBackgroundColor=#ffffff;")
    if dashed:
        style += "dashed=1;dashPattern=8 4;"
    if exit_:
        style += f"exitX={exit_[0]};exitY={exit_[1]};exitDx=0;exitDy=0;"
    if entry:
        style += f"entryX={entry[0]};entryY={entry[1]};entryDx=0;entryDy=0;"
    pts = "".join(f'<mxPoint x="{px}" y="{py}"/>' for px, py in points)
    pts = f'<Array as="points">{pts}</Array>' if pts else ""
    cells.append(f'<mxCell id="{eid}" value={quoteattr(label)} style="{style}" edge="1" parent="1" '
                 f'source="{src}" target="{dst}"><mxGeometry relative="1" as="geometry">{pts}</mxGeometry></mxCell>')


# ---- title -------------------------------------------------------------------------------
add("title", '<b style="font-size:26px">OMECOnnect – Conceptual Architecture</b><br>'
    '<span style="font-size:15px;color:#444444">Occidental Mindoro Electric Cooperative (OMECO): who uses the system, '
    'the apps they use, the Supabase cloud backend, and the outside services it relies on.</span>',
    "text;html=1;align=left;verticalAlign=middle;whiteSpace=wrap;", 30, 10, 1630, 70)

# ---- layers ------------------------------------------------------------------------------
layer("L1", 20, 150, 210, 775, "USERS", "#5b6b7f")
layer("L2", 250, 150, 340, 775, "PRESENTATION LAYER", "#4a74b4")
layer("L3", 660, 150, 580, 775, "BACKEND – SUPABASE CLOUD", "#3d8b3d")
layer("L4", 1330, 150, 330, 775, "EXTERNAL SERVICES", "#c07a00")

# ---- users -------------------------------------------------------------------------------
actor = "shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;strokeWidth=2;"         "fillColor=#dae8fc;strokeColor=#333333;fontSize=16;"
add("cust", "", actor, 95, 240, 60, 100)
add("cust-t", '<b>Customer</b><br><span style="font-size:13px">Residential · Commercial<br>Industrial · Public</span>',
    "text;html=1;align=center;verticalAlign=top;fontSize=16;whiteSpace=wrap;", 30, 345, 190, 70)
add("staff", "", actor, 95, 530, 60, 100)
add("staff-t", '<b>OMECO Staff</b><br><span style="font-size:13px">Admin · Supervisor · Billing<br>'
    'Service · Engineering</span>', "text;html=1;align=center;verticalAlign=top;fontSize=16;whiteSpace=wrap;",
    30, 635, 190, 70)

# ---- presentation ------------------------------------------------------------------------
box("app", 270, 180, 300, 250, "blue", "Customer Mobile App", "Web app (PWA) + Android APK",
    ["Bills & Statement of Account", "Bill estimator (kWh → ₱)", "Power status · report outage",
     "Concerns with photos & rating", "Alerts · English / Filipino"])
box("admin", 270, 470, 300, 250, "blue", "Admin Dashboard", "Private staff site · 2-step verification",
    ["Customer verification", "Bills, rates & CSV import", "Concerns, target times, outages",
     "Meter readings & reports", "Staff roles · audit log · backups"])
box("host", 270, 765, 300, 130, "grey", "Vercel Hosting", "Serves both apps",
    ["Public customer site", "Private staff site (not indexed)", "Service worker: push & updates"])

# ---- Supabase ----------------------------------------------------------------------------
add("access", '<b style="font-size:17px">Supabase Access Layer</b>',
    "rounded=1;whiteSpace=wrap;html=1;arcSize=4;fillColor=#eef7ec;strokeColor=#82b366;strokeWidth=2;"
    "fontSize=14;align=center;verticalAlign=top;spacingTop=6;", 680, 180, 250, 520)
box("api", 695, 220, 220, 150, "green", "Data API", "REST / RPC (PostgREST)",
    ["HTTPS + JWT token", "Business rules in SQL"])
box("rt", 695, 385, 220, 130, "teal", "Realtime", "WebSocket",
    ["Live updates on", "open screens"])
box("store", 695, 530, 220, 150, "green", "Storage (private)", "",
    ["Profile photos", "Concern & meter photos", "Backup files"])
box("db", 680, 745, 250, 160, "yellow", "PostgreSQL Database", "Row Level Security",
    ["Users & accounts", "Bills, rates, payments", "Concerns, announcements", "Readings, notifications, logs"])
box("auth", 980, 180, 240, 160, "green", "Supabase Auth", "",
    ["Email + password", "Google sign-in", "SMS one-time code", "Authenticator 2FA (staff)"])
box("fn", 980, 360, 240, 340, "purple", "Edge Functions", "Server code (Deno)",
    ["send-push", "send-sms-textbee", "create-payment", "paymongo-webhook", "ai-assistant", "nightly-backup"])
box("cron", 980, 745, 115, 160, "purple", "Scheduled Jobs", "pg_cron", ["8 AM bill", "reminders", "2 AM backup"])
box("vault", 1105, 745, 115, 160, "grey", "Vault", "secrets", ["Push keys", "API keys"])

# ---- external ----------------------------------------------------------------------------
ext = [
    ("google", 180, "Google Sign-In", "OAuth 2.0", False),
    ("mail", 265, "Email Service", "Supabase mailer · Brevo SMTP", False),
    ("sms", 370, "textbee SMS Gateway", "Android phone + PH SIM", False),
    ("push", 455, "Web Push Service", "Pop-up alerts on phones", False),
    ("pay", 540, "PayMongo", "GCash · Maya · cards", True),
    ("ai", 625, "Claude AI (Anthropic)", "AI assistant answers", True),
]
for cid, y, t, s, d in ext:
    box(cid, 1350, y, 290, 70, "orange", t, s, dashed=d)

# ---- legend ------------------------------------------------------------------------------
add("legend", '<b>Legend</b><br>━━ solid = in use now<br>┅┅ dashed = built, switched on when<br>'
    '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;the account key is added<br>→ arrow = direction of the request',
    "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#999999;fontSize=14;align=left;"
    "verticalAlign=top;spacingLeft=12;spacingTop=6;", 1350, 745, 290, 130)

# ---- connections (all straight or routed through empty gutters: no arrow crosses another) --
def fy(center, top, h):
    return round((center - top) / h, 4)

edge("e1", "cust", "app", "uses", exit_=(1, 0.5), entry=(0, fy(290, 180, 250)))
edge("e2", "staff", "admin", "manages", exit_=(1, 0.5), entry=(0, fy(580, 470, 250)))
edge("e3", "host", "admin", "serves", exit_=(0.5, 0), entry=(0.5, 1))
edge("e4", "app", "access", "HTTPS + JWT", exit_=(1, 0.5), entry=(0, fy(305, 180, 520)))
edge("e5", "admin", "access", "HTTPS + JWT", exit_=(1, 0.3), entry=(0, fy(545, 180, 520)))
edge("e6", "access", "db", "SQL", exit_=(0.5, 1), entry=(0.5, 0))
edge("e7", "fn", "db", "data", exit_=(0, fy(680, 360, 340)), entry=(1, 0.5), points=[(955, 680), (955, 825)])
edge("e8", "cron", "fn", "runs", exit_=(0.5, 0), entry=(fy(1037.5, 980, 240), 1))
edge("e9", "vault", "fn", "keys", exit_=(0.5, 0), entry=(fy(1162.5, 980, 240), 1))
edge("e10", "auth", "google", "OAuth", exit_=(1, fy(215, 180, 160)), entry=(0, 0.5))
edge("e11", "auth", "mail", "emails", exit_=(1, fy(300, 180, 160)), entry=(0, 0.5))
edge("e12", "fn", "sms", "SMS", exit_=(1, fy(405, 360, 340)), entry=(0, 0.5))
edge("e13", "fn", "push", "push", exit_=(1, fy(490, 360, 340)), entry=(0, 0.5))
edge("e14", "fn", "pay", "payment", dashed=True, exit_=(1, fy(575, 360, 340)), entry=(0, 0.5))
edge("e15", "fn", "ai", "AI", dashed=True, exit_=(1, fy(660, 360, 340)), entry=(0, 0.5))

xml = (f'<mxfile host="app.diagrams.net" agent="OMECOnnect generator" version="24.0.0">'
       f'<diagram id="concept-large" name="Conceptual Architecture">'
       f'<mxGraphModel dx="1690" dy="950" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" '
       f'fold="1" page="1" pageScale="1" pageWidth="{W}" pageHeight="{H}" math="0" shadow="0">'
       f'<root><mxCell id="0"/><mxCell id="1" parent="0"/>{"".join(cells)}</root></mxGraphModel></diagram></mxfile>')

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "OMECOnnect_Conceptual_Architecture_Readable.drawio")
with open(out, "w", encoding="utf-8") as f:
    f.write(xml)
print("wrote", out)
