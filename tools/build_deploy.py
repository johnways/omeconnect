"""Builds the folder to upload to Vercel, Netlify (or any static host): deploy/

Only the app files are copied (chooser page, customer app, admin dashboard).
The database/, docs/, supabase/ and tools/ folders are NOT included, so internal
notes and SQL never get published.

Usage (from the project folder):
    python tools/build_deploy.py
Then drag the deploy/ folder onto Netlify (see docs/NEXT_STEPS_FOR_YOU.md, step 4).
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "deploy"
APP_FOLDERS = ["customer-mobile-app", "admin-dashboard"]
SKIP_FILES = {"config.example.js"}


def read_supabase_url() -> str:
    config = (ROOT / "customer-mobile-app" / "config.js").read_text(encoding="utf-8")
    for line in config.splitlines():
        if "supabaseUrl" in line and "https://" in line:
            return line.split("'")[1].rstrip("/")
    sys.exit("Could not find supabaseUrl in customer-mobile-app/config.js")


def main() -> None:
    supabase_url = read_supabase_url()

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()

    shutil.copy2(ROOT / "index.html", OUT / "index.html")
    for folder in APP_FOLDERS:
        target = OUT / folder
        target.mkdir()
        for path in (ROOT / folder).iterdir():
            if path.is_file() and path.name not in SKIP_FILES:
                shutil.copy2(path, target / path.name)

    # Security headers (Netlify reads this file automatically).
    # The pages may only run their own scripts and only talk to your Supabase project.
    csp = "; ".join([
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        f"connect-src 'self' {supabase_url}",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ])
    (OUT / "_headers").write_text(
        "/*\n"
        f"  Content-Security-Policy: {csp}\n"
        "  X-Frame-Options: DENY\n"
        "  X-Content-Type-Options: nosniff\n"
        "  Referrer-Policy: strict-origin-when-cross-origin\n"
        "  Permissions-Policy: camera=(), microphone=(), geolocation=()\n"
        "\n"
        "/admin-dashboard/*\n"
        "  X-Robots-Tag: noindex, nofollow\n",
        encoding="utf-8",
    )
    # The same headers for Vercel (Vercel project "Root Directory" = deploy).
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
        "headers": [
            {"source": "/(.*)", "headers": common},
            {"source": "/admin-dashboard/(.*)", "headers": [{"key": "X-Robots-Tag", "value": "noindex, nofollow"}]},
        ],
    }
    # (Vercel already sends "max-age=0, must-revalidate", so updates show at once.)
    (OUT / "vercel.json").write_text(json.dumps(vercel, indent=2) + "\n", encoding="utf-8")
    (OUT / "robots.txt").write_text("User-agent: *\nDisallow: /admin-dashboard/\n", encoding="utf-8")

    files = sorted(p.relative_to(OUT).as_posix() for p in OUT.rglob("*") if p.is_file())
    print(f"Built {OUT} with {len(files)} files:")
    for name in files:
        print("  " + name)


if __name__ == "__main__":
    main()
