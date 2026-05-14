# Build with context ./server: docker build -t lgdx-lgdx-server:latest ./server
# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and patches (postinstall = patch-package needs patches/ before npm ci)
COPY package*.json ./
COPY patches ./patches
RUN npm ci

# Copy the rest of the application source code (includes support-ai-docs for Chat AI)
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Drop devDependencies for the runtime image (patch-package already ran in npm ci postinstall)
RUN npm prune --omit=dev

# Stage 2: Production
FROM node:18-alpine

# curl: healthchecks; su-exec: drop root → appuser after fixing Baileys volume ownership
RUN apk add --no-cache curl su-exec

WORKDIR /app

# Copy only necessary files from the builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/patches ./patches
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/support-ai-docs ./support-ai-docs
COPY --from=builder /app/whatsapp-ai-docs ./whatsapp-ai-docs

# Reuse pruned node_modules from builder — a second `npm ci --omit=dev` here can yield an incomplete tree on Alpine (e.g. broken express).
COPY --from=builder /app/node_modules ./node_modules

COPY scripts/docker-entrypoint-baileys.sh /usr/local/bin/docker-entrypoint-baileys.sh
RUN chmod +x /usr/local/bin/docker-entrypoint-baileys.sh

COPY scripts/docker-entrypoint-server.sh /usr/local/bin/docker-entrypoint-server.sh
# Strip Windows CRLF so ash/sh does not see `\r` in `[` tests or `fi` (Swarm/Linux).
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint-server.sh \
    && chmod +x /usr/local/bin/docker-entrypoint-server.sh

# Create non-root user; image keeps root as default for dev/local, but compose in prod runs as 1001
RUN addgroup -g 1001 -S nodejs \
    && adduser -S appuser -u 1001 \
    && chown -R appuser:nodejs /app

# Expose the port the app runs on
EXPOSE 5000

# Chown bind-mounted uploads when started as root, then run Node as UID 1001 (/bin/sh avoids broken shebang if CRLF slipped in)
ENTRYPOINT ["/bin/sh", "/usr/local/bin/docker-entrypoint-server.sh"]
CMD ["node", "dist/index.js"]
