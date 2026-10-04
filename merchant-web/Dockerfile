# ─────────────────────────────────────────────
# MERCHANT WEB — Vite + React SPA (nginx)
# Akses lokal: http://localhost:3004
# Tunnel domain: https://merchant.bawain.my.id
# ─────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ARG MERCHANT_BUILD_ENV=production
ARG MERCHANT_EXPECTED_API_URL
ARG VITE_API_URL
ARG VITE_SOCKET_URL
ENV MERCHANT_BUILD_ENV=$MERCHANT_BUILD_ENV
ENV MERCHANT_EXPECTED_API_URL=$MERCHANT_EXPECTED_API_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
RUN npm run build

# Use the slim Alpine runtime to keep the static image small and reduce the
# OS package surface. Upgrade the base packages during the image build so the
# staging scan evaluates the latest security fixes available in the repo.
FROM nginx:1-alpine-slim
RUN apk upgrade --no-cache
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/security-headers.conf
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
