"""Generates docs/OMECOnnect_System_Architecture.drawio (multi-page draw.io file)."""
import sys
from xml.sax.saxutils import quoteattr

OUT = sys.argv[1]

BLUE = "fillColor=#dae8fc;strokeColor=#6c8ebf;"
GREEN = "fillColor=#d5e8d4;strokeColor=#82b366;"
YELLOW = "fillColor=#fff2cc;strokeColor=#d6b656;"
ORANGE = "fillColor=#ffe6cc;strokeColor=#d79b00;"
PURPLE = "fillColor=#e1d5e7;strokeColor=#9673a6;"
GREY = "fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;"
RED = "fillColor=#f8cecc;strokeColor=#b85450;"
BOX = "rounded=1;whiteSpace=wrap;html=1;arcSize=8;"
ACTOR = "shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;"
EDGE = "endArrow=block;endFill=1;html=1;rounded=1;fontSize=11;labelBackgroundColor=#ffffff;"
DASHED_EDGE = EDGE + "dashed=1;"


class Page:
    def __init__(self, name, pid):
        self.name, self.pid, self.cells, self.n = name, pid, [], 0

    def _id(self):
        self.n += 1
        return f"{self.pid}-{self.n}"

    def v(self, label, x, y, w, h, style):
        cid = self._id()
        self.cells.append(
            f'<mxCell id="{cid}" value={quoteattr(label)} style={quoteattr(style)} vertex="1" parent="1">'
            f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
        return cid

    def e(self, src, tgt, label="", style=EDGE):
        cid = self._id()
        self.cells.append(
            f'<mxCell id="{cid}" value={quoteattr(label)} style={quoteattr(style)} edge="1" parent="1" '
            f'source="{src}" target="{tgt}"><mxGeometry relative="1" as="geometry"/></mxCell>')
        return cid

    def line(self, x1, y1, x2, y2, label="", style=EDGE):
        cid = self._id()
        self.cells.append(
            f'<mxCell id="{cid}" value={quoteattr(label)} style={quoteattr(style)} edge="1" parent="1">'
            f'<mxGeometry relative="1" as="geometry"><mxPoint x="{x1}" y="{y1}" as="sourcePoint"/>'
            f'<mxPoint x="{x2}" y="{y2}" as="targetPoint"/></mxGeometry></mxCell>')
        return cid

    def title(self, text, sub=""):
        label = f"<b style='font-size:20px'>{text}</b>" + (f"<br><span style='font-size:12px;color:#555'>{sub}</span>" if sub else "")
        self.v(label, 40, 10, 1300, 50, "text;html=1;align=left;verticalAlign=middle;whiteSpace=wrap;")

    def xml(self):
        body = "".join(self.cells)
        return (f'<diagram id="{self.pid}" name={quoteattr(self.name)}><mxGraphModel dx="1400" dy="900" grid="1" '
                f'gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" '
                f'pageWidth="1400" pageHeight="1300" math="0" shadow="0"><root><mxCell id="0"/>'
                f'<mxCell id="1" parent="0"/>{body}</root></mxGraphModel></diagram>')


pages = []

# ---------------------------------------------------------------- 1. Conceptual
# Current system layout lives in concept_architecture.py (also renders the PNG).
import os as _os
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import concept_architecture as _concept


class _RawPage:
    def __init__(self, xml):
        self._xml = xml

    def xml(self):
        return self._xml


pages.append(_RawPage(_concept.drawio_page()))

# ---------------------------------------------------------------- 2. Layered
p = Page("2. Layered Architecture", "layer")
p.title("OMECOnnect – Layered Architecture",
        "Each layer only talks to the layer below it. Security is enforced in the database, not only in the app.")
layers = [
    ("Presentation Layer", BLUE, [
        "<b>Customer Mobile App</b><br>Login · Register + SMS OTP · Dashboard",
        "Bills · Consumption · Announcements",
        "Concerns · AI Assistant",
        "Profile · Link account · 2-step setup",
        "<b>Admin Dashboard</b><br>Verification · Billing · Announcements · Complaints",
    ]),
    ("Application / Service Layer", GREEN, [
        "<b>Client modules</b><br>supabase-client.js · script.js",
        "<b>Supabase Auth</b><br>email/password · Google OAuth (PKCE)",
        "<b>Phone OTP</b><br>6 digits · 5-min expiry · resend 60 s",
        "<b>2-step (TOTP)</b><br>authenticator app · aal2 session",
        "<b>Data API (PostgREST)</b> + Edge Function send-sms-textbee",
    ]),
    ("Business Logic & Security Layer", PURPLE, [
        "<b>Row Level Security</b><br>customer sees only own verified data",
        "<b>Role checks</b><br>is_omeco_admin() via admin_accounts",
        "<b>Gates</b><br>has_verified_phone() · mfa_satisfied()",
        "<b>Triggers</b><br>new-user profile · announcement & bill notifications",
        "<b>Scheduled</b><br>queue_due_bill_notifications() (pg_cron)",
    ]),
    ("Data Layer (PostgreSQL)", YELLOW, [
        "users · admin_accounts",
        "customer_accounts · account_verification_requests",
        "electricity_bills · payments · meter_readings",
        "announcements · notifications · complaints · complaint_status_history",
        "ai_chat_history · audit_logs · system_logs",
    ]),
    ("External Services & Infrastructure", ORANGE, [
        "Google Sign-In (OAuth)",
        "textbee + Android SIM (SMS)",
        "Email: Supabase mailer / Brevo SMTP",
        "Firebase Cloud Messaging <i>(planned)</i>",
        "XAMPP: local testing only",
    ]),
]
y = 80
prev = None
for name, color, items in layers:
    band = p.v(f"<b>{name}</b>", 40, y, 1300, 150,
               "rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacingLeft=10;spacingTop=6;" + color + "opacity=45;")
    for i, item in enumerate(items):
        p.v(item, 60 + i * 255, y + 40, 240, 95, BOX + "fillColor=#ffffff;strokeColor=#888888;fontSize=11;")
    if prev:
        p.line(1320, prev + 150, 1320, y, "", EDGE + "strokeWidth=2;")
    prev = y
    y += 175
p.v("<i>Requests flow downward; data returns upward. Every customer request carries a JWT; the database checks it.</i>",
    40, y, 1300, 30, "text;html=1;align=left;fontColor=#555555;")
pages.append(p)

# ---------------------------------------------------------------- 3. DFD
p = Page("3. Data Flow Diagram", "dfd")
p.title("OMECOnnect – Data Flow Diagram",
        "Level 0 (context) on top, Level 1 (main processes) below. Rectangles = external entities, circles = processes, open boxes = data stores.")
ENT = "rounded=0;whiteSpace=wrap;html=1;fontStyle=1;" + BLUE
PROC = "ellipse;whiteSpace=wrap;html=1;" + GREEN
STORE = "shape=partialRectangle;whiteSpace=wrap;html=1;right=0;top=1;bottom=1;left=1;align=left;spacingLeft=8;" + YELLOW
p.v("<b>Level 0 – Context Diagram</b>", 40, 70, 400, 30, "text;html=1;align=left;fontSize=14;")
c0 = p.v("Customer", 80, 200, 170, 60, ENT)
s0 = p.v("OMECO Staff / Admin", 1130, 200, 170, 60, ENT)
g0 = p.v("Google Sign-In", 330, 90, 170, 50, ENT)
t0 = p.v("SMS Gateway (textbee)", 880, 90, 170, 50, ENT)
m0 = p.v("Email Service", 600, 370, 170, 50, ENT)
sys0 = p.v("<b>0.0</b><br>OMECOnnect<br>System", 590, 150, 190, 160, PROC)
p.e(c0, sys0, "registration, login, OTP, concerns, questions", EDGE + "exitX=1;exitY=0.25;entryX=0;entryY=0.35;")
p.e(sys0, c0, "bills, announcements, alerts, answers", EDGE + "exitX=0;exitY=0.7;entryX=1;entryY=0.8;")
p.e(s0, sys0, "approvals, bills, announcements, status updates", EDGE + "exitX=0;exitY=0.25;entryX=1;entryY=0.35;")
p.e(sys0, s0, "verification queue, complaints, reports", EDGE + "exitX=1;exitY=0.7;entryX=0;entryY=0.8;")
p.e(g0, sys0, "verified identity", EDGE + "entryX=0.15;entryY=0.15;")
p.e(sys0, t0, "phone no. + OTP", EDGE + "exitX=0.85;exitY=0.15;")
p.e(sys0, m0, "confirmation / reset links")

base = 470
p.v("<b>Level 1 – Main Processes</b>", 40, base, 400, 30, "text;html=1;align=left;fontSize=14;")
c1 = p.v("Customer", 600, base + 20, 190, 50, ENT)
s1 = p.v("OMECO Staff / Admin", 600, base + 600, 190, 50, ENT)
g1 = p.v("Google Sign-In", 40, base + 30, 150, 40, ENT)
t1 = p.v("SMS Gateway (textbee)", 210, base + 30, 170, 40, ENT)
P1 = p.v("<b>1.0</b><br>Register &amp;<br>Sign In", 300, base + 120, 150, 95, PROC)
P2 = p.v("<b>2.0</b><br>Verify Customer<br>Account", 300, base + 290, 150, 95, PROC)
P3 = p.v("<b>3.0</b><br>Manage Bills &amp;<br>Payments", 300, base + 460, 150, 95, PROC)
P4 = p.v("<b>4.0</b><br>Publish Announcements<br>&amp; Notify", 940, base + 120, 160, 95, PROC)
P5 = p.v("<b>5.0</b><br>Handle<br>Complaints", 940, base + 290, 160, 95, PROC)
P6 = p.v("<b>6.0</b><br>AI Assistant<br><i>(reads own bills)</i>", 940, base + 460, 160, 95, PROC)
D1 = p.v("<b>D1</b> | Users", 40, base + 147, 200, 40, STORE)
D2 = p.v("<b>D2</b> | Verification Requests /<br>Customer Accounts", 40, base + 312, 200, 50, STORE)
D3 = p.v("<b>D3</b> | Bills / Payments", 40, base + 487, 200, 40, STORE)
D4 = p.v("<b>D4</b> | Announcements", 1160, base + 110, 200, 40, STORE)
D5 = p.v("<b>D5</b> | Notifications", 1160, base + 185, 200, 40, STORE)
D6 = p.v("<b>D6</b> | Complaints", 1160, base + 317, 200, 40, STORE)
D7 = p.v("<b>D7</b> | AI Chat History", 1160, base + 487, 200, 40, STORE)
p.e(c1, P1, "sign-up info, OTP code", EDGE + "exitX=0;exitY=0.5;entryX=0.8;entryY=0.1;")
p.e(g1, P1, "identity", EDGE + "exitX=0.5;exitY=1;entryX=0.1;entryY=0.2;")
p.e(P1, t1, "OTP SMS", EDGE + "exitX=0.5;exitY=0;entryX=0.6;entryY=1;")
p.e(P1, D1, "profile", EDGE + "exitX=0;exitY=0.5;entryX=1;entryY=0.5;")
p.e(c1, P2, "account number", EDGE + "exitX=0.2;exitY=1;entryX=1;entryY=0.3;")
p.e(P2, D2, "pending request", EDGE + "exitX=0;exitY=0.5;entryX=1;entryY=0.5;")
p.e(s1, P2, "approve / reject", EDGE + "exitX=0.1;exitY=0;entryX=1;entryY=0.75;")
p.e(s1, P3, "bill records", EDGE + "exitX=0;exitY=0.5;entryX=1;entryY=0.75;")
p.e(P3, D3, "bills, payments", EDGE + "exitX=0;exitY=0.5;entryX=1;entryY=0.5;")
p.e(P3, c1, "bills & due dates", DASHED_EDGE + "exitX=1;exitY=0.2;entryX=0.35;entryY=1;")
p.e(s1, P4, "announcement", EDGE + "exitX=0.9;exitY=0;entryX=0.25;entryY=0.9;")
p.e(P4, D4, "published notice", EDGE + "exitX=1;exitY=0.3;entryX=0;entryY=0.5;")
p.e(P4, D5, "alerts by area", EDGE + "exitX=1;exitY=0.75;entryX=0;entryY=0.5;")
p.e(P4, c1, "alerts", DASHED_EDGE + "exitX=0;exitY=0.25;entryX=1;entryY=0.5;")
p.e(c1, P5, "concern", EDGE + "exitX=0.8;exitY=1;entryX=0;entryY=0.3;")
p.e(P5, D6, "complaint + status", EDGE + "exitX=1;exitY=0.5;entryX=0;entryY=0.5;")
p.e(s1, P5, "status update", EDGE + "exitX=1;exitY=0.3;entryX=0.2;entryY=0.85;")
p.e(c1, P6, "question", EDGE + "exitX=1;exitY=0.8;entryX=0.1;entryY=0.2;")
p.e(P6, D7, "chat log", EDGE + "exitX=1;exitY=0.5;entryX=0;entryY=0.5;")
pages.append(p)


# ---------------------------------------------------------------- 4-6. Sequence
def sequence(name, pid, title, sub, participants, steps, notes=()):
    p = Page(name, pid)
    p.title(title, sub)
    gap, top, width = 210, 80, 160
    height = 90 + 44 * len(steps) + 40
    xs = {}
    for i, (key, label) in enumerate(participants):
        x = 40 + i * gap
        style = ("shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=0;"
                 "collapsible=0;recursiveResize=0;outlineConnect=0;size=50;fontStyle=1;")
        if key in ("cust", "staff"):
            style = ("shape=umlLifeline;participant=umlActor;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;"
                     "container=0;collapsible=0;recursiveResize=0;verticalAlign=top;spacingTop=52;outlineConnect=0;size=50;fontStyle=1;")
        if key in ("cust", "staff"):
            p.v(label, x + width / 2 - 20, top, 40, height, style)
        else:
            p.v(label, x, top, width, height, style + BLUE)
        xs[key] = x + width / 2
    y = top + 90
    for n, (a, b, label, reply) in enumerate(steps, 1):
        style = (DASHED_EDGE if reply else EDGE) + "align=left;verticalAlign=bottom;"
        if a == b:
            p.v(f"{n}. {label}", xs[a] + 8, y - 16, 300, 32,
                "shape=note;whiteSpace=wrap;html=1;size=10;fontSize=10;align=left;spacingLeft=4;" + YELLOW)
        else:
            p.line(xs[a], y, xs[b], y, f"{n}. {label}", style)
        y += 44
    for i, (text, color) in enumerate(notes):
        p.v(text, 40, top + height + 20 + i * 70, 40 + (len(participants) - 1) * gap + width - 40, 60,
            "rounded=0;whiteSpace=wrap;html=1;align=left;spacingLeft=10;dashed=1;" + color)
    pages.append(p)


sequence(
    "4. Sequence – Sign-up with SMS OTP", "seq1",
    "Sequence Diagram – Customer Sign-up with Mobile OTP (highlight feature)",
    "The account is only created after the 6-digit SMS code is verified. Codes expire after 5 minutes.",
    [("cust", "Customer"), ("app", "Mobile App"), ("auth", "Supabase Auth"),
     ("fn", "Edge Function<br>send-sms-textbee"), ("sms", "textbee +<br>Android SIM"), ("db", "Database")],
    [
        ("cust", "app", "Fill form (name, email, mobile, account no., password) → Continue", False),
        ("app", "auth", "POST /otp (phone, create_user)", False),
        ("auth", "fn", "Send SMS hook (phone, 6-digit code), signed", False),
        ("fn", "sms", "send-sms (recipient, message)", False),
        ("sms", "cust", "SMS: “OMECOnnect code: ••••••, valid 5 min”", True),
        ("app", "cust", "Show code screen + 5:00 countdown", True),
        ("cust", "app", "Enter 6-digit code → Verify", False),
        ("app", "auth", "POST /verify (phone, code)", False),
        ("auth", "db", "Create account → trigger creates profile", False),
        ("auth", "app", "Session (phone verified)", True),
        ("app", "auth", "PUT /user (email, password)", False),
        ("auth", "cust", "Email confirmation link", True),
        ("app", "db", "Insert verification request (RLS: verified phone only)", False),
        ("app", "cust", "“Account created. Confirm your email, then sign in.”", True),
    ],
    [("<b>alt [code older than 5 minutes]</b>: the app locks the code field and the server rejects the code → "
      "customer taps <b>Resend code</b> (allowed every 60 s) → a new code with a new 5 minutes.", RED),
     ("<b>alt [number already has an account]</b>: the app refuses, signs out, and asks the customer to sign in instead (no overwrite).", RED)],
)

sequence(
    "5. Sequence – Sign-in & Security Checks", "seq2",
    "Sequence Diagram – Sign-in with Google and Security Checks",
    "After any sign-in the app checks: admin? verified mobile? 2-step on? Then it loads only this customer's data.",
    [("cust", "Customer"), ("app", "Mobile App"), ("google", "Google"), ("auth", "Supabase Auth"), ("db", "Database")],
    [
        ("cust", "app", "Tap “Continue with Google”", False),
        ("app", "auth", "/authorize (provider=google, PKCE challenge)", False),
        ("auth", "google", "Redirect to Google sign-in", False),
        ("cust", "google", "Choose account / allow", False),
        ("google", "auth", "Authorization code (callback)", True),
        ("auth", "app", "Redirect back with ?code=", True),
        ("app", "auth", "/token (code + PKCE verifier)", False),
        ("auth", "app", "Session (aal1)", True),
        ("app", "db", "rpc is_omeco_admin() → admins use the dashboard", False),
        ("app", "auth", "GET /user (phone status, 2-step factors)", False),
        ("app", "app", "[no verified mobile] → Verify-mobile OTP step (5-min code)", False),
        ("app", "auth", "[2-step on] challenge + verify authenticator code", False),
        ("auth", "app", "Upgraded session (aal2)", True),
        ("app", "db", "Load profile, account, bills, announcements, notifications", False),
        ("db", "app", "Only this customer's rows (RLS + 2-step rule)", True),
        ("app", "cust", "Show dashboard", True),
    ],
    [("Email + password sign-in follows the same path from step 8 (POST /token grant_type=password).", GREY)],
)

sequence(
    "6. Sequence – Announcement to Notification", "seq3",
    "Sequence Diagram – Publishing an Announcement → Customer Alert",
    "Notifications are created automatically by the database for verified customers in the affected service area.",
    [("staff", "OMECO Staff"), ("admin", "Admin Dashboard"), ("api", "Data API"), ("db", "Database"),
     ("app", "Customer App"), ("cust", "Customer")],
    [
        ("staff", "admin", "Write announcement (title, affected area) → Publish", False),
        ("admin", "api", "Insert announcement (is_published = true) + staff JWT", False),
        ("api", "db", "RLS check: is_omeco_admin()", False),
        ("db", "db", "Trigger notify_customers_of_announcement → insert notifications for verified customers in area", False),
        ("api", "admin", "Saved", True),
        ("cust", "app", "Open app", False),
        ("app", "api", "GET notifications + announcements (customer JWT)", False),
        ("api", "db", "RLS: own notifications, published notices for own area", False),
        ("db", "app", "New alert", True),
        ("app", "cust", "Show alert card on dashboard", True),
    ],
    [("Same path for bills: a new bill row triggers a “New electricity bill” notification; a daily pg_cron job "
      "(queue_due_bill_notifications) adds “Bill due soon” reminders. Push to phones via FCM is planned.", GREY)],
)

# ---------------------------------------------------------------- 7. Use case
p = Page("7. Use Case Diagram", "usecase")
p.title("OMECOnnect – Use Case Diagram",
        "What each end-user can access. «include» = always part of it; «extend» = only in some cases.")
p.v("<b>OMECOnnect System</b>", 230, 70, 900, 960,
    "rounded=0;whiteSpace=wrap;html=1;verticalAlign=top;fillColor=none;strokeColor=#333333;fontSize=14;spacingTop=6;")
UC = "ellipse;whiteSpace=wrap;html=1;fontSize=11;" + GREEN
UC_A = "ellipse;whiteSpace=wrap;html=1;fontSize=11;" + BLUE
UC_S = "ellipse;whiteSpace=wrap;html=1;fontSize=11;" + YELLOW
INC = "endArrow=open;dashed=1;html=1;fontSize=10;labelBackgroundColor=#ffffff;"
customer = p.v("Customer", 70, 480, 40, 80, ACTOR)
adminA = p.v("OMECO Staff / Admin", 1230, 440, 40, 80, ACTOR)
googleA = p.v("Google<br>(secondary)", 1230, 210, 40, 80, ACTOR + "fillColor=#ffe6cc;")
smsA = p.v("SMS Gateway<br>(secondary)", 1230, 70, 40, 80, ACTOR + "fillColor=#ffe6cc;")
cu = {}
cust_cases = [
    ("reg", "Register account", 110), ("signin", "Sign in<br>(email/password or Google)", 190),
    ("link", "Request account verification<br>(link OMECO account no.)", 270), ("bills", "View bills, due dates<br>& payment status", 350),
    ("usage", "View consumption history", 430), ("ann", "View announcements", 510),
    ("notif", "Receive notifications", 590), ("concern", "Submit & track concerns", 670),
    ("ai", "Ask AI assistant", 750), ("profile", "Manage profile &<br>2-step verification", 830),
    ("reset", "Reset password", 910),
]
for key, label, y in cust_cases:
    cu[key] = p.v(label, 320, y, 210, 60, UC)
    p.e(customer, cu[key], "", "endArrow=none;html=1;exitX=1;exitY=0.5;entryX=0;entryY=0.5;")
otp = p.v("Verify mobile number<br>(SMS OTP, 5 min)", 620, 100, 200, 60, UC_S)
two = p.v("Enter 2-step code<br>(authenticator app)", 620, 290, 200, 60, UC_S)
p.e(cu["reg"], otp, "«include»", INC + "exitX=1;exitY=0.5;entryX=0;entryY=0.6;")
p.e(otp, cu["signin"], "«extend»<br>if no verified mobile", INC + "exitX=0.2;exitY=1;entryX=1;entryY=0.2;")
p.e(two, cu["signin"], "«extend»<br>if 2-step is on", INC + "exitX=0;exitY=0.4;entryX=1;entryY=0.8;")
p.e(otp, smsA, "", "endArrow=none;html=1;exitX=1;exitY=0.7;entryX=0;entryY=0.5;")
p.e(cu["signin"], googleA, "", "endArrow=none;html=1;exitX=1;exitY=0.35;entryX=0;entryY=0.5;")
ad = {}
admin_cases = [
    ("asign", "Sign in to admin dashboard", 340), ("averify", "Verify customer accounts", 420),
    ("abill", "Manage billing records", 500), ("aann", "Publish announcements", 580),
    ("acomp", "Update complaint status", 660), ("acust", "Manage customer records", 740),
    ("areport", "View reports & audit logs", 820),
]
for key, label, y in admin_cases:
    ad[key] = p.v(label, 870, y, 210, 60, UC_A)
    p.e(adminA, ad[key], "", "endArrow=none;html=1;exitX=0;exitY=0.5;entryX=1;entryY=0.5;")
p.e(cu["link"], ad["averify"], "request goes to staff", "endArrow=open;dashed=1;html=1;fontSize=10;")
p.e(ad["aann"], cu["notif"], "triggers", "endArrow=open;dashed=1;html=1;fontSize=10;")
p.e(cu["concern"], ad["acomp"], "handled by", "endArrow=open;dashed=1;html=1;fontSize=10;")
pages.append(p)

xml = ('<mxfile host="app.diagrams.net" agent="OMECOnnect generator" version="24.0.0">'
       + "".join(pg.xml() for pg in pages) + "</mxfile>")
with open(OUT, "w", encoding="utf-8") as f:
    f.write(xml)
print(f"wrote {OUT}: {len(pages)} pages, {len(xml)} bytes")
