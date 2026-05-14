const fs = require('fs');
const path = require('path');

const services = [
  'user-service',
  'catalog-service',
  'supplier-service',
  'search-service',
  'recommendation-service',
  'order-service',
  'notification-service',
  'pricing-service'
];

const backendDockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
# We use ts-node for this skeleton
CMD ["npm", "run", "start"]
`;

services.forEach(service => {
  const servicePath = path.join(__dirname, 'services', service);
  fs.writeFileSync(path.join(servicePath, 'Dockerfile'), backendDockerfile);
});

// API Gateway Dockerfile
fs.writeFileSync(path.join(__dirname, 'apps', 'api-gateway', 'Dockerfile'), backendDockerfile);

// Frontend Dockerfile
const frontendDockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev", "--", "--host"]
EXPOSE 3000
`;
fs.writeFileSync(path.join(__dirname, 'apps', 'frontend', 'Dockerfile'), frontendDockerfile);

console.log('Dockerfiles generated');
