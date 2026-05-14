FROM node:20-slim
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types ./packages/shared-types
COPY services/supplier-service ./services/supplier-service
RUN pnpm install
WORKDIR /app/services/supplier-service
CMD ["npm", "run", "start"]
