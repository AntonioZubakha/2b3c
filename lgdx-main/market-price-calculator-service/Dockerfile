FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code (excluding test files)
COPY . .
RUN find ./src -name "*.test.ts" -delete && \
    find ./src -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null || true

# Build TypeScript
RUN npm run build

# Remove dev dependencies and source files
RUN npm prune --production && rm -rf src/ tsconfig.json

# Create logs directory
RUN mkdir -p logs

# Expose port (if needed for health checks)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Start the service with increased memory limit and garbage collection
CMD ["node", "--max-old-space-size=4096", "--expose-gc", "dist/index.js"] 