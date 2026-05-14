import { Request, Response, NextFunction } from 'express';
import mongoose, { ObjectId } from 'mongoose';
import crypto from 'crypto';
import User, { IUserDocument /*, UserRole */ } from '../models/User'; 
import Company, { ICompanyDocument /*, CompanyStatus, CompanyDetails */ } from '../models/Company';
import { CompanyRole } from '../types';
import Invitation from '../models/Invitation';
import { emailService } from '../services/emailService';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ParsedQs } from 'qs'; // Import ParsedQs
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';
import marketplaceConfig from '../config/marketplace';
import {
  CompanyDetails,
  UpdateCompanyInfo,
  AddUserToCompany,
  UpdateCompanyUser,
  CompanyFilter,
  ApproveCompany,
  RejectCompany
} from '../validation/schemas/companySchemas';

// Assuming JwtPayload and AuthenticatedRequest might be in a shared types file
// If not, define or import them. For now, let's assume they are available from authController or a global types file.
// import { AuthenticatedRequest, JwtPayload } from './authController'; // or from '../types';

// Re-define if not globally available, or import from a central types file
export interface JwtPayload {
  userId: string;
  role: string; // TODO: Change to UserRole when available
  isLgdealSupervisor?: boolean;
  isImpersonation?: boolean;
  company?: string; // companyId might be in the token as per getCompanyUsers logic
}

/**
 * AuthenticatedRequest - generic type alias для Express.Request
 * 
 * Express.Request уже глобально расширен в types/index.ts с полем user
 * Этот тип существует для обратной совместимости и добавляет generic параметры
 */
export type AuthenticatedRequest<
    P = Record<string, string>,
    ResBody = any, 
    ReqBody = any, 
    ReqQuery = ParsedQs,
    Locals extends Record<string, any> = Record<string, any>
> = Request<P, ResBody, ReqBody, ReqQuery, Locals>;

// ---- Request Param Interfaces ----
interface CompanyIdParams {
  companyId: string;
}

interface UserIdParams {
  userId: string;
}

interface GetCompanyParams {
  id: string;
}

// ---- Request Body Interfaces ----
interface ChangeUserRoleBody {
  role: 'admin' | 'supervisor' | 'manager' | 'logist';
}

// UpdateCompanyInfoBody removed - now using UpdateCompanyInfo from Zod schemas

// ---- Shared Error Response Interface ----
interface ErrorResponse {
  message: string;
}

// ---- Response Interfaces ----
// Represents a user within a company context, especially after population
interface PopulatedCompanyUser {
    _id: mongoose.Types.ObjectId | string;
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: string; // TODO: UserRole
    isActive?: boolean;
    invitationId?: string; // Optional invitation ID
}
interface CompanyUserEntry {
    user: PopulatedCompanyUser | mongoose.Types.ObjectId | string | null; // Can be populated or just an ID
    role: string; // TODO: UserRole
    isActive: boolean;
    _id?: mongoose.Types.ObjectId | string; // Subdocument ID
}

interface GetCompanyUsersResponse {
  companyName?: string; 
  users?: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    isActive: boolean;
    status?: string;
    invitationId?: string;
  }>; // Flattened user structure for client
  message?: string;
}

interface ActivateUserResponse {
  message: string;
  user?: {
    id: string; // Changed to string for consistency
    email?: string;
    firstName?: string;
    lastName?: string;
    isActive?: boolean;
  };
}

interface ChangeUserRoleResponse {
  message: string;
  user?: {
    id: string; // Changed to string
    email?: string;
    firstName?: string;
    lastName?: string;
    role?: string; // TODO: UserRole
  };
}

interface CompanyInfoResponse {
  id: string; // Changed to string
  name: string;
  description?: string;
  details?: ICompanyDocument['details']; // Use the type from ICompanyDocument
  /** seller | buyer | both — must match DB; used by My Company settings UI */
  roles?: CompanyRole[];
  paymentSettings?: ICompanyDocument['paymentSettings'];
  message?: string; 
}

interface UploadLogoResponse {
  message: string;
  logo?: {
    url: string;
    filename: string;
  };
}

// For getAllCompanies, getOnboardingRequests, approveCompany, rejectCompany, getCompany
// The response is often the company document or an array of them, or a message.
// We can use ICompanyDocument directly or a simplified version if needed.
interface CompanyResponse {
    message?: string;
    company?: ICompanyDocument; 
}

interface CompaniesResponse {
    companies?: ICompanyDocument[];
    message?: string;
}

interface IUser {
  _id: mongoose.Types.ObjectId | string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  isActive?: boolean;
  company?: mongoose.Types.ObjectId | string | ICompany;
}

interface ICompany {
  _id: mongoose.Types.ObjectId | string;
  name: string;
  description?: string;
  details?: Record<string, unknown>;
  users?: Array<{ 
    user: mongoose.Types.ObjectId | string | IUser; 
    role: string; 
    isActive: boolean;
    _id?: mongoose.Types.ObjectId | string;
  }>;
}

