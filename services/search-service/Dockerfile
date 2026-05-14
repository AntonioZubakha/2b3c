FROM node:20-slim
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types ./packages/shared-types
COPY services/search-service ./services/search-service
RUN pnpm install --filter @stonee/search-service
WORKDIR /app/services/search-service
CMD ["npx", "tsx", "src/server.ts"]
