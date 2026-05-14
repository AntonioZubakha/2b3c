import express, { Router, Request, Response } from "express";
import { adminAuthMiddleware, fullAdminOnly } from "../middleware/adminAuth";
import User from "../models/User";
import Company from "../models/Company";
import Product from "../models/Product";
import jwt from "jsonwebtoken";
import * as companyController from "../controllers/companyController";
import * as companyApiController from "../controllers/companyApiController";
import * as authController from "../controllers/authController";
import mongoose from "mongoose";
import { validate } from "../middleware/validation";
import { z } from "zod";
import { ObjectIdSchema } from "../validation/baseSchemas";
import { logger } from "../utils/logger";
// import { ExecuteCommandSchema } from '../validation/schemas/companySchemas';
import { UpdateApiConfigSchema } from "../validation/schemas/companySchemas";
import { UpdateUserDetailsSchema } from "../validation/schemas/authSchemas";
import SystemSettingsService from "../services/systemSettingsService";
import { asyncHandler } from "../types/express-helpers";
import PerfectPairSettingsService from "../services/perfectPairSettingsService";
import ConstantsSettingsService from "../services/constantsSettingsService";
import MarketPriceSettingsService from "../services/marketPriceSettingsService";
import ParserAliasesSettingsService from "../services/parserAliasesSettingsService";
import * as BotPromptService from "../services/botPromptService";
import {
  UpdateBotPromptsBodySchema,
  RestoreBotPromptBodySchema,
} from "../validation/schemas/botPromptSchemas";
import {
  sendRegistrationNotification,
  RegistrationNotificationData,
} from "../utils/telegramBot";
import * as adminSuppliersStockController from "../controllers/adminSuppliersStockController";
import * as adminWhatsAppController from "../controllers/adminWhatsAppController";
import * as adminTelegramUserController from "../controllers/adminTelegramUserController";
import * as adminBackgroundJobsController from "../controllers/adminBackgroundJobsController";
import * as adminResourceUsageController from "../controllers/adminResourceUsageController";
import axios from "axios";

// Admin route parameter schemas
const UserIdParamsSchema = z.object({
  id: ObjectIdSchema,
});

const ImpersonateParamsSchema = z.object({
  userId: ObjectIdSchema,
});

const CompanyIdParamsSchema = z.object({
  id: ObjectIdSchema,
});

// Admin route body schemas
const ChangeUserCompanySchema = z.object({
  companyId: ObjectIdSchema,
});

const UpdateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

const ActivateUserSchema = z.object({
  activate: z.boolean(),
});

const DeleteUserSchema = z.object({
  reason: z.string().optional(),
});

const countryCodeEntry = z
  .string()
  .length(2)
  .regex(/^[A-Za-z]{2}$/);

// System settings schemas
const UpdateSystemSettingsSchema = z.object({
  registrationsEnabled: z.boolean(),
  reason: z.string().min(1, "Reason is required").max(500, "Reason too long"),
  registrationIpBlacklist: z.array(z.string().max(200)).max(500).optional(),
  registrationBlockedCountryCodes: z
    .array(countryCodeEntry)
    .max(300)
    .optional(),
});

const ToggleRegistrationsSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().min(1, "Reason is required").max(500, "Reason too long"),
  registrationIpBlacklist: z.array(z.string().max(200)).max(500).optional(),
  registrationBlockedCountryCodes: z
    .array(countryCodeEntry)
    .max(300)
    .optional(),
});

// Perfect Pair settings schemas
const StageSchema = z.object({
  caratTolerancePct: z.number().min(0).max(5),
  clarityStepsAllowed: z.number().int().min(0).max(2),
  cutMaxDowngrade: z.number().int().min(0).max(2),
  polishMaxDowngrade: z.number().int().min(0).max(2),
  symmetryMaxDowngrade: z.number().int().min(0).max(2),
  maxCandidatesPerStage: z.number().int().min(1).max(200),
});

const WeightsSchema = z.object({
  carat: z.number().min(0).max(100),
  clarity: z.number().min(0).max(100),
  cut: z.number().min(0).max(100),
  polish: z.number().min(0).max(100),
  symmetry: z.number().min(0).max(100),
  bonusFullGia: z.number().min(0).max(100),
  pricePenaltyK: z.number().min(0).max(100),
});

const UpdatePerfectPairSettingsSchema = z.object({
  enableProgressiveRelaxation: z.boolean().optional(),
  maxStage: z.number().int().min(1).max(4).optional(),
  stages: z.array(StageSchema).min(1).max(4).optional(),
  weights: WeightsSchema.optional(),
  reason: z.string().min(1).max(500),
});

const UpdateConstantsSettingsSchema = z.object({
  minSupplierPrice: z.number().min(0).optional(),
  measurementRatioGeometryTolerancePct: z
    .number()
    .min(0.001)
    .max(0.5)
    .optional(),
  alternativesCaratTolerance: z.number().min(0.001).max(0.5).optional(),
  reason: z.string().min(1).max(500),
});

const UpdateMarketPriceSettingsSchema = z.object({
  coeffInr: z.number().min(0).max(1).optional(),
  coeffGold: z.number().min(0).max(0.2).optional(),
  coeffOil: z.number().min(0).max(0.2).optional(),
  weightPriceDecreased: z.number().min(0.5).max(2).optional(),
  weightPriceIncreased: z.number().min(0.5).max(2).optional(),
  weightNewProducts: z.number().min(0.5).max(2).optional(),
  weightDisappeared: z.number().min(0.5).max(2).optional(),
  weightUnchanged: z.number().min(0.5).max(2).optional(),
  medianSmallKeepPct: z.number().min(0.5).max(1).optional(),
  medianMediumKeepPct: z.number().min(0.2).max(0.8).optional(),
  medianLargeExpensiveExcludePct: z.number().min(0.3).max(0.9).optional(),
  medianLargeCheapExcludePct: z.number().min(0).max(0.1).optional(),
  medianVeryLargeExpensiveExcludePct: z.number().min(0.5).max(0.95).optional(),
  medianVeryLargeCheapExcludePct: z.number().min(0).max(0.1).optional(),
  reason: z.string().min(1).max(500),
});

const UpdateParserAliasesSettingsSchema = z.object({
  aliases: z
    .record(z.string().min(1).max(100), z.array(z.string().min(1).max(200)).max(500))
    .refine((value) => Object.keys(value).length <= 200, {
      message: "Too many alias fields",
    }),
  reason: z.string().min(1).max(500),
});

