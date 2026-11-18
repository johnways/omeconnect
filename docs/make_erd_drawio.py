"""Builds docs/OMECOnnect_ERD.drawio — the Entity Relationship Diagram (crow's
foot notation) of the OMECOnnect database, taken from the real Supabase schema.

Run:  python docs/make_erd_drawio.py
Open: app.diagrams.net -> Open Existing Diagram (or the draw.io desktop app).
(system_logs is left out: it has no relationships to other tables.)
"""
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).with_name("OMECOnnect_ERD.drawio")

BOX_W, HEAD_H, ROW_H = 270, 34, 26
COL_X = [20 + i * (BOX_W + 40) for i in range(5)]
ROW_Y = [20, 264, 580]

# key: (column, row, header colour, [attributes])  — "PK x" / "FK x" / plain
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

# (one side, many side, start marker, end marker, exitX, exitY, entryX, entryY, waypoints)
# Markers: ERmandOne = exactly one, ERzeroToMany = zero or many, ERzeroToOne = zero or one.
BOTTOM_LANE_1, BOTTOM_LANE_2 = 805, 835
GAP_R1_R2 = 530  # between rows 1 and 2
RELATIONSHIPS = [
    # USERS fans out to the top row; every line gets its own horizontal track
    # (outer boxes use the track nearest USERS so no two lines cross or overlap).
    ("SERVICE_AREAS", "USERS", "ERmandOne", "ERzeroToMany", 0.5, 1, 0.1, 0,
     [(COL_X[0] + BOX_W * 0.5, 246), (COL_X[2] + BOX_W * 0.1, 246)]),
    ("USERS", "ADMIN_ACCOUNTS", "ERmandOne", "ERzeroToOne", 0.3, 0, 0.5, 1,
     [(COL_X[2] + BOX_W * 0.3, 224), (COL_X[1] + BOX_W * 0.5, 224)]),
    ("USERS", "AI_CHAT_HISTORY", "ERmandOne", "ERzeroToMany", 0.5, 0, 0.5, 1, []),
    ("USERS", "PUSH_SUBSCRIPTIONS", "ERmandOne", "ERzeroToMany", 0.7, 0, 0.5, 1,
     [(COL_X[2] + BOX_W * 0.7, 226), (COL_X[3] + BOX_W * 0.5, 226)]),
    ("USERS", "AUDIT_LOGS", "ERmandOne", "ERzeroToMany", 0.9, 0, 0.5, 1,
     [(COL_X[2] + BOX_W * 0.9, 246), (COL_X[4] + BOX_W * 0.5, 246)]),
    # USERS to its neighbours in the middle row
    ("USERS", "VERIFICATION_REQUESTS", "ERmandOne", "ERzeroToMany", 0, 0.5, 1, 0.5, []),
    ("USERS", "ANNOUNCEMENTS", "ERmandOne", "ERzeroToMany", 1, 0.5, 0, 0.5, []),
    ("ANNOUNCEMENTS", "NOTIFICATIONS", "ERmandOne", "ERzeroToMany", 1, 0.5, 0, 0.5, []),
    # USERS down to customer accounts, complaints and notifications
    ("USERS", "CUSTOMER_ACCOUNTS", "ERmandOne", "ERzeroToMany", 0.5, 1, 0.5, 0, []),
    ("USERS", "COMPLAINTS", "ERmandOne", "ERzeroToMany", 0.2, 1, 0.85, 0,
     [(COL_X[2] + BOX_W * 0.2, GAP_R1_R2), (COL_X[0] + BOX_W * 0.85, GAP_R1_R2)]),
    ("USERS", "NOTIFICATIONS", "ERmandOne", "ERzeroToMany", 0.8, 1, 0.3, 1,
     [(COL_X[2] + BOX_W * 0.8, GAP_R1_R2), (COL_X[4] + BOX_W * 0.3, GAP_R1_R2)]),
    ("COMPLAINTS", "COMPLAINT_STATUS_HISTORY", "ERmandOne", "ERzeroToMany", 0.4, 0, 0.4, 1, []),
    # Customer account side
    ("CUSTOMER_ACCOUNTS", "METER_READINGS", "ERmandOne", "ERzeroToMany", 0, 0.35, 1, 0.35, []),
    ("CUSTOMER_ACCOUNTS", "ELECTRICITY_BILLS", "ERmandOne", "ERzeroToMany", 1, 0.35, 0, 0.35, []),
    ("CUSTOMER_ACCOUNTS", "PAYMENTS", "ERmandOne", "ERzeroToMany", 0.7, 1, 0.5, 1,
     [(COL_X[2] + BOX_W * 0.7, BOTTOM_LANE_1), (COL_X[4] + BOX_W * 0.5, BOTTOM_LANE_1)]),
    ("CUSTOMER_ACCOUNTS", "COMPLAINTS", "ERmandOne", "ERzeroToMany", 0.3, 1, 0.5, 1,
     [(COL_X[2] + BOX_W * 0.3, BOTTOM_LANE_2), (COL_X[0] + BOX_W * 0.5, BOTTOM_LANE_2)]),
    ("ELECTRICITY_BILLS", "NOTIFICATIONS", "ERmandOne", "ERzeroToMany", 0.6, 0, 0.75, 1,
     [(COL_X[3] + BOX_W * 0.6, GAP_R1_R2 + 14), (COL_X[4] + BOX_W * 0.75, GAP_R1_R2 + 14)]),
]