export const getCompanyUsers = async (req: AuthenticatedRequest, res: Response<GetCompanyUsersResponse | ErrorResponse>) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    logger.info(`[getCompanyUsers] Getting company users for user ID: ${userId}`);

    // If impersonation token already has company field
    let effectiveCompanyId = req.user?.company;

    if (!effectiveCompanyId) {
      const currentUser = await User.findById(userId);
      if (!currentUser) {
        return res.status(404).json({ message: 'Current user not found' });
      }
      
      if (currentUser.company) {
        if (typeof currentUser.company === 'object' && currentUser.company !== null && '_id' in currentUser.company) {
          // If it's a populated document with _id
          effectiveCompanyId = (currentUser.company as ICompany)._id.toString();
        } else {
          // If it's an ObjectId reference
          effectiveCompanyId = String(currentUser.company);
        }
      }
      logger.debug(`[getCompanyUsers] Loaded company ID from user document: ${effectiveCompanyId}`);
    } else {
      logger.debug(`[getCompanyUsers] Using company ID from token: ${effectiveCompanyId}`);
    }

    if (!effectiveCompanyId) {
      return res.status(400).json({ message: 'User is not associated with any company' });
    }

    // Find the company with the effective ID
    const company = await Company.findById(effectiveCompanyId)
      .populate('users.user', 'firstName lastName email role isActive');

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Process and flatten user data to match client-side User type
    const flattenedUsers = company.users ? company.users.map((companyUser: CompanyUserEntry) => {
      if (!companyUser.user || typeof companyUser.user !== 'object') {
        // Skip if user is not populated or invalid
        return null;
      }
      
      const userDetails = companyUser.user as PopulatedCompanyUser;
      
      return {
        id: userDetails._id.toString(),
        firstName: userDetails.firstName || '',
        lastName: userDetails.lastName || '',
        email: userDetails.email || '',
        role: companyUser.role, // Use the role from the company's user list, it's more authoritative here
        isActive: companyUser.isActive,
        status: companyUser.isActive ? 'Active' : 'Inactive',
        // The client expects 'status' field, so we map isActive to it.
        // The 'Pending' status is related to invitations which are handled separately.
        invitationId: userDetails.invitationId, // Pass along if present
      };
    }).filter((user): user is NonNullable<typeof user> => user !== null) : [];

    return res.json({
      companyName: company.name,
      users: flattenedUsers
    });
  } catch (error: unknown) {
    logger.error('[getCompanyUsers] Error:', { error });
    return res.status(500).json({ message: `Server error: ${getErrorMessage(error)}` });
  }
};

// ---- Invitations ----

export const inviteMember = async (req: AuthenticatedRequest<any, any, { email: string }>, res: Response) => {
  try {
    const supervisorId = req.user?.userId;
    if (!supervisorId) return res.status(401).json({ message: 'Not authenticated' });

    const supervisor = await User.findById(supervisorId);
    if (!supervisor || (supervisor.role !== 'supervisor' && supervisor.role !== 'admin')) {
      return res.status(403).json({ message: 'Only supervisors or admins can invite members' });
    }

    const companyId = supervisor.company?.toString();
    if (!companyId) return res.status(400).json({ message: 'No company associated' });

    const email = (req.body.email || '').toLowerCase().trim();

    // Basic deny-list by domain
    const deniedDomains = (process.env.INVITE_DENY_DOMAINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const domain = email.split('@')[1] || '';
    if (domain && deniedDomains.includes(domain)) {
      return res.status(400).json({ message: 'Invitations to this domain are not allowed' });
    }

    // If user already exists, attach to company if not present
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // Link user to company if not already linked
      const alreadyInCompany = existingUser.company?.toString() === companyId;
      if (!alreadyInCompany) {
        existingUser.company = supervisor.company as mongoose.Types.ObjectId;
        existingUser.role = 'manager';
        existingUser.isActive = true;
        await existingUser.save();

        const company = await Company.findById(companyId);
        if (company) {
          if (!company.users) {
            company.users = [];
          }
          company.users.push({ user: existingUser._id, role: 'manager', isActive: true });
          await company.save();
        }
      }
      return res.status(200).json({ message: 'Existing user linked to company' });
    }

    // Create or reuse pending invitation
    let invitation = await Invitation.findOne({ email, company: companyId });
    if (!invitation) {
      invitation = new Invitation({ email, company: companyId, status: 'pending' });
    } else if (invitation.status === 'revoked') {
      invitation.status = 'pending';
      invitation.sendCount = 0;
      invitation.lastSentAt = null;
    }

    // Rate limit per email (server-side logic in addition to route limiter)
    const now = new Date();
    if (invitation.lastSentAt && now.getTime() - invitation.lastSentAt.getTime() < 60 * 1000) {
      return res.status(429).json({ message: 'Please wait before sending another invitation to this email' });
    }

    // Generate token (for future acceptance flow)
    invitation.token = crypto.randomBytes(24).toString('hex');
    invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    invitation.status = 'sent';
    invitation.lastSentAt = now;
    invitation.sendCount = (invitation.sendCount || 0) + 1;
    await invitation.save();

    // Attempt to send email if email service is enabled; otherwise we still respond 200
    try {
      await emailService.sendInvitationEmail({
        to: email,
        companyName: (await Company.findById(companyId).select('name').lean())?.name || 'LGDeal INC',
        inviterName: supervisor.firstName ? `${supervisor.firstName} ${supervisor.lastName || ''}`.trim() : undefined,
        token: invitation.token!
      });
      logger.info('[inviteMember] Invitation email queued/sent', { email, companyId });
    } catch (e) {
      logger.warn('[inviteMember] Email send failed (continuing)', { error: e });
    }

    return res.status(200).json({ message: 'Invitation sent successfully' });
  } catch (error: unknown) {
    logger.error('[inviteMember] Error', { error });
    return res.status(500).json({ message: getErrorMessage(error, 'Server error') });
  }
};

