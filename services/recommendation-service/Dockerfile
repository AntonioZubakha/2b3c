FROM node:20-slim
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types ./packages/shared-types
COPY services/recommendation-service ./services/recommendation-service
RUN pnpm install --filter @stonee/recommendation-service
WORKDIR /app/services/recommendation-service
CMD ["npx", "tsx", "src/server.ts"]
