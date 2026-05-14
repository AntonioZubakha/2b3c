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

const basePath = path.join(__dirname, 'services');

if (!fs.existsSync(basePath)) {
  fs.mkdirSync(basePath, { recursive: true });
}

services.forEach(service => {
  const servicePath = path.join(basePath, service);
  fs.mkdirSync(path.join(servicePath, 'src/controllers'), { recursive: true });
  fs.mkdirSync(path.join(servicePath, 'src/services'), { recursive: true });
  fs.mkdirSync(path.join(servicePath, 'src/repositories'), { recursive: true });
  fs.mkdirSync(path.join(servicePath, 'src/dtos'), { recursive: true });
  
  const packageJson = {
    name: `@stonee/${service}`,
    version: "1.0.0",
    main: "src/server.ts",
    scripts: {
      "start": "ts-node src/server.ts",
      "dev": "nodemon src/server.ts"
    },
    dependencies: {
      "fastify": "^4.24.3"
    }
  };

  fs.writeFileSync(path.join(servicePath, 'package.json'), JSON.stringify(packageJson, null, 2));

  const serverTs = `import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get('/', async (request, reply) => {
  return { hello: 'from ${service}' };
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
`;
  fs.writeFileSync(path.join(servicePath, 'src/server.ts'), serverTs);
});

// Setup API Gateway
const gatewayPath = path.join(__dirname, 'apps', 'api-gateway');
fs.mkdirSync(path.join(gatewayPath, 'src'), { recursive: true });
const gatewayPackageJson = {
  name: `@stonee/api-gateway`,
  version: "1.0.0",
  main: "src/server.ts",
  scripts: {
    "start": "ts-node src/server.ts",
    "dev": "nodemon src/server.ts"
  },
  dependencies: {
    "fastify": "^4.24.3",
    "@fastify/http-proxy": "^9.2.1"
  }
};
fs.writeFileSync(path.join(gatewayPath, 'package.json'), JSON.stringify(gatewayPackageJson, null, 2));

const gatewayServerTs = `import Fastify from 'fastify';
import proxy from '@fastify/http-proxy';

const fastify = Fastify({ logger: true });

// Example proxy route to catalog service
fastify.register(proxy, {
  upstream: 'http://catalog-service:3000',
  prefix: '/api/catalog',
});

fastify.get('/', async (request, reply) => {
  return { status: 'Gateway is running' };
});

const start = async () => {
  try {
    await fastify.listen({ port: 8080, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
`;
fs.writeFileSync(path.join(gatewayPath, 'src/server.ts'), gatewayServerTs);
console.log("Scaffolding complete.");
