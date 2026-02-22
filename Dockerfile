# syntax=docker/dockerfile:1

FROM node:20-bookworm AS build
WORKDIR /app

# Install deps first for better layer caching
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .

# Builds the static site into /app/dist
RUN npm run build


FROM nginx:1.27-alpine

# SPA + sensible caching headers
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html/pwa-modeller

EXPOSE 80

# Basic healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/pwa-modeller/ >/dev/null 2>&1 || exit 1
