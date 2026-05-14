const fs = require('fs');
const path = require('path');

const apps = ['api-gateway', 'frontend'];
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

const dockerignoreContent = `node_modules
dist
.env
.DS_Store
`;

// Add to apps
apps.forEach(app => {
  fs.writeFileSync(path.join(__dirname, 'apps', app, '.dockerignore'), dockerignoreContent);
});

// Add to services
services.forEach(service => {
  fs.writeFileSync(path.join(__dirname, 'services', service, '.dockerignore'), dockerignoreContent);
});

console.log('.dockerignore files generated');
