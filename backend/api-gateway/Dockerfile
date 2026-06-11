# Build stage
FROM node:22-alpine AS builder

# Security patch: upgrade all packages to get latest CVE fixes (CVE-2025-4544 libcrypto)
RUN apk upgrade --no-cache

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine

# Security patch: upgrade all packages to get latest CVE fixes (CVE-2025-4544 libcrypto)
RUN apk upgrade --no-cache

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=builder /app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/index.js"]
