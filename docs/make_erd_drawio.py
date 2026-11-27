"""Builds the OMECOnnect Entity Relationship Diagram (crow's foot notation):

    docs/OMECOnnect_ERD.drawio   open in app.diagrams.net or the draw.io desktop app
    docs/OMECOnnect_ERD.svg      same drawing (preview / for the PNG)

Run:  python docs/make_erd_drawio.py

Every line has exact, hand-planned points (no automatic routing), so draw.io shows
precisely what is checked here. The script REFUSES to write the files if any two
lines cross or overlap, or if a line passes through a table.
(system_logs is left out: it has no relationships to other tables.)
"""
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).parent
OUT_DRAWIO = HERE / "OMECOnnect_ERD.drawio"
OUT_SVG = HERE / "OMECOnnect_ERD.svg"

# ---------------------------------------------------------------- layout
BOX_W, GAP_X = 250, 46
HEAD_H, ROW_H, PAD_B = 34, 27, 6
MARGIN = 30
COL_X = [MARGIN + i * (BOX_W + GAP_X) for i in range(5)]
ROW_Y = [MARGIN, 0, 0]            # rows 2 and 3 are placed below, after measuring
FONT_HEAD, FONT_ROW = 15, 14.5
LINE = "#334155"

ENTITIES = {
    "SERVICE_AREAS": (0, 0, "#d5e8d4", ["PK municipality", "PK barangay", "municipality_order", "barangay_order"]),
    "ADMIN_ACCOUNTS": (1, 0, "#f8cecc", ["PK id", "FK user_id", "employee_id", "department"]),
    "AI_CHAT_HISTORY": (2, 0, "#e1d5e7", ["PK id", "FK user_id", "prompt", "response", "created_at"]),
    "PUSH_SUBSCRIPTIONS": (3, 0, "#e1d5e7", ["PK id", "FK user_id", "endpoint", "created_at"]),
    "AUDIT_LOGS": (4, 0, "#f5f5f5", ["PK id", "FK user_id", "action", "entity_type", "created_at"]),
    "COMPLAINT_STATUS_HISTORY": (0, 1, "#fff2cc", ["PK id", "FK complaint_id", "FK updated_by", "old_status", "new_status"]),
    "VERIFICATION_REQUESTS": (1, 1, "#fff2cc", ["PK id", "FK user_id", "FK reviewed_by", "account_number", "status"]),
    "USERS": (2, 1, "#dae8fc", ["PK id", "full_name", "email", "mobile_number", "role", "FK municipality", "FK barangay"]),
    "ANNOUNCEMENTS": (3, 1, "#ffe6cc", ["PK id", "FK created_by", "title", "affected_area", "is_published"]),
    "NOTIFICATIONS": (4, 1, "#ffe6cc", ["PK id", "FK user_id", "FK announcement_id", "FK bill_id", "title", "is_read"]),
    "COMPLAINTS": (0, 2, "#fff2cc", ["PK id", "FK customer_account_id", "FK user_id", "tracking_number", "complaint_type", "status"]),
    "METER_READINGS": (1, 2, "#dae8fc", ["PK id", "FK customer_account_id", "reading_date", "kwh_value"]),
    "CUSTOMER_ACCOUNTS": (2, 2, "#dae8fc", ["PK id", "FK user_id", "account_number", "meter_number", "verification_status"]),
    "ELECTRICITY_BILLS": (3, 2, "#dae8fc", ["PK id", "FK customer_account_id", "billing_month", "due_date", "total_amount", "status"]),
    "PAYMENTS": (4, 2, "#dae8fc", ["PK id", "FK customer_account_id", "amount", "payment_method", "payment_date"]),
}


def height(attrs):
    return HEAD_H + ROW_H * len(attrs) + PAD_B


def row_bottom(row, y):
    return y + max(height(a) for (c, r, _, a) in ENTITIES.values() if r == row)


