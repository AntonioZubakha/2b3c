import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import proxy from '@fastify/http-proxy';
import jwt from '@fastify/jwt';
import auth from '@fastify/auth';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

type GatewayJwtUser = {
  id: string;
  role: string;
  /** Mongo ObjectId strings; present for supplier role after company model migration. */
  supplierCompanyIds?: string[];
};

const fastify = Fastify({ 
  logger: true,
  trustProxy: true // Important for rate limiting behind a reverse proxy
});

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

function parseBoundedInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 100_000);
}

/**
 * Read-heavy GETs (catalog / search / jewelry / recommendations) vs everything else,
 * so bots cannot exhaust the shared bucket and block checkout.
 * Legacy: if only STONEE_GATEWAY_RATE_LIMIT_MAX is set, it drives read cap; mutate = max(50, read/4).
 */
function resolveRateLimitCaps(): { read: number; mutate: number; webhook: number } {
  const readExplicit = process.env.STONEE_GATEWAY_RATE_LIMIT_READ_MAX?.trim();
  const mutateExplicit = process.env.STONEE_GATEWAY_RATE_LIMIT_MUTATE_MAX?.trim();
  const legacy = process.env.STONEE_GATEWAY_RATE_LIMIT_MAX?.trim();

  let read = parseBoundedInt(readExplicit, 1000);
  let mutate = parseBoundedInt(mutateExplicit, 150);
  const webhook = parseBoundedInt(process.env.STONEE_GATEWAY_RATE_LIMIT_WEBHOOK_MAX, 5000);

  if (!readExplicit && !mutateExplicit && legacy) {
    read = parseBoundedInt(legacy, 600);
    mutate = Math.max(50, Math.floor(read / 4));
  }

  return { read, mutate, webhook };
}

const rateLimitCaps = resolveRateLimitCaps();

function rateLimitMaxForRequest(request: FastifyRequest, _key: string): number {
  const path = request.url.split('?')[0];
  const method = request.method.toUpperCase();

  if (method === 'POST' && path.startsWith('/api/order/webhooks/stripe')) {
    return rateLimitCaps.webhook;
  }

  const isReadHeavyGet =
    method === 'GET' &&
    (path.startsWith('/api/search') ||
      path.startsWith('/api/catalog') ||
      path.startsWith('/api/jewelry') ||
      path.startsWith('/api/recommendations'));

  if (isReadHeavyGet) {
    return rateLimitCaps.read;
  }

  return rateLimitCaps.mutate;
}

/** CORS: set STONEE_CORS_ORIGINS=comma,separated,origins for production; omit for permissive dev. */
function resolveCorsOrigin(): boolean | string | string[] {
  const raw = process.env.STONEE_CORS_ORIGINS;
  if (!raw?.trim()) return true;
  const list = raw.split(',').map((o) => o.trim()).filter(Boolean);
  if (list.length === 0) return true;
  if (list.length === 1) return list[0];
  return list;
}

/**
 * PRODUCTION SECURITY SHIELD
 * 1. JWT Verification
 * 2. Rate Limiting
 * 3. CORS
 */

