# ── Canvas — Infinite Drawing ──────────────────────────────────────────────
# Dockerfile for deployment on Render.com (or any Docker host)
#
# Render sets a $PORT environment variable at runtime.
# Apache is reconfigured to listen on that port before starting.
# ───────────────────────────────────────────────────────────────────────────

FROM php:8.2-apache

# Enable mod_rewrite (useful for clean URLs / future routing)
RUN a2enmod rewrite

# Suppress "ServerName" warning
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

# ── App files ──────────────────────────────────────────────────────────────
WORKDIR /var/www/html
COPY . .

# ── Saves directory (PHP canvas persistence) ───────────────────────────────
# NOTE: Render free tier has an ephemeral filesystem — saves reset on redeploy.
# Add a Render Persistent Disk (mounted at /var/www/html/php/saves) to persist.
RUN mkdir -p php/saves \
    && chown -R www-data:www-data /var/www/html \
    && chmod 775 php/saves

# ── Port handling ──────────────────────────────────────────────────────────
# Render injects $PORT at runtime. We patch Apache's config at container start.
# Default fallback: 10000 (Render's typical default for web services).
EXPOSE 10000

CMD bash -c "\
  PORT=\${PORT:-10000} && \
  sed -i \"s/Listen 80/Listen \$PORT/g\" /etc/apache2/ports.conf && \
  sed -i \"s/*:80>/*:\$PORT>/g\" /etc/apache2/sites-available/000-default.conf && \
  apache2-foreground"