# Vertical space between rows holds the horizontal "lanes" of the lines.
ROW1_BOTTOM = row_bottom(0, ROW_Y[0])
LANE_TOP_INNER, LANE_TOP_OUTER = ROW1_BOTTOM + 24, ROW1_BOTTOM + 50
ROW_Y[1] = ROW1_BOTTOM + 80
ROW2_BOTTOM = row_bottom(1, ROW_Y[1])
LANE_MID_1, LANE_MID_2 = ROW2_BOTTOM + 28, ROW2_BOTTOM + 56
ROW_Y[2] = ROW2_BOTTOM + 86
ROW3_BOTTOM = row_bottom(2, ROW_Y[2])
LANE_BOTTOM = ROW3_BOTTOM + 34
HEIGHT = LANE_BOTTOM + MARGIN
WIDTH = COL_X[-1] + BOX_W + MARGIN

BOX = {}
for name, (col, row, color, attrs) in ENTITIES.items():
    BOX[name] = (COL_X[col], ROW_Y[row], BOX_W, height(attrs))


def at(name, fx, fy):
    """Point on a table's border: fx, fy are 0..1 across its width and height."""
    x, y, w, h = BOX[name]
    return (x + w * fx, y + h * fy)


def at_y(name, side, y):
    """Point on the left (side=0) or right (side=1) border at an absolute y."""
    x, _, w, _ = BOX[name]
    return (x + w * side, y)


# ---------------------------------------------------------------- relationships
# (child = "many" side, parent = "one" side, child marker, path from child to parent)
# Markers: ERzeroToMany = zero or many; ERzeroToOne = zero or one; parent end is ERmandOne.
U = "USERS"
UX = lambda f: COL_X[2] + BOX_W * f            # x on the USERS table
MID_Y = ROW_Y[1] + 70                           # where the middle-row tables connect side by side
CA_Y = ROW_Y[2] + 66                            # where the bottom-row tables connect side by side


def path(*points):
    return [tuple(map(float, p)) for p in points]


def top_in(child, fx_users, lane):
    """Top-row table -> USERS: down, along its own lane, down into USERS' top."""
    sx, sy = at(child, 0.5, 1)
    tx = UX(fx_users)
    if abs(sx - tx) < 0.5:
        return path((sx, sy), (tx, ROW_Y[1]))
    return path((sx, sy), (sx, lane), (tx, lane), (tx, ROW_Y[1]))


