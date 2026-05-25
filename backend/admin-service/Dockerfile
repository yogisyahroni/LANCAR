# ============================================================
# Admin Service — Multi-Stage Dockerfile (Hardened)
# Node.js / TypeScript
# ============================================================

# Stage 1: Builder
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency files first (cache layer)
COPY package*.json ./

# Install ALL deps (including devDeps for build)
RUN npm ci --ignore-scripts

# Copy source
COPY . .

# Build TypeScript → dist/
RUN npm run build

# Stage 2: Production
FROM node:22-alpine AS production

# Security: create non-root user
RUN addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    mkdir -p /app/public/uploads && chown -R appuser:appgroup /app

WORKDIR /app

# Copy only package files for production install
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Copy built dist from builder
COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R appuser:appgroup /app

# Run as non-root
USER appuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
