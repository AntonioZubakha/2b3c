import express, { Router, RequestHandler } from 'express';
import * as companyController from '../controllers/companyController';
import { authMiddleware } from '../middleware/auth';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { validate } from '../middleware/validation';
import rateLimit from 'express-rate-limit';
import { asyncHandler, asRateLimiter } from '../types/express-helpers';
import { 
    UpdateCompanyInfoSchema,
    AddUserToCompanySchema,
    UpdateCompanyUserSchema,
    CompanyFilterSchema,
    ApproveCompanySchema,
    RejectCompanySchema,
    InviteMemberSchema,
  InvitationIdParamsSchema,
  AcceptInvitationSchema
} from '../validation/schemas/companySchemas';
import { ObjectIdSchema } from '../validation/baseSchemas';
import { z } from 'zod';

// Parameter schemas for company routes
const UserIdParamsSchema = z.object({
    userId: ObjectIdSchema
});

const CompanyIdParamsSchema = z.object({
    companyId: ObjectIdSchema
});

const CompanyIdOrProfileParamsSchema = z.object({
    id: z.union([ObjectIdSchema, z.literal('profile')])
});

// Role change schema (admin only assignable by full admins)
const ChangeUserRoleSchema = z.object({
    role: z.enum(['admin', 'supervisor', 'manager', 'logist'])
});

// Optional schemas for admin endpoints - body content is optional but body object is required
const ApproveCompanyBodySchema = z.object({
    notes: z.string().optional(),
    approveUsers: z.boolean().default(true),
    notifyUsers: z.boolean().default(true)
});

const RejectCompanyBodySchema = z.object({
    reason: z.string().optional(),
    notes: z.string().optional(),
    notifyUsers: z.boolean().default(true)
});

const router: Router = express.Router();

// Apply modest rate limit for logo uploads to reduce abuse
const logoUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// @route   GET api/company/users
// @desc    Get all users in company
// @access  Private
router.get('/users', authMiddleware, asyncHandler(companyController.getCompanyUsers));

// Invitations rate limits
const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
});
const inviteResendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
});

// @route   POST api/company/invite
// @desc    Invite member by email (supervisor only)
// @access  Private
router.post('/invite', 
  authMiddleware,
  asRateLimiter(inviteLimiter),
  validate({ body: InviteMemberSchema }),
  asyncHandler(companyController.inviteMember)
);

// @route   POST api/company/invitations/:id/revoke
// @desc    Revoke invitation (supervisor only)
// @access  Private
router.post('/invitations/:id/revoke', 
  authMiddleware,
  validate({ params: InvitationIdParamsSchema }),
  asyncHandler(companyController.revokeInvitation)
);

// @route   POST api/company/invitations/:id/resend
// @desc    Resend invitation (supervisor only)
// @access  Private
router.post('/invitations/:id/resend', 
  authMiddleware,
  asRateLimiter(inviteResendLimiter),
  validate({ params: InvitationIdParamsSchema }),
  asyncHandler(companyController.resendInvitation)
);

// @route   POST api/company/invitations/accept
// @desc    Accept invitation by token and set password
// @access  Public
router.post('/invitations/accept',
  validate({ body: AcceptInvitationSchema }),
  asyncHandler(companyController.acceptInvitation)
);

// @route   PUT api/company/users/:userId/activate
// @desc    Activate user
// @access  Private (supervisor only)
router.put('/users/:userId/activate', 
    authMiddleware,
    validate({ params: UserIdParamsSchema }),
    asyncHandler(companyController.activateUser)
);

// @route   PUT api/company/users/:userId/role
// @desc    Change user role
// @access  Private (supervisor only)
router.put('/users/:userId/role', 
    authMiddleware,
    validate({ 
        params: UserIdParamsSchema,
        body: ChangeUserRoleSchema 
    }),
    asyncHandler(companyController.changeUserRole)
);

// @route   DELETE api/company/users/:userId
// @desc    Remove user from company
// @access  Private (supervisor only)
router.delete('/users/:userId',
    authMiddleware,
    validate({ params: UserIdParamsSchema }),
    asyncHandler(companyController.removeUserFromCompany)
);

// @route   GET api/company/profile
// @desc    Get company information
// @access  Private
router.get('/profile', authMiddleware, asyncHandler(companyController.getCompanyInfo));

// @route   PUT api/company/profile
// @desc    Update company information
// @access  Private (supervisor only)
router.put('/profile', 
    authMiddleware,
    validate({ body: UpdateCompanyInfoSchema }),
    asyncHandler(companyController.updateCompanyInfo)
);

// @route   POST api/company/logo
// @desc    Upload company logo
// @access  Private (supervisor only)
router.post('/logo', 
    authMiddleware,
    asRateLimiter(logoUploadLimiter),
    companyController.multerUploadLogo, 
    asyncHandler(companyController.uploadLogo)
);

// ADMIN ROUTES FOR COMPANY MANAGEMENT

// @route   GET /api/company
// @desc    Get all companies (admin)
// @access  Private (Admin)
router.get('/', adminAuthMiddleware, asyncHandler(companyController.getAllCompanies));

// @route   GET /api/company/onboarding-requests
// @desc    Get companies pending review (admin)
// @access  Private (Admin)
router.get('/onboarding-requests', adminAuthMiddleware, asyncHandler(companyController.getOnboardingRequests));

// @route   PUT /api/company/:companyId/approve
// @desc    Approve a company (admin)
// @access  Private (Admin)
router.put('/:companyId/approve', 
    adminAuthMiddleware,
    validate({ 
        params: CompanyIdParamsSchema,
        body: ApproveCompanyBodySchema 
    }),
    asyncHandler(companyController.approveCompany)
);

// @route   PUT /api/company/:companyId/reject
// @desc    Reject a company (admin)
// @access  Private (Admin)
router.put('/:companyId/reject', 
    adminAuthMiddleware,
    validate({ 
        params: CompanyIdParamsSchema,
        body: RejectCompanyBodySchema 
    }),
    asyncHandler(companyController.rejectCompany)
);

// @route   GET /api/company/:id
// @desc    Get single company by ID (admin or user of that company)
// @access  Private (Admin)
// This route must be last among GET routes with similar path structure
router.get('/:id', 
    adminAuthMiddleware,
    validate({ params: CompanyIdOrProfileParamsSchema }),
    asyncHandler(companyController.getCompany)
);

// COMPANY ROLES MANAGEMENT ROUTES

// @route   GET /api/company/roles
// @desc    Get company roles (for current user's company)
// @access  Private
router.get('/roles', authMiddleware, asyncHandler(companyController.getCompanyRoles));

// @route   PUT /api/company/:companyId/roles
// @desc    Update company roles (admin only)
// @access  Private (Admin)
router.put('/:companyId/roles', 
    adminAuthMiddleware,
    validate({ 
        params: CompanyIdParamsSchema,
        body: z.object({
            roles: z.array(z.enum(['seller', 'buyer', 'both']))
        })
    }),
    asyncHandler(companyController.updateCompanyRoles)
);

export default router; 