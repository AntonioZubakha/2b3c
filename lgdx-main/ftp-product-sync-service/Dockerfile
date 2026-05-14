# Use Node.js 18 Alpine for smaller image size and security
FROM node:18-alpine

# Install necessary system packages
RUN apk add --no-cache \
    curl \
    python3 \
    make \
    g++ \
    bash

# Set working directory
WORKDIR /app

# Copy package files first for better Docker layer caching
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
RUN npm prune --production && \
    rm -rf src/ tsconfig.json node_modules/.cache

# Create directories for FTP data with proper permissions
RUN mkdir -p /ftp-data /ftp-data/processed /ftp-data/failed && \
    chmod 755 /ftp-data

# Create non-root user for security (matching existing microservices)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S ftpuser -u 1001 -G nodejs

# Create isolated FTP root directory and move app files (as root)
RUN mkdir -p /ftp-isolated-root && \
    # Move node app to safe location
    mv /app /node-app && \
    # Create completely empty /app as FTP root
    mkdir -p /app && \
    # Ensure /app is completely empty
    rm -rf /app/*

# Change ownership to non-root user
RUN chown -R ftpuser:nodejs /node-app /ftp-data /app /ftp-isolated-root

# Switch to non-root user (Security hardening)
USER ftpuser

# Set working directory back to app for FTP server
WORKDIR /app

# Expose ports
# 21: FTP control port
# 10000-10100: FTP passive data ports
# 3000: Health check and metrics server
EXPOSE 21 3000
EXPOSE 10000-10100

# Health check against health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV HEALTH_PORT=3000
ENV FTP_PORT=21
ENV FTP_HOST=0.0.0.0
ENV FTP_PASV_PORT_MIN=10000
ENV FTP_PASV_PORT_MAX=10100
ENV FTP_DATA_PATH=/app

# Create volume mount points
VOLUME ["/app"]

# Command to run the application from the node-app directory
CMD ["node", "/node-app/dist/index.js"]