export const revokeInvitation = async (req: AuthenticatedRequest<{ id: string }>, res: Response) => {
  try {
    const supervisorId = req.user?.userId;
    if (!supervisorId) return res.status(401).json({ message: 'Not authenticated' });

    const supervisor = await User.findById(supervisorId);
    if (!supervisor || (supervisor.role !== 'supervisor' && supervisor.role !== 'admin')) {
      return res.status(403).json({ message: 'Only supervisors or admins can revoke invitations' });
    }

    const invitation = await Invitation.findById(req.params.id);
    if (!invitation) return res.status(404).json({ message: 'Invitation not found' });

    const companyId = supervisor.company?.toString();
    if (!companyId || invitation.company.toString() !== companyId) {
      return res.status(403).json({ message: 'Invitation does not belong to your company' });
    }

    invitation.status = 'revoked';
    await invitation.save();
    return res.status(200).json({ message: 'Invitation revoked' });
  } catch (error: unknown) {
    logger.error('[revokeInvitation] Error', { error });
    return res.status(500).json({ message: getErrorMessage(error, 'Server error') });
  }
};

export const resendInvitation = async (req: AuthenticatedRequest<{ id: string }>, res: Response) => {
  try {
    const supervisorId = req.user?.userId;
    if (!supervisorId) return res.status(401).json({ message: 'Not authenticated' });

    const supervisor = await User.findById(supervisorId);
    if (!supervisor || (supervisor.role !== 'supervisor' && supervisor.role !== 'admin')) {
      return res.status(403).json({ message: 'Only supervisors or admins can resend invitations' });
    }

    const invitation = await Invitation.findById(req.params.id);
    if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
    const companyId = supervisor.company?.toString();
    if (!companyId || invitation.company.toString() !== companyId) {
      return res.status(403).json({ message: 'Invitation does not belong to your company' });
    }

    const now = new Date();
    if (invitation.lastSentAt && now.getTime() - invitation.lastSentAt.getTime() < 60 * 1000) {
      return res.status(429).json({ message: 'Please wait before resending' });
    }

    // Resend with same token
    invitation.status = 'sent';
    invitation.lastSentAt = now;
    invitation.sendCount = (invitation.sendCount || 0) + 1;
    await invitation.save();

    try {
      await emailService.sendInvitationEmail({
        to: invitation.email,
        companyName: (await Company.findById(invitation.company).select('name').lean())?.name || 'LGDeal INC',
        inviterName: supervisor.firstName ? `${supervisor.firstName} ${supervisor.lastName || ''}`.trim() : undefined,
        token: invitation.token || ''
      });
    } catch (e) {
      logger.warn('[resendInvitation] Email send failed (continuing)', { error: e });
    }

    logger.info('[resendInvitation] Resent', { id: invitation._id.toString() });
    return res.status(200).json({ message: 'Invitation resent successfully' });
  } catch (error: unknown) {
    logger.error('[resendInvitation] Error', { error });
    return res.status(500).json({ message: getErrorMessage(error, 'Server error') });
  }
};

