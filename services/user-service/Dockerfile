FROM node:20-slim
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types ./packages/shared-types
COPY services/user-service ./services/user-service
RUN pnpm install --filter @stonee/user-service
WORKDIR /app/services/user-service
CMD ["pnpm", "exec", "tsx", "src/server.ts"]