cells, ids, counter = [], {}, [1]


def new_id():
    counter[0] += 1
    return f"e{counter[0]}"


def attr(value):
    return escape(value, {'"': "&quot;"})


for name, (col, row, color, attrs) in ENTITIES.items():
    x, y = COL_X[col], ROW_Y[row]
    h = HEAD_H + ROW_H * len(attrs)
    eid = new_id()
    ids[name] = eid
    cells.append(
        f'<mxCell id="{eid}" value="{attr(name)}" style="swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;'
        f'startSize={HEAD_H};horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;'
        f'rounded=1;arcSize=6;fillColor={color};strokeColor=#5f6b7a;strokeWidth=1.5;fontSize=17;fontFamily=Arial;swimlaneFillColor=#ffffff;" '
        f'vertex="1" parent="1"><mxGeometry x="{x}" y="{y}" width="{BOX_W}" height="{h}" as="geometry"/></mxCell>')
    for i, a in enumerate(attrs):
        key, _, field = a.partition(" ") if a[:3] in ("PK ", "FK ") else ("", "", a)
        if key == "PK":
            label = f'<b>PK</b>&nbsp;&nbsp;<u><b>{field}</b></u>'
        elif key == "FK":
            label = f'<b>FK</b>&nbsp;&nbsp;<i>{field}</i>'
        else:
            label = f'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{field}'
        cells.append(
            f'<mxCell id="{new_id()}" value="{attr(label)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;'
            f'verticalAlign=middle;spacingLeft=8;fontSize=15;fontFamily=Arial;overflow=hidden;" vertex="1" parent="{eid}">'
            f'<mxGeometry y="{HEAD_H + i * ROW_H}" width="{BOX_W}" height="{ROW_H}" as="geometry"/></mxCell>')

for one, many, start, end, ex, ey, nx, ny, points in RELATIONSHIPS:
    pts = "".join(f'<mxPoint x="{px:.0f}" y="{py:.0f}"/>' for px, py in points)
    geometry = (f'<mxGeometry relative="1" as="geometry"><Array as="points">{pts}</Array></mxGeometry>'
                if pts else '<mxGeometry relative="1" as="geometry"/>')
    cells.append(
        f'<mxCell id="{new_id()}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;startArrow={start};endArrow={end};'
        f'startFill=0;endFill=0;startSize=14;endSize=14;strokeColor=#374151;strokeWidth=1.6;'
        f'exitX={ex};exitY={ey};exitDx=0;exitDy=0;entryX={nx};entryY={ny};entryDx=0;entryDy=0;" '
        f'edge="1" parent="1" source="{ids[one]}" target="{ids[many]}">{geometry}</mxCell>')

WIDTH, HEIGHT = COL_X[-1] + BOX_W + 20, 860
xml = (
    '<mxfile host="app.diagrams.net" agent="OMECOnnect docs generator" version="24.7.17">\n'
    '  <diagram id="erd" name="Entity Relationship Diagram">\n'
    f'    <mxGraphModel dx="{WIDTH}" dy="{HEIGHT}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" '
    f'fold="1" page="1" pageScale="1" pageWidth="{WIDTH}" pageHeight="{HEIGHT}" math="0" shadow="0">\n'
    '      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n        '
    + "\n        ".join(cells)
    + '\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n'
)
OUT.write_text(xml, encoding="utf-8")
print(f"Wrote {OUT}: {len(ENTITIES)} entities, {len(RELATIONSHIPS)} relationships, {WIDTH}x{HEIGHT}")