export const acceptInvitation = async (
  req: AuthenticatedRequest<any, any, { token: string; password: string; firstName: string; lastName: string; phone: string }>,
  res: Response
) => {
  try {
    const { token, password, firstName, lastName, phone } = req.body;
    const invitation = await Invitation.findOne({ token, status: { $in: ['pending', 'sent'] }, $or: [ { expiresAt: null }, { expiresAt: { $gt: new Date() } } ] });
    if (!invitation) return res.status(400).json({ message: 'Invalid or expired invitation token' });

    const existingUser = await User.findOne({ email: invitation.email });
    if (existingUser) return res.status(400).json({ message: 'User with this email already exists' });

    const company = await Company.findById(invitation.company);
    if (!company) return res.status(400).json({ message: 'Company not found for invitation' });

    // Basic password validation (server already has validator in service; keep light here)
    if (!password || password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const hashed = await bcrypt.hash(password, 12);
    const newUser = new User({
      email: invitation.email,
      password: hashed,
      firstName,
      lastName,
      phone,
      company: company._id,
      role: 'manager',
      isActive: true,
      emailVerified: true,
      phoneVerified: false
    });
    await newUser.save();

    if (!company.users) {
      company.users = [];
    }
    company.users.push({ user: newUser._id, role: 'manager', isActive: true });
    await company.save();

    invitation.status = 'accepted';
    await invitation.save();

    return res.status(200).json({ message: 'Invitation accepted. Account created.' });
  } catch (error: unknown) {
    logger.error('[acceptInvitation] Error', { error });
    return res.status(500).json({ message: getErrorMessage(error, 'Server error') });
  }
};

export const removeUserFromCompany = async (req: AuthenticatedRequest<UserIdParams, any, any, any>, res: Response) => {
  try {
    const { userId: userIdToRemove } = req.params;
    const currentUserIdFromToken = req.user?.userId;

    if (!currentUserIdFromToken) {
      return res.status(401).json({ message: 'Current user not authenticated' });
    }

    const currentUser = await User.findById(currentUserIdFromToken);
    if (!currentUser || (currentUser.role !== 'supervisor' && currentUser.role !== 'admin')) {
      return res.status(403).json({ message: 'Only supervisors or admins can remove users' });
    }

    const companyId = currentUser.company?.toString();
    if (!companyId) {
      return res.status(400).json({ message: 'User is not associated with any company' });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Check if user to remove exists
    const userToRemove = await User.findById(userIdToRemove);
    if (!userToRemove) {
      return res.status(404).json({ message: 'User to remove not found' });
    }
    
    // Prevent supervisor from removing themselves
    if (userIdToRemove === currentUserIdFromToken) {
        return res.status(400).json({ message: 'Supervisors cannot remove themselves' });
    }

    // Check if we are attempting to remove the last supervisor
    const userInCompany = company.users?.find(u => u.user?.toString() === userIdToRemove);
    if (userInCompany && userInCompany.role === 'supervisor' && company.users) {
        const supervisorCount = company.users.filter(u => u.role === 'supervisor' && u.isActive).length;
        if (supervisorCount <= 1) {
            return res.status(400).json({ message: 'Cannot remove the last active supervisor from the company.' });
        }
    }

    const initialUserCount = company.users?.length || 0;
    if (company.users) {
        company.users = company.users.filter(u => u.user?.toString() !== userIdToRemove);
    }
    
    // Also update the user document to unlink from company
    userToRemove.company = null as unknown as mongoose.Types.ObjectId; // Unlink from company
    
    if (company.users?.length === initialUserCount) {
        return res.status(404).json({ message: 'User not found in this company' });
    }

    await company.save();
    await userToRemove.save();

    return res.status(200).json({ message: 'User removed from company successfully' });

  } catch (error: unknown) {
    logger.error('Error removing user from company:', { error });
    return res.status(500).json({ message: getErrorMessage(error, 'Server error') });
  }
};

export const activateUser = async (req: AuthenticatedRequest<UserIdParams, ActivateUserResponse | ErrorResponse, any, any>, res: Response<ActivateUserResponse | ErrorResponse>) => {
  try {
    const { userId: userIdToActivate } = req.params; 
    const currentUserIdFromToken = req.user?.userId;

    if (!currentUserIdFromToken) {
      return res.status(401).json({ message: 'Current user not authenticated' });
    }
    if (!userIdToActivate) {
        return res.status(400).json({ message: 'User ID to activate is required in URL parameters' });
    }
    
    const currentUser: IUserDocument | null = await User.findById(currentUserIdFromToken);
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }
    
    if (currentUser.role !== 'supervisor' && currentUser.role !== 'admin') {
      return res.status(403).json({ message: 'Only supervisors or admins can activate users' });
    }
    
    const userToActivate: IUserDocument | null = await User.findById(userIdToActivate);
    if (!userToActivate) {
      return res.status(404).json({ message: 'User to activate not found' });
    }
    
    const currentUserCompanyId = currentUser.company?.toString();
    const userToActivateCompanyId = userToActivate.company?.toString();

    if (!currentUserCompanyId || !userToActivateCompanyId || currentUserCompanyId !== userToActivateCompanyId) {
      return res.status(403).json({ message: 'You can only activate users from your own company' });
    }
    
    userToActivate.isActive = true;
    await userToActivate.save();
    
    const company: ICompanyDocument | null = await Company.findById(currentUserCompanyId);
    if (company && company.users) { 
      const userInCompany = company.users.find(u => u.user?.toString() === userIdToActivate);
      if (userInCompany) {
        userInCompany.isActive = true; 
        await company.save();
      }
    }
    
    return res.json({
      message: 'User activated successfully',
      user: {
        id: userToActivate._id.toString(),
        email: userToActivate.email,
        firstName: userToActivate.firstName,
        lastName: userToActivate.lastName,
        isActive: userToActivate.isActive
      }
    });

  } catch (error: unknown) {
    logger.error('Error activating user:', { error });
    return res.status(500).json({ message: getErrorMessage(error, 'Server error') });
  }
};

export const changeUserRole = async (req: AuthenticatedRequest<UserIdParams, ChangeUserRoleResponse | ErrorResponse, ChangeUserRoleBody, any>,
                                   res: Response<ChangeUserRoleResponse | ErrorResponse>) => {
  try {
    const { userId: userIdToUpdate } = req.params;
    const { role: newRole } = req.body;
    const currentUserIdFromToken = req.user?.userId;

    if (!currentUserIdFromToken) {
      return res.status(401).json({ message: 'Current user not authenticated' });
    }
    if (!userIdToUpdate) {
        return res.status(400).json({ message: 'User ID to update is required in URL parameters' });
    }
    if (!newRole) {
        return res.status(400).json({ message: 'New role is required in request body' });
    }

    if (!['admin', 'supervisor', 'manager', 'logist'].includes(newRole)) {
      return res.status(400).json({ message: 'Invalid role. Must be admin, supervisor, manager, or logist' });
    }

    const currentUser: IUserDocument | null = await User.findById(currentUserIdFromToken);
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    // Only full admins can assign the admin role
    if (newRole === 'admin' && currentUser.role !== 'admin') {
      return res.status(403).json({ message: 'Only a full admin can assign the admin role.' });
    }
    // Supervisors and admins can change roles within their company
    if (currentUser.role !== 'supervisor' && currentUser.role !== 'admin') {
      return res.status(403).json({ message: 'Only supervisors or admins can change user roles' });
    }
    
    const userToUpdate: IUserDocument | null = await User.findById(userIdToUpdate);
    if (!userToUpdate) {
      return res.status(404).json({ message: 'User to update not found' });
    }
    
    const currentUserCompanyId = currentUser.company?.toString();
    const userToUpdateCompanyId = userToUpdate.company?.toString();

    if (!currentUserCompanyId || !userToUpdateCompanyId || currentUserCompanyId !== userToUpdateCompanyId) {
      return res.status(403).json({ message: 'You can only update users from your own company' });
    }

    // Check if role 'logist' or 'admin' is only for LGDeal INC company
    if (newRole === 'logist' || newRole === 'admin') {
      const currentUserCompany = await Company.findById(currentUserCompanyId);
      if (!currentUserCompany || currentUserCompany.name !== marketplaceConfig.managementCompany.name) {
        return res.status(403).json({ message: `Role "${newRole}" is only available for LGDeal INC company` });
      }
    }
    
    if (userToUpdate.role === 'supervisor' && newRole === 'manager') {
      const company: ICompanyDocument | null = await Company.findById(currentUserCompanyId).lean();
      if (company && company.users) {
            const supervisorsCount = company.users.filter((u: CompanyUserEntry) => 
                u.role === 'supervisor' && 
                u.isActive === true && 
                u.user?.toString() !== userIdToUpdate
            ).length;
            
            if (supervisorsCount === 0) {
                return res.status(400).json({ 
                message: 'Cannot change role. Company must have at least one supervisor.' 
                });
            }
      }
    }
    
    userToUpdate.role = newRole;
    await userToUpdate.save();
    
    const companyToUpdateArray: ICompanyDocument | null = await Company.findById(currentUserCompanyId);
    if (companyToUpdateArray && companyToUpdateArray.users) {
        const userInCompanyIndex = companyToUpdateArray.users.findIndex((u: CompanyUserEntry) => u.user?.toString() === userIdToUpdate);
        if (userInCompanyIndex !== -1) {
            companyToUpdateArray.users[userInCompanyIndex].role = newRole;
            await companyToUpdateArray.save();
        }
    }
    
    return res.json({ 
      message: `User role changed to ${newRole} successfully`,
      user: {
        id: userToUpdate._id.toString(),
        email: userToUpdate.email,
        firstName: userToUpdate.firstName,
        lastName: userToUpdate.lastName,
        role: userToUpdate.role
      }
    });

  } catch (error: unknown) {
    logger.error('Error changing user role:', { error });
    return res.status(500).json({ message: getErrorMessage(error, 'Server error') });
  }
};

export const getCompanyInfo = async (req: AuthenticatedRequest, res: Response<CompanyInfoResponse | ErrorResponse>) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let company: ICompanyDocument | null = null;
    
    // During impersonation, always use the impersonated user's company
    if (req.user?.isLgdealSupervisor && !req.user?.isImpersonation) {
      company = await Company.findOne({ name: 'LGDeal INC' });
    } else {
      if (!user.company) {
        return res.status(404).json({ message: 'User is not associated with a company' });
      }
      company = await Company.findById(user.company);
    }

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    res.json({
      id: company._id.toString(),
      name: company.name,
      description: company.description,
      details: company.details,
      roles: company.roles,
      paymentSettings: company.paymentSettings,
    });
  } catch (error: unknown) {
    return res.status(500).json({ message: `Server error: ${getErrorMessage(error)}` });
  }
};

