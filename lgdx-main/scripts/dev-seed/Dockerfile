FROM node:18-alpine

WORKDIR /app

COPY package.json ./
# Для маленького скрипта сидирования нам не критичен lockfile,
# поэтому используем обычный npm install вместо npm ci
RUN npm install --omit=dev

COPY seed.js ./

USER node

CMD ["node", "seed.js"]
