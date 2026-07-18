# =============================================================================
# Heliflow Frontend — Dockerfile
# Multi-stage build: install → build static files → serve via Nginx
# =============================================================================

# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# ── Stage 2: Build static assets ──────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
COPY --from=deps /app/node_modules ./node_modules

# VITE_API_URL is injected at build time — default to relative path so Nginx
# proxy works seamlessly (e.g. /api → backend container)
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

# Copy source files (index.html is Vite's entry point — required!)
# No public/ directory in this project — Vite uses root-level index.html
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts eslint.config.js index.html ./
COPY src ./src

# Build static output to dist/
RUN npm run build

# ── Stage 3: Production Nginx server ──────────────────────────────────────────
FROM nginx:1.27-alpine AS production

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
