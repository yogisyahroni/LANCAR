# Build stage — gunakan Node 22 LTS agar kompatibel dengan Vite 8, react-router 7, Tailwind v4
FROM mirror.gcr.io/node:22-alpine AS build

# Security patch: upgrade all packages to get latest CVE fixes (CVE-2025-4544 libcrypto)
RUN apk upgrade --no-cache

WORKDIR /app

# Install deps dulu agar layer di-cache (tidak diulang jika source berubah tapi deps tidak)
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy source dan build
COPY . .
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_SOCKET_URL
ARG VITE_ALLOW_LOCALHOST_FALLBACK
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_ALLOW_LOCALHOST_FALLBACK=$VITE_ALLOW_LOCALHOST_FALLBACK
RUN npm run build

# Production stage — nginx alpine (no npm deps, no brace-expansion vuln)
FROM nginx:alpine

# Security patch: upgrade all packages to get latest CVE fixes
RUN apk upgrade --no-cache

# Remove default nginx config and copy our SPA config
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3001

CMD ["nginx", "-g", "daemon off;"]