export const updateCompanyInfo = async (req: AuthenticatedRequest<any, CompanyInfoResponse | ErrorResponse, UpdateCompanyInfo, any>,
                                      res: Response<CompanyInfoResponse | ErrorResponse>) => {
  try {
    logger.debug('updateCompanyInfo - Request body');
    
    const { name, description, details, paymentSettings } = req.body;
    const currentUserIdFromToken = req.user?.userId;

    if (!currentUserIdFromToken) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const currentUser: IUserDocument | null = await User.findById(currentUserIdFromToken);
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    if (currentUser.role !== 'supervisor' && currentUser.role !== 'admin') {
      return res.status(403).json({ message: 'Only supervisors or admins can update company information' });
    }

    const currentUserCompanyId = currentUser.company?.toString();
    if (!currentUserCompanyId) {
      return res.status(400).json({ message: 'User is not associated with any company' });
    }

    const company: ICompanyDocument | null = await Company.findById(currentUserCompanyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    logger.debug('updateCompanyInfo - Company before update');

    if (name !== undefined) company.name = name;
    if (description !== undefined) company.description = description;
    
    if (details) {
      if (!company.details || typeof company.details !== 'object') {
        company.details = {}; // Initialize if not exists - type will be set by mergeDeep
      }

      // Deep merge for details
      const mergeDeep = (target: Record<string, unknown>, source: Record<string, unknown>): void => {
        for (const key of Object.keys(source)) {
          if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
            // If both target and source have this key as an object, recurse
            mergeDeep(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
          } else {
            // Otherwise, assign the value from source to target
            target[key] = source[key];
          }
        }
      };

      mergeDeep(company.details as Record<string, unknown>, details as Record<string, unknown>);
      logger.debug('updateCompanyInfo - Company after merge');
    }

    // Payment settings (per-company payment method toggles)
    if (paymentSettings) {
      if (!company.paymentSettings || typeof company.paymentSettings !== 'object') {
        company.paymentSettings = {};
      }
      if (typeof paymentSettings.stripeEnabled === 'boolean') {
        company.paymentSettings.stripeEnabled = paymentSettings.stripeEnabled;
      }
    }

    const updatedCompany = await company.save();
    logger.debug('updateCompanyInfo - Company after save');

    return res.json({
      message: 'Company information updated successfully',
      id: updatedCompany._id.toString(),
      name: updatedCompany.name,
      description: updatedCompany.description,
      details: updatedCompany.details,
      roles: updatedCompany.roles,
      paymentSettings: updatedCompany.paymentSettings
    } as CompanyInfoResponse & { message: string });

  } catch (error: unknown) {
    logger.error('Error updating company information:', { error });
    return res.status(500).json({ message: getErrorMessage(error, 'Server error') });
  }
};

// ---- Multer Configuration ----
// Save under unified uploads root (default /app/uploads)
const UPLOAD_ROOT = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.join(process.cwd(), 'uploads');
const UPLOAD_DIR = path.join(UPLOAD_ROOT, 'company_logos');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const imageFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const filetypes = /jpeg|jpg|png|gif/;
  const mimetype = filetypes.test(file.mimetype);
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Only image files (jpeg, jpg, png, gif) are allowed!'));
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: imageFileFilter
});

