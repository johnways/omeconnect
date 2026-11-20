"""Builds the two upload folders for the live sites (Vercel / Netlify):

    deploy/        PUBLIC customer site  (Vercel project "omeconnect", Root Directory = deploy)
                   customer app, Android download, privacy/terms — NO admin dashboard.
    deploy-admin/  PRIVATE admin site    (separate Vercel project, Root Directory = deploy-admin)
                   admin dashboard only; never indexed by search engines.

Only frontend/ is published (see tools/site_layout.py for which source file
becomes which web address). backend/, docs/, tools/ and android-signing/ are
never included, so internal notes, SQL and keys never get published.

Usage (from the project folder):
    python tools/build_deploy.py
Then commit and push: Vercel publishes both sites automatically.
"""
import hashlib
import json
import shutil
import sys

from site_layout import APPS, PUBLIC, ROOT, app_files

CUSTOMER_OUT = ROOT / "deploy"
ADMIN_OUT = ROOT / "deploy-admin"

# Kept True only while the new admin site is being set up, so staff are never
# without a dashboard. Set to False once the admin site is live.
INCLUDE_ADMIN_IN_CUSTOMER_SITE = False


def read_supabase_url() -> str:
    config = (APPS["customer-mobile-app"] / "config.js").read_text(encoding="utf-8")
    for line in config.splitlines():
        if "supabaseUrl" in line and "https://" in line:
            return line.split("'")[1].rstrip("/")
    sys.exit("Could not find supabaseUrl in frontend/customer-mobile-app/config.js")


def copy_app(app: str, out) -> None:
    """Publishes one app at /<app>/: its own files plus frontend/shared/."""
    target = out / app
    target.mkdir()
    for name, path in app_files(app).items():
        shutil.copy2(path, target / name)


def write_version(out) -> None:
    """Fingerprint of the files; open apps reload themselves when it changes (live.js)."""
    digest = hashlib.sha256()
    for path in sorted(p for p in out.rglob("*") if p.is_file()):
        digest.update(path.relative_to(out).as_posix().encode())
        digest.update(path.read_bytes().replace(b"\r\n", b"\n"))
    (out / "version.json").write_text(json.dumps({"version": digest.hexdigest()[:16]}) + "\n", encoding="utf-8")


def report(out) -> None:
    files = sorted(p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file())
    print(f"Built {out.name}/ with {len(files)} files:")
    for name in files:
        print("  " + name)


def main() -> None:
    supabase_url = read_supabase_url()
    # The pages may only run their own scripts and only talk to the Supabase
    # project: https for data and sign-in, wss for live updates (Realtime).
    csp = "; ".join([
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://*.googleusercontent.com",  # Google profile photos
        f"connect-src 'self' {supabase_url} {supabase_url.replace('https://', 'wss://', 1)}",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ])

    # ================================================================ customer site
    out = CUSTOMER_OUT
    if out.exists():
        shutil.rmtree(out)
    out.mkdir()
    for page in ("privacy.html", "terms.html", "offline.html", "manifest.webmanifest", "sw.js"):
        shutil.copy2(PUBLIC / page, out / page)
    for folder in ("icons", "downloads", ".well-known"):
        if (PUBLIC / folder).is_dir():
            shutil.copytree(PUBLIC / folder, out / folder)
    copy_app("customer-mobile-app", out)
    if INCLUDE_ADMIN_IN_CUSTOMER_SITE:
        copy_app("admin-dashboard", out)

    common = [
        {"key": "Content-Security-Policy", "value": csp},
        {"key": "X-Frame-Options", "value": "DENY"},
        {"key": "X-Content-Type-Options", "value": "nosniff"},
        {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
        {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()"},
    ]
    vercel = {
        "$schema": "https://openapi.vercel.sh/vercel.json",
        "cleanUrls": False,
        # The public site opens straight to the customer app (no staff option).
        "redirects": [
            {"source": "/", "destination": "/customer-mobile-app/index.html", "permanent": False},
            {"source": "/index.html", "destination": "/customer-mobile-app/index.html", "permanent": False},
        ],
        "headers": [
            {"source": "/(.*)", "headers": common},
            {"source": "/manifest.webmanifest", "headers": [{"key": "Content-Type", "value": "application/manifest+json"}]},
            {"source": "/downloads/(.*)", "headers": [
                {"key": "Content-Type", "value": "application/vnd.android.package-archive"},
                {"key": "Content-Disposition", "value": 'attachment; filename="OMECOnnect.apk"'},
            ]},
        ],
    }
    if INCLUDE_ADMIN_IN_CUSTOMER_SITE:
        vercel["headers"].append({"source": "/admin-dashboard/(.*)", "headers": [{"key": "X-Robots-Tag", "value": "noindex, nofollow"}]})
    (out / "vercel.json").write_text(json.dumps(vercel, indent=2) + "\n", encoding="utf-8")
    # Netlify equivalent of the same rules.
    (out / "_headers").write_text(
        "/*\n"
        f"  Content-Security-Policy: {csp}\n"
        "  X-Frame-Options: DENY\n"
        "  X-Content-Type-Options: nosniff\n"
        "  Referrer-Policy: strict-origin-when-cross-origin\n"
        "  Permissions-Policy: camera=(), microphone=(), geolocation=()\n"
        "\n"
        "/manifest.webmanifest\n"
        "  Content-Type: application/manifest+json\n"
        "\n"
        "/downloads/*\n"
        "  Content-Type: application/vnd.android.package-archive\n"
        '  Content-Disposition: attachment; filename="OMECOnnect.apk"\n',
        encoding="utf-8",
    )
    (out / "_redirects").write_text("/  /customer-mobile-app/index.html  302\n/index.html  /customer-mobile-app/index.html  302\n", encoding="utf-8")
    (out / "robots.txt").write_text("User-agent: *\nAllow: /\n", encoding="utf-8")
    write_version(out)
    report(out)

    # ================================================================ admin site
    out = ADMIN_OUT
    if out.exists():
        shutil.rmtree(out)
    out.mkdir()
    copy_app("admin-dashboard", out)
    admin_headers = [
        {"key": "Content-Security-Policy", "value": csp},
        {"key": "X-Frame-Options", "value": "DENY"},
        {"key": "X-Content-Type-Options", "value": "nosniff"},
        {"key": "Referrer-Policy", "value": "no-referrer"},
        {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()"},
        # Never listed by search engines, never stored by shared caches.
        {"key": "X-Robots-Tag", "value": "noindex, nofollow, noarchive"},
        {"key": "Cache-Control", "value": "no-store"},
    ]
    admin_vercel = {
        "$schema": "https://openapi.vercel.sh/vercel.json",
        "cleanUrls": False,
        "redirects": [
            {"source": "/", "destination": "/admin-dashboard/index.html", "permanent": False},
            {"source": "/index.html", "destination": "/admin-dashboard/index.html", "permanent": False},
        ],
        "headers": [{"source": "/(.*)", "headers": admin_headers}],
    }
    (out / "vercel.json").write_text(json.dumps(admin_vercel, indent=2) + "\n", encoding="utf-8")
    (out / "_headers").write_text(
        "/*\n" + "".join(f"  {h['key']}: {h['value']}\n" for h in admin_headers), encoding="utf-8")
    (out / "_redirects").write_text("/  /admin-dashboard/index.html  302\n/index.html  /admin-dashboard/index.html  302\n", encoding="utf-8")
    (out / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    write_version(out)
    report(out)


if __name__ == "__main__":
    main()
