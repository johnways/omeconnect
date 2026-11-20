"""Local preview servers for OMECOnnect — customer and admin on SEPARATE addresses.

    python tools/serve_local.py customer   ->  http://localhost:5500/  (customer app, no admin pages)
    python tools/serve_local.py admin      ->  http://localhost:5501/  (admin dashboard only)

Both listen on 127.0.0.1, so only this computer can open them.
Each site serves only its own approved files: the customer site has no admin
pages, the admin site has nothing but the admin dashboard, and neither serves
the rest of the project folder (docs, SQL, tools, android-signing, ...).
"""
import functools
import http.server
import posixpath
import sys
import urllib.parse
from site_layout import ROOT, resolve
SITES = {
    "customer": {"port": 5500, "home": "/customer-mobile-app/index.html"},
    "admin": {"port": 5501, "home": "/admin-dashboard/index.html"},
}
# Each site serves ONLY these paths; everything else in the project folder
# (docs, database SQL, tools, signing keys, ...) is 404.
CUSTOMER_ALLOWED = (
    "/customer-mobile-app/", "/icons/", "/downloads/", "/.well-known/assetlinks.json",
    "/privacy.html", "/terms.html", "/offline.html", "/manifest.webmanifest", "/sw.js", "/version.json",
)
ADMIN_ALLOWED = ("/admin-dashboard/", "/version.json")


def make_handler(site):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def _path(self):
            # Decode and normalise first, so tricks like /admin-dashboard/../x or
            # %2e%2e cannot slip past the checks below.
            raw = urllib.parse.unquote(self.path.split("?", 1)[0].split("#", 1)[0])
            clean = posixpath.normpath("/" + raw.lstrip("/"))
            return clean + ("/" if raw.endswith("/") and clean != "/" else "")

        def _refuse(self):
            self.send_error(404, "Not found")

        def _route(self):
            path = self._path()
            if path in ("/", "/index.html"):
                self.send_response(302)
                self.send_header("Location", SITES[site]["home"])
                self.end_headers()
                return False
            allowed = CUSTOMER_ALLOWED if site == "customer" else ADMIN_ALLOWED
            if not path.startswith(allowed):
                self._refuse()
                return False
            if "/." in path and path != "/.well-known/assetlinks.json":  # hidden files (.git, .env)
                self._refuse()
                return False
            return True

        def translate_path(self, path):
            # Web address -> source file in frontend/ (see tools/site_layout.py).
            source = resolve(self._path())
            return str(source) if source else str(ROOT / "__not_found__")

        def do_GET(self):
            if self._route():
                super().do_GET()

        def do_HEAD(self):
            if self._route():
                super().do_HEAD()

        def end_headers(self):
            self.send_header("Cache-Control", "no-store" if site == "admin" else "no-cache")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("X-Content-Type-Options", "nosniff")
            if site == "admin":
                self.send_header("X-Robots-Tag", "noindex, nofollow")
            super().end_headers()

        def log_message(self, fmt, *args):
            sys.stderr.write(f"[{site}] {self.address_string()} - {fmt % args}\n")

    return Handler


def main():
    site = sys.argv[1] if len(sys.argv) > 1 else ""
    if site not in SITES:
        sys.exit("Usage: python tools/serve_local.py customer|admin")
    port = SITES[site]["port"]
    handler = functools.partial(make_handler(site), directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"OMECOnnect {site} site: http://localhost:{port}/  (this computer only)", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
