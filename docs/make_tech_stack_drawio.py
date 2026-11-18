"""Builds docs/OMECOnnect_Figure1_Technology_Stack.drawio — Figure 1 (technology
stack) as an editable draw.io diagram, matching the figure in the Word document.

Run:  python docs/make_tech_stack_drawio.py
Open: app.diagrams.net -> File -> Open from -> Device (or the draw.io desktop app).
"""
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).with_name("OMECOnnect_Figure1_Technology_Stack.drawio")

# (title, subtitle, border colour, background, text colour, [(name, details), ...])
LAYERS = [
    ("Users &amp; Devices", "Who uses the system", "#0b5ed7", "#eef5ff", "#093c96", [
        ("Customer App", "Android phone (APK / browser),<br>iPhone (Add to Home Screen)"),
        ("Admin Dashboard", "OMECO staff on laptop or<br>desktop web browser"),
    ]),
    ("Front End", "What users see", "#0f9d58", "#ecfaf1", "#0b6b3c", [
        ("HTML5", "Page structure"),
        ("CSS3", "Mobile-first design"),
        ("JavaScript", "App logic (no framework)"),
        ("PWA + Service Worker", "Installable app,<br>push pop-ups"),
        ("Android APK (TWA)", "Built with PWABuilder"),
    ]),
    ("Hosting &amp; Deployment", "Where it runs", "#6f42c1", "#f4effc", "#4c2a8c", [
        ("Vercel", "Live website<br>omeconnect.vercel.app"),
        ("GitHub", "Source code &amp;<br>automatic deploys"),
        ("Docker + nginx", "Local / server<br>container (port 8080)"),
    ]),
    ("Back End", "Supabase (cloud)", "#e8710a", "#fff4e8", "#9a4a06", [
        ("PostgreSQL", "Database with<br>Row Level Security"),
        ("Supabase Auth", "Email, Google sign-in,<br>2-step verification"),
        ("Realtime", "Instant live updates"),
        ("Edge Functions", "Push notification<br>sender (Deno)"),
        ("Vault", "Encrypted keys<br>&amp; secrets"),
    ]),
    ("External Services", "Third-party", "#5f6b7a", "#f2f4f7", "#2d3748", [
        ("Google Identity", "\"Continue with Google\"<br>(OAuth 2.0)"),
        ("Web Push Services", "Google FCM, Apple,<br>Microsoft (phone pop-ups)"),
    ]),
]
# Labels on the arrows between layers (index = gap below that layer).
GAP_LABELS = {1: "HTTPS / Secure WebSocket"}

X0, WIDTH = 40, 1520          # left edge and total width of each layer
LABEL_W = 250                 # coloured title block
LAYER_H = 120
GAP = 46
PAD = 14
TOP = 40

cells = []
next_id = 2


def add(xml):
    cells.append(xml)


def new_id():
    global next_id
    next_id += 1
    return f"c{next_id}"


def vertex(value, style, x, y, w, h):
    cid = new_id()
    value = escape(value, {'"': "&quot;"})
    add(f'<mxCell id="{cid}" value="{value}" style="{style}" vertex="1" parent="1">'
        f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
    return cid


# No title inside the picture: the Word document puts the caption
# "Figure 1. The technology stack of OMECOnnect." below the figure.

layer_ids = []
for index, (title, subtitle, border, bg, text_color, items) in enumerate(LAYERS):
    y = TOP + index * (LAYER_H + GAP)
    # Layer container
    layer = vertex("", f"rounded=1;arcSize=8;whiteSpace=wrap;html=1;fillColor={bg};strokeColor={border};strokeWidth=2;",
                   X0, y, WIDTH, LAYER_H)
    layer_ids.append(layer)
    # Coloured title block on the left
    vertex(f'<b style="font-size:22px">{title}</b><br><span style="font-size:14px">{subtitle}</span>',
           f"rounded=1;arcSize=10;whiteSpace=wrap;html=1;fillColor={border};strokeColor={border};fontColor=#ffffff;"
           "align=left;spacingLeft=16;verticalAlign=middle;fontFamily=Arial;",
           X0, y, LABEL_W, LAYER_H)
    # Item boxes
    inner_x = X0 + LABEL_W + PAD
    inner_w = WIDTH - LABEL_W - 2 * PAD
    n = len(items)
    box_w = (inner_w - (n - 1) * PAD) / n
    for i, (name, details) in enumerate(items):
        bx = inner_x + i * (box_w + PAD)
        vertex(f'<b style="font-size:18px;color:{text_color}">{name}</b>'
               f'<br><span style="font-size:13px;color:#4a5568">{details}</span>',
               f"rounded=1;arcSize=12;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor={border};strokeWidth=1.5;"
               "align=center;verticalAlign=middle;fontFamily=Arial;",
               round(bx, 1), y + PAD, round(box_w, 1), LAYER_H - 2 * PAD)

# Two-way arrows between layers
for index in range(len(LAYERS) - 1):
    y_top = TOP + index * (LAYER_H + GAP) + LAYER_H
    cx = X0 + WIDTH / 2
    eid = new_id()
    label = escape(GAP_LABELS.get(index, ""), {'"': "&quot;"})
    add(f'<mxCell id="{eid}" value="{label}" style="endArrow=block;startArrow=block;endFill=1;startFill=1;html=1;'
        f'strokeColor=#617085;strokeWidth=2;fontSize=15;fontColor=#4a5568;labelBackgroundColor=#ffffff;" '
        f'edge="1" parent="1" source="{layer_ids[index]}" target="{layer_ids[index + 1]}">'
        f'<mxGeometry relative="1" as="geometry"><mxPoint x="{cx}" y="{y_top}" as="sourcePoint"/>'
        f'<mxPoint x="{cx}" y="{y_top + GAP}" as="targetPoint"/></mxGeometry></mxCell>')

height = TOP + len(LAYERS) * (LAYER_H + GAP)
xml = (
    '<mxfile host="app.diagrams.net" agent="OMECOnnect docs generator" version="24.7.17">\n'
    '  <diagram id="tech-stack" name="Figure 1 - Technology Stack">\n'
    f'    <mxGraphModel dx="1600" dy="{height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" '
    f'fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="{height}" math="0" shadow="0">\n'
    '      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n        '
    + "\n        ".join(cells)
    + '\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n'
)
OUT.write_text(xml, encoding="utf-8")
print(f"Wrote {OUT} ({len(cells)} shapes)")
