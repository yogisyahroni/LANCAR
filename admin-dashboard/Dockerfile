# Build stage — gunakan Node 22 LTS agar kompatibel dengan Vite 8, react-router 7, Tailwind v4
FROM node:22-alpine AS build

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

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Custom nginx config for SPA (all routes → index.html)
RUN cat > /etc/nginx/conf.d/app.conf << 'EOF'
server {
    listen 3001;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback — all routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # No caching for HTML
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
EOF

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Run as non-root
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

EXPOSE 3001

CMD ["nginx", "-g", "daemon off;"]
