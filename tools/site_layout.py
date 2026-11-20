"""Where every published file comes from.

The source code is split into frontend/ and backend/, but the web addresses
never change (the Android app, push notifications and Digital Asset Links all
depend on them):

    web address                     source file
    /customer-mobile-app/<file>     frontend/customer-mobile-app/<file>, else frontend/shared/<file>
    /admin-dashboard/<file>         frontend/admin-dashboard/<file>,     else frontend/shared/<file>
    /<anything else>                frontend/public/<anything else>   (sw.js, manifest, icons/, ...)

Used by tools/build_deploy.py and tools/serve_local.py.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
PUBLIC = FRONTEND / "public"
SHARED = FRONTEND / "shared"
APPS = {
    "customer-mobile-app": FRONTEND / "customer-mobile-app",
    "admin-dashboard": FRONTEND / "admin-dashboard",
}
# Templates for setting up a new copy of the project; never published.
SKIP_FILES = {"config.example.js"}


def app_files(app: str) -> dict:
    """{file name: source path} for one app: the shared files plus its own."""
    files = {p.name: p for p in SHARED.iterdir() if p.is_file()}
    files.update({p.name: p for p in APPS[app].iterdir() if p.is_file()})
    return {name: path for name, path in files.items() if name not in SKIP_FILES}


def resolve(url_path: str):
    """Source path for a normalised web path such as /customer-mobile-app/live.js."""
    parts = url_path.lstrip("/").split("/")
    if parts[0] in APPS:
        if len(parts) == 1 or parts[1] == "":
            return APPS[parts[0]]
        if len(parts) == 2:
            return app_files(parts[0]).get(parts[1])
        return None
    return PUBLIC.joinpath(*parts) if parts != [""] else PUBLIC
