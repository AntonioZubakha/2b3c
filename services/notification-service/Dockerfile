FROM node:20-slim
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types ./packages/shared-types
COPY services/notification-service ./services/notification-service
RUN pnpm install
WORKDIR /app/services/notification-service
CMD ["npm", "run", "start"]
