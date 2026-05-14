# Stage 1: Build the application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production runtime
FROM node:18-alpine

WORKDIR /app

# Install certbot, openssl, curl, docker-cli, coreutils (for timeout)
RUN apk add --no-cache \
    certbot \
    openssl \
    curl \
    docker-cli \
    bash \
    coreutils

# Create directories
RUN mkdir -p /app/logs \
    && mkdir -p /app/ssl-backups

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs \
    && adduser -S sslrenew -u 1001

# Change ownership
RUN chown -R sslrenew:nodejs /app

# Note: We need root access for certbot and docker commands
# So we'll run as root, but limit capabilities
USER root

# Health check
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "dist/index.js"]

