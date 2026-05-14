FROM node:20-slim
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types ./packages/shared-types
COPY apps/frontend ./apps/frontend
COPY scripts/docker-frontend-entrypoint.sh /usr/local/bin/docker-frontend-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-frontend-entrypoint.sh
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/frontend
EXPOSE 3000
ENTRYPOINT ["sh", "/usr/local/bin/docker-frontend-entrypoint.sh"]