// Middleware for single logo upload
export const multerUploadLogo = upload.single('logo');

// ---- Controller Function for Logo Upload ----
export const uploadLogo = async (req: AuthenticatedRequest, res: Response<UploadLogoResponse | ErrorResponse>) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded or file was rejected by filter.' });
    }

    // Basic magic-bytes validation to prevent disguised files
    const isValidImage = (() => {
      try {
        const fd = fs.openSync(req.file.path, 'r');
        const header = Buffer.alloc(8);
        fs.readSync(fd, header, 0, 8, 0);
        fs.closeSync(fd);
        // JPEG: FF D8 FF
        if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return true;
        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (
          header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47 &&
          header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a
        ) return true;
        // GIF: GIF87a or GIF89a
        if (header.slice(0, 3).toString() === 'GIF') return true;
        return false;
      } catch {
        return false;
      }
    })();

    if (!isValidImage) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ message: 'Invalid image file (magic bytes mismatch).' });
    }

    const currentUserIdFromToken = req.user?.userId;
    if (!currentUserIdFromToken) {
      fs.unlinkSync(req.file.path); 
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const currentUser: IUserDocument | null = await User.findById(currentUserIdFromToken);
    if (!currentUser) {
      fs.unlinkSync(req.file.path); 
      return res.status(404).json({ message: 'Current user not found' });
    }

    const currentUserCompanyId = currentUser.company?.toString();
    if (!currentUserCompanyId) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'User is not associated with any company' });
    }

    const company: ICompanyDocument | null = await Company.findById(currentUserCompanyId);
    if (!company) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Company not found' });
    }

    if (currentUser.role !== 'supervisor') {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: 'Not authorized to upload company logo. Supervisor role required.' });
    }

    if (company.details?.logo?.filename) {
      const oldLogoPath = path.join(UPLOAD_DIR, company.details.logo.filename);
      if (fs.existsSync(oldLogoPath)) {
        try {
            fs.unlinkSync(oldLogoPath);
            logger.info('Old logo deleted', { oldLogoPath });
        } catch (unlinkErr: unknown) {
            logger.warn('Error deleting old logo', { error: unlinkErr });
        }
      }
    }

    if (!company.details) {
      company.details = {}; // Initialize if undefined
    }
    // Store API path to avoid any client relying on public /uploads
    company.details.logo = {
      url: `/api/files/company_logos/${req.file.filename}`,
      filename: req.file.filename
    };

    await company.save();

    return res.json({
      message: 'Logo uploaded successfully',
      logo: company.details.logo
    });

  } catch (err: unknown) {
    logger.error('Error in uploadLogo controller function:', { error: err });
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr: unknown) {
        logger.warn('Error cleaning up uploaded file during error handling', { error: unlinkErr });
      }
    }
    return res.status(500).json({ message: getErrorMessage(err, 'Server error during logo upload process') });
  }
};

