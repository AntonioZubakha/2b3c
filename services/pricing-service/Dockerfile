FROM node:20-slim
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types ./packages/shared-types
COPY services/pricing-service ./services/pricing-service
RUN pnpm install --filter @stonee/pricing-service
WORKDIR /app/services/pricing-service
CMD ["npx", "tsx", "src/server.ts"]