const AdminWhatsAppMergedWaIdParamsSchema = z.object({
  waId: z.string().min(4).max(32),
});

const AdminWhatsAppChannelWaIdParamsSchema = z.object({
  channel: z.enum(["cloud", "baileys"]),
  waId: z.string().min(4).max(32),
});

const AdminWhatsAppSendBodySchema = z.object({
  channel: z.enum(["cloud", "baileys"]).optional(),
  waId: z.string().min(4).max(32),
  text: z.string().min(1).max(4096),
});

const AdminWhatsAppAiPausedBodySchema = z.object({
  paused: z.boolean(),
});

const AdminWhatsAppAutoReplyModeBodySchema = z.object({
  mode: z.enum(["off", "cloud", "baileys"]),
});

const AdminWhatsAppUsersSearchQuerySchema = z.object({
  company: z.string().max(120).optional(),
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const AdminTelegramUserPeerIdParamsSchema = z.object({
  peerId: z.string().min(1).max(32),
});

const AdminTelegramUserSendBodySchema = z.object({
  peerId: z.string().min(1).max(32),
  text: z.string().min(1).max(4096),
});

const AdminTelegramUserAiPausedBodySchema = z.object({
  paused: z.boolean(),
});

const AdminTelegramUserAutoReplyModeBodySchema = z.object({
  mode: z.enum(["off", "user"]),
});

const AdminTelegramUserUsersSearchQuerySchema = z.object({
  company: z.string().max(120).optional(),
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const AdminTelegramUserLoginPhoneBodySchema = z.object({
  phone: z.string().min(5).max(32),
});

const AdminTelegramUserLoginCodeBodySchema = z.object({
  code: z.string().min(1).max(20),
});

const AdminTelegramUserLoginPasswordBodySchema = z.object({
  password: z.string().min(1).max(200),
});

const router: Router = express.Router();

// CORS headers will be handled by the main app middleware

// @route   GET api/admin/users
// @desc    Get all users
// @access  Admin only
router.get(
  "/users",
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const users = await User.find()
        .select("-password")
        .populate("company", "name");
      res.json(users);
    } catch (err) {
      logger.error("Error fetching users:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route   GET api/admin/companies
// @desc    Get all companies
// @access  Admin only
router.get(
  "/companies",
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { status } = req.query;
      const filter: { status?: string | string[] } = {};
      if (status && typeof status === "string") {
        filter.status = status;
      }

      const companies = await Company.find(filter)
        .populate("users.user", "email firstName lastName role isActive")
        .populate("apiConfig")
        .sort({ name: 1 });
      res.json(companies);
    } catch (err) {
      logger.error("Error fetching companies:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route   GET api/admin/companies/:id
// @desc    Get company by ID with detailed info
// @access  Admin only
router.get(
  "/companies/:id",
  adminAuthMiddleware,
  validate({ params: CompanyIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const companyId = req.params.id;

      const company = await Company.findById(companyId).populate(
        "users.user",
        "email firstName lastName role isActive",
      );

      if (!company) {
        res.status(404).json({ message: "Company not found" });
        return;
      }

      const products = await Product.find({ company: companyId });

      res.json({
        company,
        stats: {
          userCount: company.users?.length || 0,
          productCount: products.length,
        },
      });
    } catch (err) {
      logger.error("Error fetching company details:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route   GET api/admin/users/:id
// @desc    Get user profile by ID
// @access  Admin only
router.get(
  "/users/:id",
  adminAuthMiddleware,
  validate({ params: UserIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;

      const user = await User.findById(userId)
        .select("-password")
        .populate("company", "name");

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      let products: any[] = [];
      if (user.company) {
        products = await Product.find({
          company: user.company._id,
        }).limit(10);
      }

      res.json({
        user,
        products: products,
        stats: {
          productCount: products.length,
        },
      });
    } catch (err) {
      logger.error("Error fetching user details:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route   PUT api/admin/users/:id/company
// @desc    Change user's company
// @access  Admin only
router.put(
  "/users/:id/company",
  adminAuthMiddleware,
  validate({
    params: UserIdParamsSchema,
    body: ChangeUserCompanySchema,
  }),
  async (req: Request, res: Response) => {
    try {
      const { companyId } = req.body;
      const userId = req.params.id;

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      const company = await Company.findById(companyId);
      if (!company) {
        res.status(404).json({ message: "Company not found" });
        return;
      }

      if (user.company) {
        const oldCompany = await Company.findById(user.company);
        if (oldCompany && oldCompany.users) {
          oldCompany.users = oldCompany.users.filter(
            (u: any) => u.user.toString() !== userId,
          );
          await oldCompany.save();
        }
      }

      user.company = companyId;
      await user.save();

      if (!company.users) {
        company.users = [];
      }
      company.users.push({
        user: new mongoose.Types.ObjectId(userId),
        role: user.role,
        isActive: user.isActive,
      });
      await company.save();

      res.json({
        message: `User transferred to company "${company.name}" successfully`,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          company: company.name,
          role: user.role,
          isActive: user.isActive,
        },
      });
    } catch (err) {
      logger.error("Error changing user company:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route   PUT api/admin/companies/:id
// @desc    Update company information
// @access  Admin only
router.put(
  "/companies/:id",
  adminAuthMiddleware,
  validate({
    params: CompanyIdParamsSchema,
    body: UpdateCompanySchema,
  }),
  async (req: Request, res: Response) => {
    try {
      const companyId = req.params.id;
      const { name, description } = req.body;

      const company = await Company.findById(companyId);
      if (!company) {
        res.status(404).json({ message: "Company not found" });
        return;
      }

      if (name) company.name = name;
      if (description) company.description = description;

      await company.save();

      res.json({
        message: "Company updated successfully",
        company,
      });
    } catch (err) {
      logger.error("Error updating company:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route   PUT api/admin/users/:id/activate
// @desc    Activate/deactivate user
// @access  Admin only
router.put(
  "/users/:id/activate",
  adminAuthMiddleware,
  validate({
    params: UserIdParamsSchema,
    body: ActivateUserSchema,
  }),
  async (req: Request, res: Response) => {
    try {
      const { activate } = req.body;
      const userId = req.params.id;

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      user.isActive = activate;
      await user.save();

      if (user.company) {
        const company = await Company.findById(user.company);
        if (company && company.users) {
          const userInCompany = company.users.find(
            (u: any) => u.user.toString() === userId,
          );
          if (userInCompany) {
            userInCompany.isActive = user.isActive;
            await company.save();
          }
        }
      }

      res.json({
        message: `User ${user.isActive ? "activated" : "deactivated"} successfully`,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: user.isActive,
        },
      });
    } catch (err) {
      logger.error("Error updating user activation status:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route   PUT api/admin/users/:id/role
// @desc    Change user role. Only full admins can assign role 'admin'.
// @access  Admin or supervisor (supervisor cannot set role to admin)
import { invalidateAdminRoleCache } from "../middleware/adminAuth";

router.put(
  "/users/:id/role",
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { role } = req.body;
      const userId = req.params.id;

      const allowedRoles = ["admin", "supervisor", "manager", "logist"];
      if (!allowedRoles.includes(role)) {
        res.status(400).json({ message: "Invalid role specified" });
        return;
      }

      if (role === "admin" && req.user?.role !== "admin") {
        res
          .status(403)
          .json({ message: "Only a full admin can assign the admin role." });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      user.role = role;
      await user.save();
      // Immediately evict cached role so the new role takes effect on next request
      invalidateAdminRoleCache(userId);

      if (user.company) {
        const company = await Company.findById(user.company);
        if (company && company.users) {
          const userInCompany = company.users.find(
            (u: any) => u.user.toString() === userId,
          );
          if (userInCompany) {
            userInCompany.role = user.role;
            await company.save();
          }
        }
      }

      res.json({
        message: `User role updated to ${role} successfully`,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: user.isActive,
        },
      });
    } catch (err) {
      logger.error("Error updating user role:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route   PUT api/admin/users/:id/details
// @desc    Update user details (including password)
// @access  Admin only
router.put(
  "/users/:id/details",
  adminAuthMiddleware,
  validate({
    params: UserIdParamsSchema,
    body: UpdateUserDetailsSchema,
  }),
  async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, email, phone, newPassword } = req.body;
      const userId = req.params.id;

      const user = await User.findById(userId).select("+legacyPasswordSalt");
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      // Check if email is already taken by another user
      if (email !== user.email) {
        const existingUser = await User.findOne({
          email,
          _id: { $ne: userId },
        });
        if (existingUser) {
          res
            .status(400)
            .json({ message: "Email is already taken by another user" });
          return;
        }
      }

      // Check if phone is already taken by another user
      if (phone && phone !== user.phone) {
        const existingUser = await User.findOne({
          phone,
          _id: { $ne: userId },
        });
        if (existingUser) {
          res
            .status(400)
            .json({ message: "Phone is already taken by another user" });
          return;
        }
      }

      // Update basic details
      user.firstName = firstName;
      user.lastName = lastName;
      user.email = email;
      if (phone) user.phone = phone;

      // Update password if provided
      if (newPassword) {
        const bcrypt = require("bcryptjs");
        const saltRounds = 12;
        user.password = await bcrypt.hash(newPassword, saltRounds);
        // Иначе loginUser продолжит bcrypt(plain + '_' + salt) при сохранённой миграционной соли
        user.legacyPasswordSalt = undefined;
      }

      await user.save();

      // Update in company if exists
      if (user.company) {
        const company = await Company.findById(user.company);
        if (company && company.users) {
          const userInCompany = company.users.find(
            (u: any) => u.user.toString() === userId,
          );
          if (userInCompany) {
            userInCompany.user = user._id; // This will update the populated user data
            await company.save();
          }
        }
      }

      res.json({
        message: "User details updated successfully",
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
          isActive: user.isActive,
        },
      });
    } catch (err) {
      logger.error("Error updating user details:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route   POST api/admin/users/:id/force-verify-phone
// @desc    Force verify user's phone (admin override)
// @access  Admin only
router.post(
  "/users/:id/force-verify-phone",
  adminAuthMiddleware,
  validate({ params: UserIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId);

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      user.phoneVerified = true;
      user.phoneVerificationCode = undefined;
      user.phoneVerificationToken = undefined;
      user.phoneVerificationExpires = undefined;

      await user.save();

      res.json({
        message: "Phone verification forced successfully",
        user: {
          id: user._id,
          phone: user.phone,
          phoneVerified: user.phoneVerified,
        },
      });
    } catch (err) {
      logger.error("Error forcing phone verification:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route   POST api/admin/users/:id/force-verify-email
// @desc    Force verify user's email (admin override)
// @access  Admin only
router.post(
  "/users/:id/force-verify-email",
  adminAuthMiddleware,
  validate({ params: UserIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId);

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      user.emailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;

      await user.save();

      res.json({
        message: "Email verification forced successfully",
        user: {
          id: user._id,
          email: user.email,
          emailVerified: user.emailVerified,
        },
      });
    } catch (err) {
      logger.error("Error forcing email verification:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route   POST api/admin/companies
// @desc    Create a new company with user (email and phone pre-verified)
// @access  Admin only
router.post(
  "/companies",
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const {
        name,
        description,
        // User data
        userEmail,
        userPhone,
        userFirstName,
        userLastName,
        userPassword,
        userRole = "manager",
        // Company roles
        companyRoles = ["seller"],
      } = req.body;

      // Validation
      if (!name) {
        res.status(400).json({ message: "Company name is required" });
        return;
      }
      if (
        !userEmail ||
        !userPhone ||
        !userFirstName ||
        !userLastName ||
        !userPassword
      ) {
        res
          .status(400)
          .json({
            message:
              "User email, phone, first name, last name, and password are required",
          });
        return;
      }

      // Check if company with this name already exists
      const existingCompany = await Company.findOne({ name: name.trim() });
      if (existingCompany) {
        res
          .status(400)
          .json({ message: "Company with this name already exists" });
        return;
      }

      // Check if user with this email already exists
      const existingUser = await User.findOne({
        email: userEmail.toLowerCase().trim(),
      });
      if (existingUser) {
        res
          .status(400)
          .json({ message: "User with this email already exists" });
        return;
      }

      // Check if user with this phone already exists
      const existingUserByPhone = await User.findOne({
        phone: userPhone.trim(),
      });
      if (existingUserByPhone) {
        res
          .status(400)
          .json({ message: "User with this phone already exists" });
        return;
      }

      const bcrypt = require("bcryptjs");
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(userPassword, saltRounds);

      // Create company
      const newCompany = new Company({
        name: name.trim(),
        description: description?.trim() || "",
        status: "active",
        roles: companyRoles,
      });
      await newCompany.save();

      // Create user with pre-verified email and phone
      const newUser = new User({
        email: userEmail.toLowerCase().trim(),
        password: hashedPassword,
        firstName: userFirstName.trim(),
        lastName: userLastName.trim(),
        phone: userPhone.trim(),
        company: newCompany._id,
        role: userRole,
        isActive: true,
        emailVerified: true, // Pre-verified by admin
        phoneVerified: true, // Pre-verified by admin
        cart: { items: [], updatedAt: new Date() },
      });
      await newUser.save();

      // Add user to company
      if (!newCompany.users) {
        newCompany.users = [];
      }
      newCompany.users.push({
        user: newUser._id,
        role: userRole,
        isActive: true,
      });
      await newCompany.save();

      // Send Telegram notification about new user creation (admin-created, pre-verified)
      // Note: We do NOT send email/SMS verification codes since email and phone are pre-verified
      try {
        const notificationData: RegistrationNotificationData = {
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          phone: newUser.phone || "",
          companyName: newCompany.name,
          companyRole: newCompany.roles?.[0] || undefined,
          role: userRole,
          registrationDate: newUser.createdAt || new Date(),
        };

        await sendRegistrationNotification(notificationData);
        logger.info(
          "[Admin] Telegram notification sent for admin-created user",
          {
            userId: newUser._id,
            email: newUser.email,
            companyId: newCompany._id,
          },
        );
      } catch (error) {
        logger.error(
          "[Admin] Failed to send Telegram notification for admin-created user:",
          { error },
        );
        // Don't fail user creation if Telegram notification fails
      }

      // Populate company data for response
      const populatedCompany = await Company.findById(newCompany._id)
        .populate(
          "users.user",
          "firstName lastName email phone role isActive emailVerified phoneVerified",
        )
        .lean();

      res.status(201).json({
        company: populatedCompany,
        user: {
          _id: newUser._id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          phone: newUser.phone,
          role: newUser.role,
          emailVerified: newUser.emailVerified,
          phoneVerified: newUser.phoneVerified,
        },
      });
    } catch (err: any) {
      logger.error("Error creating company with user:", { error: err });
      if (err.code === 11000) {
        // Duplicate key error
        const field = Object.keys(err.keyPattern || {})[0];
        res.status(400).json({ message: `${field} already exists` });
        return;
      }
      res.status(500).json({ message: err.message || "Server error" });
    }
  },
);

// @route   DELETE api/admin/companies/:id
// @desc    Delete a company (marks as inactive, does not actually delete)
// @access  Admin only
router.delete(
  "/companies/:id",
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const company = await Company.findById(req.params.id);
      if (!company) {
        res.status(404).json({ message: "Company not found" });
        return;
      }
      // Instead of deleting, mark as inactive or similar
      company.status = "Inactive";
      await company.save();
      res.json({ message: "Company marked as inactive" });
    } catch (err) {
      logger.error("Error deactivating company:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route   DELETE api/admin/companies/:id/hard
// @desc    Permanently delete a company and all its users from the database
// @access  Admin only
router.delete(
  "/companies/:id/hard",
  adminAuthMiddleware,
  validate({ params: CompanyIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const companyId = req.params.id;
      const company = await Company.findById(companyId);

      if (!company) {
        res.status(404).json({ message: "Company not found" });
        return;
      }

      // Get all user IDs in the company
      const userIds: mongoose.Types.ObjectId[] = [];
      if (company.users && company.users.length > 0) {
        company.users.forEach((userEntry: any) => {
          if (userEntry.user) {
            userIds.push(new mongoose.Types.ObjectId(userEntry.user));
          }
        });
      }

      // Permanently delete all users in the company
      if (userIds.length > 0) {
        const deleteResult = await User.deleteMany({ _id: { $in: userIds } });
        logger.info("[Admin] Users permanently deleted with company", {
          companyId,
          companyName: company.name,
          deletedUsersCount: deleteResult.deletedCount,
          deletedBy: req.user?.userId,
        });
      }

      // Permanently delete the company
      await Company.findByIdAndDelete(companyId);

      logger.info("[Admin] Company permanently deleted", {
        companyId,
        companyName: company.name,
        deletedUsersCount: userIds.length,
        deletedBy: req.user?.userId,
      });

      res.json({
        message: "Company and all its users permanently deleted from database",
        deletedUsersCount: userIds.length,
      });
    } catch (err) {
      logger.error("Error permanently deleting company:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route   DELETE api/admin/users/:id
// @desc    Delete a user (marks as inactive, does not actually delete)
// @access  Admin only
router.delete(
  "/users/:id",
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }
      user.isActive = false;
      await user.save();

      // Also update in company if exists
      if (user.company) {
        const company = await Company.findById(user.company);
        if (company && company.users) {
          const userInCompany = company.users.find(
            (u: any) => u.user.toString() === req.params.id,
          );
          if (userInCompany) {
            userInCompany.isActive = false;
            await company.save();
          }
        }
      }
      res.json({ message: "User marked as inactive" });
    } catch (err) {
      logger.error("Error deactivating user:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// @route   DELETE api/admin/users/:id/hard
// @desc    Permanently delete a user from the database
// @access  Admin only
router.delete(
  "/users/:id/hard",
  adminAuthMiddleware,
  validate({ params: UserIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId);

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      // Remove user from company if exists
      if (user.company) {
        const company = await Company.findById(user.company);
        if (company && company.users) {
          company.users = company.users.filter(
            (u: any) => u.user.toString() !== userId,
          );
          await company.save();
        }
      }

      // Permanently delete the user
      await User.findByIdAndDelete(userId);

      logger.info("[Admin] User permanently deleted", {
        userId,
        email: user.email,
        deletedBy: req.user?.userId,
      });

      res.json({ message: "User permanently deleted from database" });
    } catch (err) {
      logger.error("Error permanently deleting user:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

// CMD Executor Route (removed for security)

// Get Onboarding Requests (already in companyController, but for admin panel specific view if needed)
// This might be redundant if companyController.getOnboardingRequests is sufficient
router.get(
  "/onboarding-requests",
  adminAuthMiddleware,
  asyncHandler(companyController.getOnboardingRequests),
);

// Approve Company (already in companyController)
router.put(
  "/companies/:companyId/approve",
  adminAuthMiddleware,
  asyncHandler(companyController.approveCompany),
);

// Reject Company (already in companyController)
router.put(
  "/companies/:companyId/reject",
  adminAuthMiddleware,
  asyncHandler(companyController.rejectCompany),
);

// @route   POST api/admin/cleanup-duplicates
// @desc    Manually run cleanup of duplicate products
// @access  Admin only

// Route to get API config for a company
router.get(
  "/company-api/:companyId/config",
  adminAuthMiddleware,
  asyncHandler(companyApiController.getApiConfig),
);

// Route to update API config for a company
router.put(
  "/company-api/:companyId/config",
  adminAuthMiddleware,
  validate({ body: UpdateApiConfigSchema }),
  asyncHandler(companyApiController.updateApiConfig),
);

// Route to trigger sync for a specific company
router.post(
  "/company-api/:companyId/sync",
  adminAuthMiddleware,
  asyncHandler(companyApiController.triggerSync),
);

// New route to trigger sync for all active APIs
router.post(
  "/sync-all-active-apis",
  adminAuthMiddleware,
  asyncHandler(companyApiController.triggerSyncAllActiveApis),
);

// Get the status of the sync queue
router.get(
  "/sync-queue-status",
  adminAuthMiddleware,
  asyncHandler(companyApiController.getSyncQueueStatus),
);

// Background / heavy jobs snapshot (global Redis lock + service coordinator statuses)
router.get(
  "/background-jobs/overview",
  adminAuthMiddleware,
  asyncHandler(adminBackgroundJobsController.getBackgroundJobsOverview),
);

// Live resource usage (Prometheus/cAdvisor)
router.get(
  "/monitoring/resource-usage",
  adminAuthMiddleware,
  asyncHandler(adminResourceUsageController.getResourceUsageSnapshot),
);

// Replay API sync DLQ back into tasks queue
router.post(
  "/api-sync-dlq/replay",
  adminAuthMiddleware,
  asyncHandler(companyApiController.replayApiSyncDlq),
);

// Route to reset sync status for a company's API config
router.put(
  "/company-api/:companyId/reset-sync",
  adminAuthMiddleware,
  asyncHandler(companyApiController.resetSyncStatus),
);

// Route to delete an API config for a company
router.delete(
  "/company-api/:companyId",
  adminAuthMiddleware,
  asyncHandler(companyApiController.deleteApiConfig),
);

// @route   GET api/admin/impersonate/:userId
// @desc    Impersonate a user
// @access  Admin only
router.get(
  "/impersonate/:userId",
  adminAuthMiddleware,
  validate({ params: ImpersonateParamsSchema }),
  authController.impersonateUser,
);

// @route   DELETE api/admin/cleanup-test-users
// @desc    Cleanup test users for development
// @access  Admin only
router.delete(
  "/cleanup-test-users",
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const TEST_EMAILS = ["testuser1@example.com", "testuser2@example.com"];

      const TEST_PHONES = ["+1234567890", "+1234567891"];

      const TEST_COMPANY_NAMES = ["Test Company Regular", "LGDeal INC"];

      // Find test users first
      const testUsers = await User.find({
        $or: [{ email: { $in: TEST_EMAILS } }, { phone: { $in: TEST_PHONES } }],
      });

      let deletedUsersCount = 0;
      let deletedCompaniesCount = 0;

      if (testUsers.length > 0) {
        // Get company IDs for cleanup
        const companyIds = testUsers
          .map((user) => user.company)
          .filter(Boolean);

        // Delete test users
        const deleteResult = await User.deleteMany({
          $or: [
            { email: { $in: TEST_EMAILS } },
            { phone: { $in: TEST_PHONES } },
          ],
        });

        deletedUsersCount = deleteResult.deletedCount || 0;

        // Clean up test companies (only if they have no other users)
        if (companyIds.length > 0) {
          for (const companyId of companyIds) {
            const remainingUsers = await User.countDocuments({
              company: companyId,
            });
            if (remainingUsers === 0) {
              await Company.findByIdAndDelete(companyId);
              deletedCompaniesCount++;
            }
          }
        }

        // Also cleanup by company names
        const testCompanies = await Company.find({
          name: { $in: TEST_COMPANY_NAMES },
        });

        for (const company of testCompanies) {
          const remainingUsers = await User.countDocuments({
            company: company._id,
          });
          if (remainingUsers === 0) {
            await Company.findByIdAndDelete(company._id);
            deletedCompaniesCount++;
          }
        }
      }

      res.json({
        message: "Test data cleanup completed",
        deletedUsers: deletedUsersCount,
        deletedCompanies: deletedCompaniesCount,
        testUsers: testUsers.length,
      });
    } catch (err) {
      logger.error("Error cleaning up test data:", { error: err });
      res.status(500).json({ message: "Server error during cleanup" });
    }
  },
);

// ============================================================================
// SYSTEM SETTINGS ROUTES
// ============================================================================

// @route   GET api/admin/system-settings
// @desc    Get current system settings
// @access  Full admin only (not supervisor)
router.get(
  "/system-settings",
  adminAuthMiddleware,
  fullAdminOnly,
  async (req: Request, res: Response) => {
    try {
      const settings = await SystemSettingsService.getCurrentSettings();
      res.json(settings);
    } catch (err) {
      logger.error("Error fetching system settings:", { error: err });
      res
        .status(500)
        .json({ message: "Server error while fetching system settings" });
    }
  },
);

// @route   PUT api/admin/system-settings
// @desc    Update system settings
// @access  Full admin only
router.put(
  "/system-settings",
  adminAuthMiddleware,
  fullAdminOnly,
  validate({ body: UpdateSystemSettingsSchema }),
  async (req: Request, res: Response) => {
    try {
      const {
        registrationsEnabled,
        reason,
        registrationIpBlacklist,
        registrationBlockedCountryCodes,
      } = req.body;
      const userId = req.user?.userId; // adminAuthMiddleware добавляет user

      if (!userId) {
        res.status(401).json({ message: "User not authenticated" });
        return;
      }

      const updatedSettings = await SystemSettingsService.updateSettings(
        {
          registrationsEnabled,
          reason,
          registrationIpBlacklist,
          registrationBlockedCountryCodes: registrationBlockedCountryCodes?.map(
            (c: string) => c.toUpperCase(),
          ),
        },
        new mongoose.Types.ObjectId(userId),
      );

      logger.info("System settings updated by admin", {
        adminId: userId,
        registrationsEnabled,
        reason,
        timestamp: new Date().toISOString(),
      });

      res.json(updatedSettings);
    } catch (err) {
      logger.error("Error updating system settings:", { error: err });
      res
        .status(500)
        .json({ message: "Server error while updating system settings" });
    }
  },
);

// @route   POST api/admin/system-settings/registrations/toggle
// @desc    Toggle registrations on/off
// @access  Full admin only
router.post(
  "/system-settings/registrations/toggle",
  adminAuthMiddleware,
  fullAdminOnly,
  validate({ body: ToggleRegistrationsSchema }),
  async (req: Request, res: Response) => {
    try {
      const {
        enabled,
        reason,
        registrationIpBlacklist,
        registrationBlockedCountryCodes,
      } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ message: "User not authenticated" });
        return;
      }

      const updatedSettings = await SystemSettingsService.toggleRegistrations(
        enabled,
        new mongoose.Types.ObjectId(userId),
        reason,
        registrationIpBlacklist !== undefined ||
          registrationBlockedCountryCodes !== undefined
          ? {
              registrationIpBlacklist,
              registrationBlockedCountryCodes:
                registrationBlockedCountryCodes?.map((c: string) =>
                  c.toUpperCase(),
                ),
            }
          : undefined,
      );

      logger.info("Registration settings toggled by admin", {
        adminId: userId,
        enabled,
        reason,
        timestamp: new Date().toISOString(),
      });

      res.json(updatedSettings);
    } catch (err) {
      logger.error("Error toggling registration settings:", { error: err });
      res
        .status(500)
        .json({ message: "Server error while toggling registration settings" });
    }
  },
);

// @route   GET api/admin/system-settings/history
// @desc    Get system settings change history
// @access  Full admin only
router.get(
  "/system-settings/history",
  adminAuthMiddleware,
  fullAdminOnly,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const history = await SystemSettingsService.getSettingsHistory(limit);
      res.json(history);
    } catch (err) {
      logger.error("Error fetching system settings history:", { error: err });
      res
        .status(500)
        .json({ message: "Server error while fetching settings history" });
    }
  },
);

// ============================================================================
// BOT PROMPTS (Support chat AI + WhatsApp marketing AI)
// ============================================================================

router.get(
  "/bot-prompts/history/:snapshotId",
  adminAuthMiddleware,
  fullAdminOnly,
  async (req: Request, res: Response) => {
    try {
      const { snapshotId } = req.params;
      const snap = await BotPromptService.getSnapshotById(snapshotId);
      if (!snap) {
        res.status(404).json({ message: "Snapshot not found" });
        return;
      }
      res.json(snap);
    } catch (err) {
      logger.error("Error fetching bot prompt snapshot:", { error: err });
      res.status(500).json({ message: "Server error" });
    }
  },
);

router.get(
  "/bot-prompts/:bot",
  adminAuthMiddleware,
  fullAdminOnly,
  async (req: Request, res: Response) => {
    try {
      const bot = req.params.bot;
      if (bot !== "support" && bot !== "whatsapp") {
        res.status(400).json({ message: "Invalid bot (use support or whatsapp)" });
        return;
      }
      const payload = await BotPromptService.getEffectivePromptPayload(bot);
      res.json(payload);
    } catch (err) {
      logger.error("Error fetching bot prompts:", { error: err });
      res.status(500).json({ message: "Server error while fetching bot prompts" });
    }
  },
);

router.put(
  "/bot-prompts/:bot",
  adminAuthMiddleware,
  fullAdminOnly,
  validate({ body: UpdateBotPromptsBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const bot = req.params.bot;
      if (bot !== "support" && bot !== "whatsapp") {
        res.status(400).json({ message: "Invalid bot (use support or whatsapp)" });
        return;
      }
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ message: "User not authenticated" });
        return;
      }
      const { files, changeNote } = req.body as { files: Record<string, string>; changeNote: string };
      const updated = await BotPromptService.savePrompts(
        bot,
        files,
        new mongoose.Types.ObjectId(userId),
        changeNote,
      );
      res.json(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Error saving bot prompts:", { error: err });
      if (msg.includes("Invalid") || msg.includes("exceeds") || msg.includes("At least one")) {
        res.status(400).json({ message: msg });
        return;
      }
      res.status(500).json({ message: "Server error while saving bot prompts" });
    }
  },
);

router.get(
  "/bot-prompts/:bot/history",
  adminAuthMiddleware,
  fullAdminOnly,
  async (req: Request, res: Response) => {
    try {
      const bot = req.params.bot;
      if (bot !== "support" && bot !== "whatsapp") {
        res.status(400).json({ message: "Invalid bot" });
        return;
      }
      const limit = Math.min(parseInt(String(req.query.limit), 10) || 30, 100);
      const history = await BotPromptService.getHistory(bot, limit);
      res.json(history);
    } catch (err) {
      logger.error("Error fetching bot prompt history:", { error: err });
      res.status(500).json({ message: "Server error while fetching history" });
    }
  },
);

router.post(
  "/bot-prompts/:bot/restore/:snapshotId",
  adminAuthMiddleware,
  fullAdminOnly,
  validate({ body: RestoreBotPromptBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const bot = req.params.bot;
      if (bot !== "support" && bot !== "whatsapp") {
        res.status(400).json({ message: "Invalid bot" });
        return;
      }
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ message: "User not authenticated" });
        return;
      }
      const { snapshotId } = req.params;
      const prev = await BotPromptService.getSnapshotById(snapshotId);
      if (!prev || prev.bot !== bot) {
        res.status(404).json({ message: "Snapshot not found or wrong bot" });
        return;
      }
      const note =
        (req.body as { changeNote?: string })?.changeNote?.trim() ||
        `Restore snapshot ${snapshotId}`;
      const updated = await BotPromptService.restoreSnapshot(
        snapshotId,
        new mongoose.Types.ObjectId(userId),
        note,
      );
      res.json(updated);
    } catch (err) {
      logger.error("Error restoring bot prompt snapshot:", { error: err });
      res.status(500).json({ message: "Server error while restoring" });
    }
  },
);

// ============================================================================
// PERFECT PAIR SETTINGS ROUTES
// ============================================================================

// @route   GET api/admin/perfect-pair-settings
// @desc    Get current Perfect Pair settings
// @access  Full admin only
router.get(
  "/perfect-pair-settings",
  adminAuthMiddleware,
  fullAdminOnly,
  async (req: Request, res: Response) => {
    try {
      const settings = await PerfectPairSettingsService.getCurrentSettings();
      res.json(settings);
    } catch (err) {
      logger.error("Error fetching perfect pair settings:", { error: err });
      res
        .status(500)
        .json({ message: "Server error while fetching perfect pair settings" });
    }
  },
);

// @route   PUT api/admin/perfect-pair-settings
// @desc    Update Perfect Pair settings
// @access  Full admin only
router.put(
  "/perfect-pair-settings",
  adminAuthMiddleware,
  fullAdminOnly,
  validate({ body: UpdatePerfectPairSettingsSchema }),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ message: "User not authenticated" });
        return;
      }
      const { reason, ...data } = req.body as any;
      const updated = await PerfectPairSettingsService.updateSettings(
        data,
        new mongoose.Types.ObjectId(userId),
        reason,
      );
      res.json(updated);
    } catch (err) {
      logger.error("Error updating perfect pair settings:", { error: err });
      res
        .status(500)
        .json({ message: "Server error while updating perfect pair settings" });
    }
  },
);

// ============================================================================
// CONSTANTS SETTINGS ROUTES
// ============================================================================

router.get(
  "/constants-settings",
  adminAuthMiddleware,
  fullAdminOnly,
  async (req: Request, res: Response) => {
    try {
      const settings = await ConstantsSettingsService.getCurrentSettings();
      res.json(settings);
    } catch (err) {
      logger.error("Error fetching constants settings:", { error: err });
      res
        .status(500)
        .json({ message: "Server error while fetching constants settings" });
    }
  },
);

router.put(
  "/constants-settings",
  adminAuthMiddleware,
  fullAdminOnly,
  validate({ body: UpdateConstantsSettingsSchema }),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "User not authenticated" });
        return;
      }
      const { reason, ...data } = req.body as any;
      const updated = await ConstantsSettingsService.updateSettings(
        data,
        new mongoose.Types.ObjectId(userId),
        reason,
      );
      res.json(updated);
    } catch (err) {
      logger.error("Error updating constants settings:", { error: err });
      res
        .status(500)
        .json({ message: "Server error while updating constants settings" });
    }
  },
);

// ============================================================================
// MARKET PRICE SETTINGS ROUTES (coefficients used by market-price-calculator-service)
// ============================================================================

router.get(
  "/market-price-settings",
  adminAuthMiddleware,
  fullAdminOnly,
  async (req: Request, res: Response) => {
    try {
      const settings = await MarketPriceSettingsService.getCurrentSettings();
      res.json(settings);
    } catch (err) {
      logger.error("Error fetching market price settings:", { error: err });
      res
        .status(500)
        .json({ message: "Server error while fetching market price settings" });
    }
  },
);

router.put(
  "/market-price-settings",
  adminAuthMiddleware,
  fullAdminOnly,
  validate({ body: UpdateMarketPriceSettingsSchema }),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "User not authenticated" });
        return;
      }
      const { reason, ...data } = req.body as any;
      const updated = await MarketPriceSettingsService.updateSettings(
        data,
        new mongoose.Types.ObjectId(userId),
        reason,
      );
      res.json(updated);
    } catch (err) {
      logger.error("Error updating market price settings:", { error: err });
      res
        .status(500)
        .json({ message: "Server error while updating market price settings" });
    }
  },
);

// ============================================================================
// PARSER ALIASES SETTINGS ROUTES (global aliases for import parsers)
// ============================================================================

router.get(
  "/parser-aliases-settings",
  adminAuthMiddleware,
  fullAdminOnly,
  async (req: Request, res: Response) => {
    try {
      const settings = await ParserAliasesSettingsService.getCurrentSettings();
      res.json(settings);
    } catch (err) {
      logger.error("Error fetching parser aliases settings:", { error: err });
      res.status(500).json({
        message: "Server error while fetching parser aliases settings",
      });
    }
  },
);

router.put(
  "/parser-aliases-settings",
  adminAuthMiddleware,
  fullAdminOnly,
  validate({ body: UpdateParserAliasesSettingsSchema }),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "User not authenticated" });
        return;
      }
      const { aliases, reason } = req.body as {
        aliases: Record<string, string[]>;
        reason: string;
      };
      const updated = await ParserAliasesSettingsService.updateSettings(
        aliases,
        new mongoose.Types.ObjectId(userId),
        reason,
      );
      res.json(updated);
    } catch (err) {
      logger.error("Error updating parser aliases settings:", { error: err });
      res.status(500).json({
        message: "Server error while updating parser aliases settings",
      });
    }
  },
);

// ============================================================================
// SUPPLIERS STOCK (table + delete by button)
// ============================================================================

const SupplierStockCompanyIdParamsSchema = z.object({
  companyId: ObjectIdSchema,
});

router.get(
  "/suppliers-stock",
  adminAuthMiddleware,
  asyncHandler(adminSuppliersStockController.getSuppliersStockList),
);
router.post(
  "/suppliers-stock/:companyId/delete-stock",
  adminAuthMiddleware,
  validate({ params: SupplierStockCompanyIdParamsSchema }),
  asyncHandler(adminSuppliersStockController.deleteSupplierStock),
);

// Trigger market price calculation (proxies to market-price-calculator-service)
// Default 127.0.0.1 to avoid IPv6 ::1 resolution when only IPv4 is listening
const MARKET_PRICE_CALCULATOR_URL =
  process.env.MARKET_PRICE_CALCULATOR_URL || "http://127.0.0.1:9100";
// ============================================================================
// WhatsApp (marketing bot) — list chats, messages, manual send, AI pause
// ============================================================================
router.get(
  "/whatsapp/chats",
  adminAuthMiddleware,
  asyncHandler(adminWhatsAppController.getWhatsAppChats),
);
router.get(
  "/whatsapp/users/search",
  adminAuthMiddleware,
  validate({ query: AdminWhatsAppUsersSearchQuerySchema }),
  asyncHandler(adminWhatsAppController.getWhatsAppUsersSearch),
);
router.get(
  "/whatsapp/auto-reply-mode",
  adminAuthMiddleware,
  asyncHandler(adminWhatsAppController.getWhatsAppAutoReplyMode),
);
router.put(
  "/whatsapp/auto-reply-mode",
  adminAuthMiddleware,
  validate({ body: AdminWhatsAppAutoReplyModeBodySchema }),
  asyncHandler(adminWhatsAppController.putWhatsAppAutoReplyMode),
);
router.get(
  "/whatsapp/chats/merged/:waId/messages",
  adminAuthMiddleware,
  validate({ params: AdminWhatsAppMergedWaIdParamsSchema }),
  asyncHandler(adminWhatsAppController.getWhatsAppMessagesMerged),
);
router.put(
  "/whatsapp/chats/merged/:waId/ai-paused",
  adminAuthMiddleware,
  validate({
    params: AdminWhatsAppMergedWaIdParamsSchema,
    body: AdminWhatsAppAiPausedBodySchema,
  }),
  asyncHandler(adminWhatsAppController.putWhatsAppAiPausedMerged),
);
router.get(
  "/whatsapp/baileys/status",
  adminAuthMiddleware,
  asyncHandler(adminWhatsAppController.getWhatsAppBaileysStatus),
);
router.get(
  "/whatsapp/baileys/qr.png",
  adminAuthMiddleware,
  asyncHandler(adminWhatsAppController.getWhatsAppBaileysQrPng),
);
router.get(
  "/whatsapp/baileys/events",
  adminAuthMiddleware,
  asyncHandler(adminWhatsAppController.streamWhatsAppBaileysEvents),
);
router.post(
  "/whatsapp/baileys/disconnect",
  adminAuthMiddleware,
  asyncHandler(adminWhatsAppController.postWhatsAppBaileysDisconnect),
);
router.get(
  "/whatsapp/chats/:channel/:waId/messages",
  adminAuthMiddleware,
  validate({ params: AdminWhatsAppChannelWaIdParamsSchema }),
  asyncHandler(adminWhatsAppController.getWhatsAppMessages),
);
router.post(
  "/whatsapp/send",
  adminAuthMiddleware,
  validate({ body: AdminWhatsAppSendBodySchema }),
  asyncHandler(adminWhatsAppController.postWhatsAppSend),
);
router.put(
  "/whatsapp/chats/:channel/:waId/ai-paused",
  adminAuthMiddleware,
  validate({
    params: AdminWhatsAppChannelWaIdParamsSchema,
    body: AdminWhatsAppAiPausedBodySchema,
  }),
  asyncHandler(adminWhatsAppController.putWhatsAppAiPaused),
);

// ============================================================================
// Telegram user (MTProto) — same marketing bot as WhatsApp; list, send, AI pause
// ============================================================================
router.get(
  "/telegram-user/chats",
  adminAuthMiddleware,
  asyncHandler(adminTelegramUserController.getTelegramUserChats),
);
router.get(
  "/telegram-user/users/search",
  adminAuthMiddleware,
  validate({ query: AdminTelegramUserUsersSearchQuerySchema }),
  asyncHandler(adminTelegramUserController.getTelegramUserUsersSearch),
);
router.get(
  "/telegram-user/auto-reply-mode",
  adminAuthMiddleware,
  asyncHandler(adminTelegramUserController.getTelegramUserAutoReplyMode),
);
router.put(
  "/telegram-user/auto-reply-mode",
  adminAuthMiddleware,
  validate({ body: AdminTelegramUserAutoReplyModeBodySchema }),
  asyncHandler(adminTelegramUserController.putTelegramUserAutoReplyMode),
);
router.get(
  "/telegram-user/status",
  adminAuthMiddleware,
  asyncHandler(adminTelegramUserController.getTelegramUserStatus),
);
router.get(
  "/telegram-user/qr.png",
  adminAuthMiddleware,
  asyncHandler(adminTelegramUserController.getTelegramUserQrPng),
);
router.get(
  "/telegram-user/events",
  adminAuthMiddleware,
  asyncHandler(adminTelegramUserController.streamTelegramUserEvents),
);
router.post(
  "/telegram-user/disconnect",
  adminAuthMiddleware,
  asyncHandler(adminTelegramUserController.postTelegramUserDisconnect),
);
router.get(
  "/telegram-user/chats/:peerId/messages",
  adminAuthMiddleware,
  validate({ params: AdminTelegramUserPeerIdParamsSchema }),
  asyncHandler(adminTelegramUserController.getTelegramUserMessages),
);
router.post(
  "/telegram-user/send",
  adminAuthMiddleware,
  validate({ body: AdminTelegramUserSendBodySchema }),
  asyncHandler(adminTelegramUserController.postTelegramUserSend),
);
router.put(
  "/telegram-user/chats/:peerId/ai-paused",
  adminAuthMiddleware,
  validate({
    params: AdminTelegramUserPeerIdParamsSchema,
    body: AdminTelegramUserAiPausedBodySchema,
  }),
  asyncHandler(adminTelegramUserController.putTelegramUserAiPaused),
);
router.post(
  "/telegram-user/login/phone",
  adminAuthMiddleware,
  validate({ body: AdminTelegramUserLoginPhoneBodySchema }),
  asyncHandler(adminTelegramUserController.postTelegramUserLoginPhone),
);
router.post(
  "/telegram-user/login/code",
  adminAuthMiddleware,
  validate({ body: AdminTelegramUserLoginCodeBodySchema }),
  asyncHandler(adminTelegramUserController.postTelegramUserLoginCode),
);
router.post(
  "/telegram-user/login/password",
  adminAuthMiddleware,
  validate({ body: AdminTelegramUserLoginPasswordBodySchema }),
  asyncHandler(adminTelegramUserController.postTelegramUserLoginPassword),
);

router.post(
  "/trigger-market-calculation",
  adminAuthMiddleware,
  fullAdminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const response = await axios.post(
        `${MARKET_PRICE_CALCULATOR_URL}/calculate`,
        {},
        {
          timeout: 15000,
          validateStatus: (status) => status === 202 || status === 200,
        },
      );
      const status = response.status;
      const data = response.data as { success?: boolean; message?: string };
      res.status(status).json({
        success: data.success !== false,
        message:
          data.message || (status === 202 ? "Calculation started" : "OK"),
      });
    } catch (err) {
      const isRefused =
        axios.isAxiosError(err) &&
        (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND");
      const rawMsg = axios.isAxiosError(err)
        ? err.response?.data?.error ||
          err.response?.data?.message ||
          err.message
        : err instanceof Error
          ? err.message
          : "Calculator service unavailable";
      const msg = isRefused
        ? "Market price calculator service is not reachable. Start the service (e.g. port 9100) or set MARKET_PRICE_CALCULATOR_URL."
        : rawMsg;
      logger.warn("[Admin] trigger-market-calculation failed", {
        error: rawMsg,
        code: axios.isAxiosError(err) ? err.code : undefined,
        url: MARKET_PRICE_CALCULATOR_URL,
      });
      res.status(502).json({ success: false, error: msg });
    }
  }),
);

export default router;
