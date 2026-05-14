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

# Install dependencies
RUN npm ci

# Copy source code (excluding test files)
COPY src/ ./src/
RUN find ./src -name "*.test.ts" -delete && \
    find ./src -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null || true

# Build TypeScript
RUN npm run build

# Remove dev dependencies and source files to reduce image size
RUN npm prune --production && rm -rf src/ tsconfig.json

# Create directories for file processing
RUN mkdir -p /app/uploads /app/processed /app/failed

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S microservice -u 1001

# Change ownership to non-root user
RUN chown -R microservice:nodejs /app
USER microservice

# Expose port (optional, mainly for documentation)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check: File Import Service is running')" || exit 1

# Start the service; memory is controlled by deployment env (e.g. NODE_OPTIONS)
CMD ["node", "dist/index.js"]
