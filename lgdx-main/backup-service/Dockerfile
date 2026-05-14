# Stage 1: Build the application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code (excluding test files)
COPY . .
RUN find ./src -name "*.test.ts" -delete && \
    find ./src -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null || true

# Build the application
RUN npm run build

# Stage 2: Production runtime
FROM node:18-alpine

WORKDIR /app

# Install MongoDB tools for backup/restore
RUN apk add --no-cache mongodb-tools

# Create backup directories
RUN mkdir -p /app/backups/mongodb/daily \
    && mkdir -p /app/backups/mongodb/weekly \
    && mkdir -p /app/backups/mongodb/monthly \
    && mkdir -p /app/logs

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs \
    && adduser -S backup -u 1001

# Change ownership of backup directories
RUN chown -R backup:nodejs /app/backups \
    && chown -R backup:nodejs /app/logs \
    && chown -R backup:nodejs /app

# Switch to non-root user
USER backup

# Expose port for health checks
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node dist/health-check.js

# Start the application
CMD ["node", "dist/index.js"] 