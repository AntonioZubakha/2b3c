FROM node:20-slim
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types ./packages/shared-types
COPY services/catalog-service ./services/catalog-service
RUN pnpm install
WORKDIR /app/services/catalog-service
CMD ["npm", "run", "start"]