// ---- Admin Functions ----

export const getAllCompanies = async (req: AuthenticatedRequest, res: Response<CompaniesResponse | ErrorResponse>) => {
  try {
    const companies: ICompanyDocument[] = await Company.find()
      .populate('users.user', 'email firstName lastName role isActive') 
      .sort({ createdAt: -1 })
      .lean<ICompanyDocument[]>(); // Use lean with array type

    return res.json({ companies });

  } catch (error: unknown) {
    logger.error('Error getting all companies:', { error });
    return res.status(500).json({ message: getErrorMessage(error, 'Server error') });
  }
};

export const getOnboardingRequests = async (req: AuthenticatedRequest, res: Response<CompaniesResponse | ErrorResponse>) => {
  try {
    const companies: ICompanyDocument[] = await Company.find({ status: 'pending_review' }) // TODO: Use CompanyStatus enum
      .populate('users.user', 'email firstName lastName role isActive')
      .sort({ createdAt: 1 }) 
      .lean<ICompanyDocument[]>(); 

    return res.json({ companies });

  } catch (error: unknown) {
    logger.error('Error getting onboarding requests:', { error });
    return res.status(500).json({ message: getErrorMessage(error, 'Server error') });
  }
};

export const approveCompany = async (req: AuthenticatedRequest<CompanyIdParams, CompanyResponse | ErrorResponse, any, any>,
                                   res: Response<CompanyResponse | ErrorResponse>) => {
  try {
    const { companyId } = req.params;
    const currentUserIdFromToken = req.user?.userId;

    if (!currentUserIdFromToken) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    if (!companyId) {
        return res.status(400).json({ message: 'Company ID is required in URL parameters' });
    }

    const company: ICompanyDocument | null = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    if (company.status !== 'pending_review') { // TODO: Use CompanyStatus enum
      return res.status(400).json({ message: `Company is not pending review (status: ${company.status})` });
    }

    company.status = 'active'; // TODO: Use CompanyStatus enum
    // Note: reviewedBy and reviewedAt are not in ICompanyDocument interface, but stored in MongoDB
    (company as ICompanyDocument & { reviewedBy?: mongoose.Types.ObjectId; reviewedAt?: Date }).reviewedBy = new mongoose.Types.ObjectId(currentUserIdFromToken);
    (company as ICompanyDocument & { reviewedBy?: mongoose.Types.ObjectId; reviewedAt?: Date }).reviewedAt = new Date();

    if (company.users && Array.isArray(company.users) && company.users.length > 0) {
      const firstUserEntry = company.users[0] as CompanyUserEntry;
      if (firstUserEntry.role === 'supervisor' && !firstUserEntry.isActive) {
        const userToActivateId = firstUserEntry.user?.toString(); // user could be populated or an ID
        
        // Handle if firstUserEntry.user is already populated
        let userIdToFind = userToActivateId;
        if (typeof firstUserEntry.user === 'object' && firstUserEntry.user && '_id' in firstUserEntry.user) {
            userIdToFind = (firstUserEntry.user as PopulatedCompanyUser)._id.toString();
        }

        if (userIdToFind) {
            const userToActivate: IUserDocument | null = await User.findById(userIdToFind);
            if (userToActivate) {
                userToActivate.isActive = true;
                await userToActivate.save();
                firstUserEntry.isActive = true; 
                logger.info('Activated first supervisor for company', { company: company.name, user: userToActivate.email || userIdToFind });
            }
        }
      }
    }

    const savedCompany = await company.save();
    
    return res.json({ 
        message: 'Company approved and first supervisor activated', 
        company: savedCompany 
    });

  } catch (error: unknown) {
    logger.error('Error approving company:', { error });
    return res.status(500).json({ message: getErrorMessage(error, 'Server error') });
  }
};

export const rejectCompany = async (req: AuthenticatedRequest<CompanyIdParams, CompanyResponse | ErrorResponse, any, any>,
                                  res: Response<CompanyResponse | ErrorResponse>) => {
  try {
    const { companyId } = req.params;
    const currentUserIdFromToken = req.user?.userId;

    if (!currentUserIdFromToken) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required in URL parameters' });
    }

    const company: ICompanyDocument | null = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    company.status = 'rejected'; // TODO: Use CompanyStatus enum
    // Note: reviewedBy and reviewedAt are not in ICompanyDocument interface, but stored in MongoDB
    (company as ICompanyDocument & { reviewedBy?: mongoose.Types.ObjectId; reviewedAt?: Date }).reviewedBy = new mongoose.Types.ObjectId(currentUserIdFromToken);
    (company as ICompanyDocument & { reviewedBy?: mongoose.Types.ObjectId; reviewedAt?: Date }).reviewedAt = new Date();
    
    // if (req.body.reason) { // TODO: Type req.body for reason
    //   (company as ICompanyDocument & { rejectionReason?: string }).rejectionReason = req.body.reason; 
    // }

    const savedCompany = await company.save();
    
    return res.json({ 
        message: 'Company rejected', 
        company: savedCompany 
    });

  } catch (error: unknown) {
    logger.error('Error rejecting company:', { error });
    return res.status(500).json({ message: getErrorMessage(error, 'Server error') });
  }
};

