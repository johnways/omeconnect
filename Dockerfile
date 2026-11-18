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
ENV SUPABASE_URL=https://qkhqrerexiikymnftlne.supabase.co

# nginx renders /etc/nginx/templates/*.template into /etc/nginx/conf.d/ at start-up,
# replacing ${SUPABASE_URL}. Remove the image's sample site first.
USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

# Only the app files (see .dockerignore): chooser page, customer app, admin dashboard.
COPY index.html /usr/share/nginx/html/index.html
COPY customer-mobile-app/ /usr/share/nginx/html/customer-mobile-app/
COPY admin-dashboard/ /usr/share/nginx/html/admin-dashboard/
RUN rm -f /usr/share/nginx/html/50x.html \
          /usr/share/nginx/html/customer-mobile-app/config.example.js \
          /usr/share/nginx/html/admin-dashboard/config.example.js \
 && chmod -R a+rX /usr/share/nginx/html

# Back to the unprivileged nginx user (uid 101).
USER 101

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
