import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { register, login, selfVerifyKyc } from '../controllers/authController.js';
import { addCompanyMember } from '../controllers/companyMembersController.js';
import { getCompanyProfile, patchCompanyProfile } from '../controllers/companyProfileController.js';

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/register', register);
  fastify.post('/login', login);
  fastify.post('/kyc/self-verify', selfVerifyKyc);
  fastify.post('/companies/:companyId/members', addCompanyMember);
  fastify.get('/companies/:companyId', getCompanyProfile);
  fastify.patch('/companies/:companyId', patchCompanyProfile);
};

export default authRoutes;
