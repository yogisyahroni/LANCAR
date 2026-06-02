# Build stage — gunakan Node 22 LTS agar kompatibel dengan Vite 8, react-router 7, Tailwind v4
FROM node:22-alpine AS build
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

# Production stage — gunakan serve (static file server, sangat ringan)
FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve && \
    addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    mkdir -p /app/dist && \
    npm cache clean --force && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=build /app/dist ./dist
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3001
CMD ["serve", "-s", "dist", "-l", "3001"]