RELATIONSHIPS = [
    # Top row into USERS' top edge. The outer tables use the lower lane and enter USERS
    # nearer its corners, the inner tables the upper lane, so no two lines meet.
    ("SERVICE_AREAS", U, "ERzeroToMany", top_in("SERVICE_AREAS", 0.10, LANE_TOP_OUTER)),
    ("ADMIN_ACCOUNTS", U, "ERzeroToOne", top_in("ADMIN_ACCOUNTS", 0.30, LANE_TOP_INNER)),
    ("AI_CHAT_HISTORY", U, "ERzeroToMany", top_in("AI_CHAT_HISTORY", 0.50, LANE_TOP_INNER)),
    ("PUSH_SUBSCRIPTIONS", U, "ERzeroToMany", top_in("PUSH_SUBSCRIPTIONS", 0.70, LANE_TOP_INNER)),
    ("AUDIT_LOGS", U, "ERzeroToMany", top_in("AUDIT_LOGS", 0.90, LANE_TOP_OUTER)),
    # Middle row, side by side
    ("VERIFICATION_REQUESTS", U, "ERzeroToMany", path(at_y("VERIFICATION_REQUESTS", 1, MID_Y), at_y(U, 0, MID_Y))),
    ("ANNOUNCEMENTS", U, "ERzeroToMany", path(at_y("ANNOUNCEMENTS", 0, MID_Y), at_y(U, 1, MID_Y))),
    ("NOTIFICATIONS", "ANNOUNCEMENTS", "ERzeroToMany", path(at_y("NOTIFICATIONS", 0, MID_Y), at_y("ANNOUNCEMENTS", 1, MID_Y))),
    ("COMPLAINT_STATUS_HISTORY", "COMPLAINTS", "ERzeroToMany",
     path(at("COMPLAINT_STATUS_HISTORY", 0.5, 1), (at("COMPLAINT_STATUS_HISTORY", 0.5, 1)[0], ROW_Y[2]))),
    # Between the middle and bottom rows (lane 1 = closer to the middle row)
    ("COMPLAINTS", U, "ERzeroToMany",
     path(at("COMPLAINTS", 0.80, 0), (at("COMPLAINTS", 0.80, 0)[0], LANE_MID_1), (UX(0.15), LANE_MID_1), (UX(0.15), ROW2_BOTTOM_U := BOX[U][1] + BOX[U][3]))),
    ("CUSTOMER_ACCOUNTS", U, "ERzeroToMany", path(at("CUSTOMER_ACCOUNTS", 0.5, 0), (UX(0.5), BOX[U][1] + BOX[U][3]))),
    ("NOTIFICATIONS", U, "ERzeroToMany",
     path(at("NOTIFICATIONS", 0.25, 1), (at("NOTIFICATIONS", 0.25, 1)[0], LANE_MID_1), (UX(0.85), LANE_MID_1), (UX(0.85), BOX[U][1] + BOX[U][3]))),
    ("NOTIFICATIONS", "ELECTRICITY_BILLS", "ERzeroToMany",
     path(at("NOTIFICATIONS", 0.75, 1), (at("NOTIFICATIONS", 0.75, 1)[0], LANE_MID_2), (at("ELECTRICITY_BILLS", 0.5, 0)[0], LANE_MID_2), at("ELECTRICITY_BILLS", 0.5, 0))),
    # Bottom row, side by side
    ("METER_READINGS", "CUSTOMER_ACCOUNTS", "ERzeroToMany", path(at_y("METER_READINGS", 1, CA_Y), at_y("CUSTOMER_ACCOUNTS", 0, CA_Y))),
    ("ELECTRICITY_BILLS", "CUSTOMER_ACCOUNTS", "ERzeroToMany", path(at_y("ELECTRICITY_BILLS", 0, CA_Y), at_y("CUSTOMER_ACCOUNTS", 1, CA_Y))),
    # Under the bottom row (two separate stretches of the same lane)
    ("COMPLAINTS", "CUSTOMER_ACCOUNTS", "ERzeroToMany",
     path(at("COMPLAINTS", 0.5, 1), (at("COMPLAINTS", 0.5, 1)[0], LANE_BOTTOM), (at("CUSTOMER_ACCOUNTS", 0.15, 1)[0], LANE_BOTTOM), at("CUSTOMER_ACCOUNTS", 0.15, 1))),
    ("PAYMENTS", "CUSTOMER_ACCOUNTS", "ERzeroToMany",
     path(at("PAYMENTS", 0.5, 1), (at("PAYMENTS", 0.5, 1)[0], LANE_BOTTOM), (at("CUSTOMER_ACCOUNTS", 0.85, 1)[0], LANE_BOTTOM), at("CUSTOMER_ACCOUNTS", 0.85, 1))),
]


# ---------------------------------------------------------------- safety checks
def segments(points):
    return list(zip(points, points[1:]))


def cross(a, b):
    """True if two axis-aligned segments touch or overlap (shared end points excluded)."""
    (ax1, ay1), (ax2, ay2) = a
    (bx1, by1), (bx2, by2) = b
    a_h, b_h = ay1 == ay2, by1 == by2
    if a_h and b_h:  # both horizontal: overlap on the same y?
        return ay1 == by1 and min(ax1, ax2) < max(bx1, bx2) and min(bx1, bx2) < max(ax1, ax2)
    if not a_h and not b_h:  # both vertical
        return ax1 == bx1 and min(ay1, ay2) < max(by1, by2) and min(by1, by2) < max(ay1, ay2)
    h, v = (a, b) if a_h else (b, a)
    (hx1, hy), (hx2, _) = h
    (vx, vy1), (_, vy2) = v
    return min(hx1, hx2) <= vx <= max(hx1, hx2) and min(vy1, vy2) <= hy <= max(vy1, vy2)


def through_box(seg, name):
    """True if a segment passes through the inside of a table."""
    (x1, y1), (x2, y2) = seg
    bx, by, bw, bh = BOX[name]
    if y1 == y2:
        return by < y1 < by + bh and min(x1, x2) < bx + bw and max(x1, x2) > bx
    return bx < x1 < bx + bw and min(y1, y2) < by + bh and max(y1, y2) > by


