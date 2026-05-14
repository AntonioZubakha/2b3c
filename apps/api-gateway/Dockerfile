FROM node:20-slim
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types ./packages/shared-types
COPY apps/api-gateway ./apps/api-gateway
RUN pnpm install
WORKDIR /app/apps/api-gateway
CMD ["npm", "run", "start"]
