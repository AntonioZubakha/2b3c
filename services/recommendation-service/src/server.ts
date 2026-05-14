import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import axios from 'axios';

const fastify: FastifyInstance = Fastify({ logger: true });

const JEWELRY_SERVICE_URL = process.env.JEWELRY_SERVICE_URL || 'http://jewelry-service:3000';

const http = axios.create({ timeout: 10_000 });

const healthPayload = () => ({ status: 'ok', service: 'recommendation-service' });
/** Called via gateway as `GET /api/recommendations/health` (prefix stripped → `/health`). */
fastify.get('/health', async () => healthPayload());
/** Legacy path if something calls the service container directly with full prefix. */
fastify.get('/api/recommendations/health', async () => healthPayload());

// Paths after api-gateway proxy prefix `/api/recommendations` are stripped → `/match/:sku`, `/trending`, `/health`.
fastify.get<{ Params: { sku: string } }>('/match/:sku', async (request: FastifyRequest<{ Params: { sku: string } }>, reply: FastifyReply) => {
  try {
    const { sku } = request.params;
    
    // 1. Get the profile of the item we are matching
    let style = 'Solitaire'; // Default fallback
    
    // Fetch setting or jewelry details to find style
    try {
      const res = await http.get(`${JEWELRY_SERVICE_URL}/settings`);
      const settings = res.data.data;
      const target = settings.find((s: any) => s.sku === sku);
      if (target) style = target.style;
    } catch (err) {
      fastify.log.warn(`Failed to find style for SKU: ${sku}, using default.`);
    }

    // 2. Fetch items that match that style
    const res = await http.get(`${JEWELRY_SERVICE_URL}/collections`);
    const allJewelry = res.data.data;
    
    const matching = allJewelry.filter((j: any) => 
      j.title.toLowerCase().includes(style.toLowerCase()) || 
      j.description.toLowerCase().includes(style.toLowerCase())
    );

    return { 
      success: true, 
      style,
      data: matching.length > 0 ? matching : allJewelry.slice(0, 3) // Fallback to first 3
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Recommendation failed' });
  }
});

fastify.get('/trending', async () => {
    return { success: true, data: [] }; 
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