problems = []
for i, (c1, p1, _, pts1) in enumerate(RELATIONSHIPS):
    for s in segments(pts1):
        if s[0][0] != s[1][0] and s[0][1] != s[1][1]:
            problems.append(f"{c1}->{p1}: a slanted segment {s}")
        for name in BOX:
            if through_box(s, name):
                problems.append(f"{c1}->{p1} passes through {name}")
    for c2, p2, _, pts2 in RELATIONSHIPS[i + 1:]:
        for s1 in segments(pts1):
            for s2 in segments(pts2):
                if cross(s1, s2):
                    problems.append(f"{c1}->{p1} meets {c2}->{p2}")
if problems:
    raise SystemExit("Layout problems, nothing written:\n  " + "\n  ".join(sorted(set(problems))))


# ---------------------------------------------------------------- draw.io file
def attr(value):
    return escape(value, {'"': "&quot;"})


cells, ids, counter = [], {}, [1]


def new_id():
    counter[0] += 1
    return f"e{counter[0]}"


for name, (col, row, color, attrs) in ENTITIES.items():
    x, y, w, h = BOX[name]
    eid = new_id()
    ids[name] = eid
    cells.append(
        f'<mxCell id="{eid}" value="{attr(name)}" style="swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;'
        f'startSize={HEAD_H};horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;'
        f'rounded=1;arcSize=5;fillColor={color};strokeColor=#5f6b7a;strokeWidth=1.4;fontSize={FONT_HEAD};fontFamily=Arial;'
        f'swimlaneFillColor=#ffffff;" vertex="1" parent="1"><mxGeometry x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h:.0f}" as="geometry"/></mxCell>')
    for i, a in enumerate(attrs):
        key, field = (a[:2], a[3:]) if a[:3] in ("PK ", "FK ") else ("", a)
        label = {"PK": f"<b>PK</b>&nbsp;&nbsp;<u><b>{field}</b></u>",
                 "FK": f"<b>FK</b>&nbsp;&nbsp;<i>{field}</i>"}.get(key, f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{field}")
        cells.append(
            f'<mxCell id="{new_id()}" value="{attr(label)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;'
            f'verticalAlign=middle;spacingLeft=10;fontSize={FONT_ROW};fontFamily=Arial;overflow=hidden;" vertex="1" parent="{eid}">'
            f'<mxGeometry y="{HEAD_H + i * ROW_H}" width="{w:.0f}" height="{ROW_H}" as="geometry"/></mxCell>')

for child, parent, marker, pts in RELATIONSHIPS:
    (sx, sy), (tx, ty) = pts[0], pts[-1]
    bx, by, bw, bh = BOX[child]
    px, py, pw, ph = BOX[parent]
    ex, ey = (sx - bx) / bw, (sy - by) / bh
    nx, ny = (tx - px) / pw, (ty - py) / ph
    inner = "".join(f'<mxPoint x="{x:.0f}" y="{y:.0f}"/>' for x, y in pts[1:-1])
    geometry = (f'<mxGeometry relative="1" as="geometry"><Array as="points">{inner}</Array></mxGeometry>'
                if inner else '<mxGeometry relative="1" as="geometry"/>')
    cells.append(
        f'<mxCell id="{new_id()}" style="edgeStyle=none;rounded=0;html=1;startArrow={marker};endArrow=ERmandOne;'
        f'startFill=0;endFill=0;startSize=13;endSize=13;strokeColor={LINE};strokeWidth=1.6;'
        f'exitX={ex:.4f};exitY={ey:.4f};exitDx=0;exitDy=0;entryX={nx:.4f};entryY={ny:.4f};entryDx=0;entryDy=0;" '
        f'edge="1" parent="1" source="{ids[child]}" target="{ids[parent]}">{geometry}</mxCell>')

drawio = (
    '<mxfile host="app.diagrams.net" agent="OMECOnnect docs generator" version="24.7.17">\n'
    '  <diagram id="erd" name="Entity Relationship Diagram">\n'
    f'    <mxGraphModel dx="{WIDTH:.0f}" dy="{HEIGHT:.0f}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" '
    f'fold="1" page="1" pageScale="1" pageWidth="{WIDTH:.0f}" pageHeight="{HEIGHT:.0f}" math="0" shadow="0">\n'
    '      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n        '
    + "\n        ".join(cells)
    + '\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n')
OUT_DRAWIO.write_text(drawio, encoding="utf-8")


# ---------------------------------------------------------------- SVG (same geometry)
def marker_svg(p_end, p_prev, kind):
    """Crow's foot markers drawn at p_end, for a line arriving from p_prev."""
    (x, y), (px, py) = p_end, p_prev
    dx, dy = (0, 1) if px == x and py < y else (0, -1) if px == x else (1, 0) if px < x else (-1, 0)
    nx, ny = -dy, dx  # perpendicular

    def pt(along, side):
        return f"{x - dx * along + nx * side:.1f},{y - dy * along + ny * side:.1f}"
    out = []
    if kind == "ERmandOne":  # two bars
        for a in (7, 12):
            out.append(f'<line x1="{pt(a, -7).split(",")[0]}" y1="{pt(a, -7).split(",")[1]}" x2="{pt(a, 7).split(",")[0]}" y2="{pt(a, 7).split(",")[1]}"/>')
    else:  # crow's foot + circle (zero or many), or bar + circle (zero or one)
        if kind == "ERzeroToMany":
            for side in (-7, 0, 7):
                a, b = pt(0, side).split(","), pt(11, 0).split(",")
                out.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}"/>')
        else:
            a, b = pt(7, -7).split(","), pt(7, 7).split(",")
            out.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}"/>')
        c = pt(17, 0).split(",")
        out.append(f'<circle cx="{c[0]}" cy="{c[1]}" r="4.5" fill="#ffffff"/>')
    return "".join(out)


svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH:.0f}" height="{HEIGHT:.0f}" viewBox="0 0 {WIDTH:.0f} {HEIGHT:.0f}" '
       f'font-family="Arial, Helvetica, sans-serif"><rect width="100%" height="100%" fill="#ffffff"/>']
svg.append(f'<g fill="none" stroke="{LINE}" stroke-width="1.6">')
for child, parent, marker, pts in RELATIONSHIPS:
    svg.append('<polyline points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in pts) + '"/>')
    svg.append(marker_svg(pts[0], pts[1], marker))
    svg.append(marker_svg(pts[-1], pts[-2], "ERmandOne"))
svg.append("</g>")
for name, (col, row, color, attrs) in ENTITIES.items():
    x, y, w, h = BOX[name]
    svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="#ffffff" stroke="#5f6b7a" stroke-width="1.4"/>')
    svg.append(f'<path d="M{x},{y + HEAD_H} V{y + 6} Q{x},{y} {x + 6},{y} H{x + w - 6} Q{x + w},{y} {x + w},{y + 6} V{y + HEAD_H} Z" '
               f'fill="{color}" stroke="#5f6b7a" stroke-width="1.4"/>')
    svg.append(f'<text x="{x + w / 2}" y="{y + HEAD_H / 2 + 5.5}" text-anchor="middle" font-size="{FONT_HEAD}" font-weight="700" fill="#111827">{escape(name)}</text>')
    for i, a in enumerate(attrs):
        ty = y + HEAD_H + i * ROW_H + ROW_H / 2 + 5
        key, field = (a[:2], a[3:]) if a[:3] in ("PK ", "FK ") else ("", a)
        if key:
            svg.append(f'<text x="{x + 10}" y="{ty}" font-size="{FONT_ROW}" font-weight="700" fill="#111827">{key}</text>')
        style = {"PK": 'font-weight="700" text-decoration="underline"', "FK": 'font-style="italic"'}.get(key, "")
        svg.append(f'<text x="{x + 42}" y="{ty}" font-size="{FONT_ROW}" fill="#1f2937" {style}>{escape(field)}</text>')
svg.append("</svg>")
OUT_SVG.write_text("\n".join(svg), encoding="utf-8")

print(f"OK: {len(ENTITIES)} tables, {len(RELATIONSHIPS)} relationships, {WIDTH:.0f}x{HEIGHT:.0f} px, "
      "no crossings, no overlaps, no line through a table.")
print(f"Wrote {OUT_DRAWIO.name} and {OUT_SVG.name}")
