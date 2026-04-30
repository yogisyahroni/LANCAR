# Multi-stage build for Node.js Admin Service
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy the rest of the code
COPY . .

# Build TypeScript
RUN npm run build

# Final stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the built files from the builder stage
COPY --from=builder /app/dist ./dist

# Expose port (adjust if needed)
EXPOSE 3000

# Command to run
CMD ["node", "dist/index.js"]
