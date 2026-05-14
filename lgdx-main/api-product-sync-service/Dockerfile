# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Install curl
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy source code (excluding test files)
COPY src/ ./src/
RUN find ./src -name "*.test.ts" -delete && \
    find ./src -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null || true

# Build TypeScript to JavaScript
RUN npm run build

# Remove dev dependencies and source files to reduce image size
RUN npm prune --production && rm -rf src/ tsconfig.json

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S microservice -u 1001

# Change ownership to non-root user
RUN chown -R microservice:nodejs /app
USER microservice

# Expose metrics and health ports
EXPOSE 9100
EXPOSE 8080

# Liveness: metrics server /health always 200. Port 8080 /health is readiness (503 until Rabbit consumer ready).
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
  CMD curl -f http://localhost:9100/health || exit 1

# Command to run the application with memory optimization
CMD ["node", "--max-old-space-size=8192", "dist/index.js"] 