export const getCompany = async (req: AuthenticatedRequest<GetCompanyParams, CompanyResponse | ErrorResponse, any, any>,
                               res: Response<CompanyResponse | ErrorResponse>) => {
  try {
    const companyIdParam = req.params.id;
    let companyToFetchId: string | mongoose.Types.ObjectId | undefined = undefined;

    if (companyIdParam === 'profile') {
      logger.debug('[getCompany] "profile" requested, fetching company for current user.');
      const currentUserIdFromToken = req.user?.userId;
      if (!currentUserIdFromToken) {
        return res.status(401).json({ message: 'User not authenticated for profile access' });
      }
      
      const currentUser = await User.findById(currentUserIdFromToken).select('company').lean();
      if (!currentUser) {
        return res.status(404).json({ message: 'Authenticated user not found' });
      }
      
      if (!currentUser.company) {
        return res.status(404).json({ message: 'User is not associated with any company' });
      }
      companyToFetchId = currentUser.company.toString();
      logger.debug(`[getCompany] Resolved "profile" to company ID: ${companyToFetchId}`);

    } else {
      if (!mongoose.Types.ObjectId.isValid(companyIdParam)) {
        return res.status(400).json({ message: 'Invalid company ID format' });
      }
      companyToFetchId = companyIdParam;
      logger.debug(`[getCompany] Fetching company by specific ID: ${companyToFetchId}`);
    }

    if (!companyToFetchId) {
         // This case should ideally not be reached if logic above is correct
        return res.status(400).json({ message: 'Company ID could not be determined.' });
    }

    const company = await Company.findById(companyToFetchId)
      // Add any necessary .populate() calls here if needed for the response
      // .populate('users.user', 'firstName lastName email')
      // .populate('apiConfig')
      .lean(); // Use .lean() for faster plain JS objects if not modifying

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // TODO: Decide what to return. For now, returning the lean company object.
    // Ensure the response matches what the client expects for /api/company/:id or /api/company/profile
    return res.json({ company: company as ICompanyDocument }); // Cast to ICompanyDocument if using lean()

  } catch (error: unknown) {
    logger.error(`[getCompany] Error fetching company (param: ${req.params.id}):`, { error });
    // Check for CastError specifically, though the ObjectId.isValid check should catch most.
    if (error && typeof error === 'object' && 'name' in error && error.name === 'CastError' && 'path' in error && error.path === '_id') {
        return res.status(400).json({ message: 'Invalid company ID format in database query.' });
    }
    return res.status(500).json({ message: 'Server error while fetching company' });
  }
};

// COMPANY ROLES MANAGEMENT METHODS

/**
 * Get company roles for current user's company
 * @route GET /api/company/roles
 * @access Private
 */
export const getCompanyRoles = async (req: AuthenticatedRequest<any, { roles: string[] } | ErrorResponse, any, any>,
                                     res: Response<{ roles: string[] } | ErrorResponse>) => {
  try {
    const currentUserIdFromToken = req.user?.userId;
    if (!currentUserIdFromToken) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const currentUser = await User.findById(currentUserIdFromToken).select('company').lean();
    if (!currentUser || !currentUser.company) {
      return res.status(404).json({ message: 'User is not associated with any company' });
    }

    const company = await Company.findById(currentUser.company).select('roles').lean();
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    return res.json({ roles: company.roles || ['seller'] });

  } catch (error: unknown) {
    logger.error('Error getting company roles:', { error });
    return res.status(500).json({ message: getErrorMessage(error, 'Server error') });
  }
};

/**
 * Update company roles (admin only)
 * @route PUT /api/company/:companyId/roles
 * @access Private (Admin)
 */
export const updateCompanyRoles = async (req: AuthenticatedRequest<{ companyId: string }, { message: string } | ErrorResponse, { roles: string[] }, any>,
                                        res: Response<{ message: string } | ErrorResponse>) => {
  try {
    const { companyId } = req.params;
    const { roles } = req.body;

    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }

    if (!Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ message: 'Roles array is required and cannot be empty' });
    }

    // Validate roles
    const validRoles = ['seller', 'buyer', 'both'];
    for (const role of roles) {
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: `Invalid role: ${role}. Valid roles are: ${validRoles.join(', ')}` });
      }
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    company.roles = roles as CompanyRole[];
    await company.save();

    logger.info(`Company roles updated for company ${companyId}: ${roles.join(', ')}`);
    return res.json({ message: 'Company roles updated successfully' });

  } catch (error: unknown) {
    logger.error('Error updating company roles:', { error });
    return res.status(500).json({ message: getErrorMessage(error, 'Server error') });
  }
};

// End of companyController.ts 