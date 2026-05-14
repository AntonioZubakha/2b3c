FROM node:20-slim
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types ./packages/shared-types
COPY services/order-service ./services/order-service
RUN pnpm install
WORKDIR /app/services/order-service
CMD ["npm", "run", "start"]
