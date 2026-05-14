FROM node:20-slim
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types ./packages/shared-types
COPY services/jewelry-service ./services/jewelry-service
RUN pnpm install
WORKDIR /app/services/jewelry-service
CMD ["npm", "run", "start"]
