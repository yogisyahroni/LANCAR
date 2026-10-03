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
ARG VITE_API_URL=http://localhost:8080/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Use the slim Alpine runtime to keep the static image small and reduce the
# OS package surface. Upgrade the base packages during the image build so the
# staging scan evaluates the latest security fixes available in the repo.
FROM nginx:1-alpine-slim
RUN apk upgrade --no-cache
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