const start = async () => {
  try {
    // Register Security Plugins
    await fastify.register(cors, {
      origin: resolveCorsOrigin(),
      credentials: true
    });

    await fastify.register(jwt, {
      secret: JWT_SECRET
    });

    await fastify.register(auth);

    await fastify.register(rateLimit, {
      max: rateLimitMaxForRequest,
      timeWindow: '1 minute',
      /** Avoid req.ip when socket is missing (e.g. some Node fetch → localhost clients). */
      keyGenerator: (request: FastifyRequest) => {
        const xf = request.headers['x-forwarded-for'];
        if (typeof xf === 'string' && xf.trim()) {
          return xf.split(',')[0].trim();
        }
        const ra = request.socket?.remoteAddress;
        if (typeof ra === 'string' && ra.length > 0) return ra;
        return '127.0.0.1';
      },
    });

    // Auth Decorator
    fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Skip auth for specific public routes only (method + prefix).
        // Everything else requires a valid JWT.
        const method = request.method.toUpperCase();
        const url = request.url;

        const isPublic =
          // Gateway health
          (method === 'GET' && url === '/health') ||
          // Auth endpoints
          (method === 'POST' && (url.startsWith('/api/user/auth/login') || url.startsWith('/api/user/auth/register'))) ||
          // Public browsing
          (method === 'GET' &&
            (url.startsWith('/api/catalog') ||
              url.startsWith('/api/jewelry') ||
              url.startsWith('/api/search') ||
              url.startsWith('/api/recommendations') ||
              url.startsWith('/api/supplier/registry'))) ||
          // Service health endpoints
          (method === 'GET' && url.startsWith('/api/') && url.endsWith('/health')) ||
          // Stripe webhooks (raw body; verified in order-service)
          (method === 'POST' && url.startsWith('/api/order/webhooks/stripe')) ||
          // Guest cart operations (sessionId-based)
          (url.startsWith('/api/order/cart') && (method === 'GET' || method === 'POST' || method === 'DELETE'));
        
        if (isPublic) return;

        await request.jwtVerify();
        // Inject user identity into headers for microservices
        const user = request.user as GatewayJwtUser | undefined;
        if (!user?.id || !user?.role) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        request.headers['x-user-id'] = user.id;
        request.headers['x-user-role'] = user.role;

        if (user.role === 'supplier') {
          const ids = Array.isArray(user.supplierCompanyIds)
            ? user.supplierCompanyIds.map(String).filter(Boolean)
            : [];
          if (ids.length === 0) {
            return reply.code(403).send({
              error: 'Supplier account has no company; contact support or complete onboarding.',
            });
          }
          const fromClient = request.headers['x-supplier-company-id'];
          const headerStr =
            typeof fromClient === 'string' && fromClient.trim() ? fromClient.trim() : '';
          const chosen = headerStr && ids.includes(headerStr) ? headerStr : ids[0];
          request.headers['x-supplier-company-id'] = chosen;
        } else {
          delete request.headers['x-supplier-company-id'];
        }
      } catch (err) {
        // Do not leak internal error shapes to clients.
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    });

    // Health check (Public)
    fastify.get('/health', async () => ({ status: 'ok', service: 'api-gateway' }));

    // Proxy with Auth Middleware
    // We add the preHandler to the gateway globally or per-route
    fastify.addHook('preHandler', fastify.auth([fastify.authenticate]));

    // Microservice Proxies
    await fastify.register(proxy, {
      upstream: 'http://catalog-service:3000',
      prefix: '/api/catalog',
    });

    await fastify.register(proxy, {
      upstream: 'http://jewelry-service:3000',
      prefix: '/api/jewelry',
    });

    await fastify.register(proxy, {
      upstream: 'http://search-service:3000',
      prefix: '/api/search',
    });

    await fastify.register(proxy, {
      upstream: 'http://supplier-service:3000',
      prefix: '/api/supplier',
    });

    await fastify.register(proxy, {
      upstream: 'http://user-service:3000',
      prefix: '/api/user',
    });

    await fastify.register(proxy, {
      upstream: 'http://pricing-service:3000',
      prefix: '/api/pricing',
    });

    await fastify.register(proxy, {
      upstream: 'http://order-service:3000',
      prefix: '/api/order',
    });

    await fastify.register(proxy, {
      upstream: 'http://recommendation-service:3000',
      prefix: '/api/recommendations',
    });

    await fastify.register(proxy, {
      upstream: 'http://notification-service:3000',
      prefix: '/api/notifications',
    });

    await fastify.listen({ port: 8080, host: '0.0.0.0' });
    fastify.log.info('Secure Gateway :8080 — Shield Active');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Extend FastifyInstance type for the decorator
declare module 'fastify' {
  export interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

start();
