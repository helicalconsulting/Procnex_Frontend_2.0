# =============================================================================
# Heliflow Frontend — Production Dockerfile
# Pre-built static assets served via Nginx (Zero Node.js overhead on server)
# =============================================================================

FROM nginx:1.27-alpine AS production

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy pre-compiled static files (built on fast GitHub Actions runner)
COPY dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
