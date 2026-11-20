# OMECOnnect web (sign-in chooser + customer app + admin dashboard)
#
# A small, non-root nginx image that serves the static app on port 8080.
# The database and sign-in run on Supabase (cloud); this container only serves
# the web pages, with security headers added by nginx.
#
# Build and run:   docker compose up -d --build
# Then open:       http://localhost:8080/

FROM nginxinc/nginx-unprivileged:1.27-alpine

LABEL org.opencontainers.image.title="OMECOnnect web" \
      org.opencontainers.image.description="OMECO customer app and admin dashboard (static, served by nginx)"

# Supabase project the pages are allowed to talk to (used in the security policy).
# Override with:  docker run -e SUPABASE_URL=https://<ref>.supabase.co ...
ENV SUPABASE_URL=https://qkhqrerexiikymnftlne.supabase.co \
    SUPABASE_REALTIME_URL=wss://qkhqrerexiikymnftlne.supabase.co

# nginx renders /etc/nginx/templates/*.template into /etc/nginx/conf.d/ at start-up,
# replacing ${SUPABASE_URL}. Remove the image's sample site first.
USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

# Two separate sites (see nginx/default.conf.template):
#   customer site -> /usr/share/nginx/customer  (port 8080, NO admin files)
#   admin site    -> /usr/share/nginx/admin     (port 8081, this computer only)
# Source folders (frontend/) -> same web addresses as the live site.
COPY frontend/public/privacy.html frontend/public/terms.html frontend/public/offline.html      frontend/public/manifest.webmanifest frontend/public/sw.js frontend/public/version.json      /usr/share/nginx/customer/
COPY frontend/public/icons/ /usr/share/nginx/customer/icons/
COPY frontend/public/downloads/ /usr/share/nginx/customer/downloads/
COPY frontend/public/.well-known/ /usr/share/nginx/customer/.well-known/
# Each app = the shared files (live.js, theme.js, statement.*) + its own files.
COPY frontend/shared/ /usr/share/nginx/customer/customer-mobile-app/
COPY frontend/customer-mobile-app/ /usr/share/nginx/customer/customer-mobile-app/
COPY frontend/shared/ /usr/share/nginx/admin/admin-dashboard/
COPY frontend/admin-dashboard/ /usr/share/nginx/admin/admin-dashboard/
COPY frontend/public/version.json /usr/share/nginx/admin/
RUN rm -rf /usr/share/nginx/html \
           /usr/share/nginx/customer/customer-mobile-app/config.example.js \
           /usr/share/nginx/admin/admin-dashboard/config.example.js \
 && chmod -R a+rX /usr/share/nginx/customer /usr/share/nginx/admin

# Back to the unprivileged nginx user (uid 101).
USER 101

# 8080 = customer site, 8081 = admin site
EXPOSE 8080 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz && wget -q -O /dev/null http://127.0.0.1:8081/healthz || exit 1
