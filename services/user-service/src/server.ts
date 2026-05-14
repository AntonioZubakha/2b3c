
import Fastify from 'fastify';
import mongoose from 'mongoose';
import authRoutes from './routes/authRoutes.js';
import User from './models/User.js';
import { listSupplierCompanySummaries } from './services/supplierCompanyService.js';

const fastify = Fastify({ logger: true });

fastify.register(authRoutes, { prefix: '/auth' });

fastify.get('/health', async () => ({ status: 'ok', service: 'user-service' }));

const INTERNAL = process.env.STONEE_INTERNAL_SECRET || '';

fastify.get<{ Params: { userId: string } }>('/internal/kyc/:userId', async (request, reply) => {
  if (!INTERNAL || request.headers['x-stonee-internal'] !== INTERNAL) {
    return reply.status(403).send({ error: 'Forbidden' });
  }
  const user = await User.findById(request.params.userId).select('role kycStatus');
  if (!user) return reply.status(404).send({ error: 'User not found' });
  return {
    role: user.role,
    kycStatus: user.kycStatus ?? 'not_required',
  };
});

fastify.get('/auth/me', async (request, reply) => {
  const userId = request.headers['x-user-id'];
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const user = await User.findById(userId).select('-passwordHash');
  if (!user) return reply.status(404).send({ error: 'User not found' });

  const payload = JSON.parse(JSON.stringify(user.toObject({ virtuals: false }))) as Record<string, unknown>;
  if (user.role === 'supplier') {
    const supplierCompanies = await listSupplierCompanySummaries(user._id);
    return { success: true, user: { ...payload, supplierCompanies } };
  }
  return { success: true, user: payload };
});

fastify.get('/', async (request, reply) => {
  return { hello: 'from user-service' };
});

const start = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://mongodb:27017/stonee_users';
    await mongoose.connect(mongoUri);
    fastify.log.info('Connected to MongoDB');
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
