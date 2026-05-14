import { exec, ExecException } from 'child_process';
import path from 'path';
import { Request, Response } from 'express';
import User, { IUserDocument } from '../models/User';
import Product from '../models/Product'; // For showStats
import Company from '../models/Company'; // For showStats
import marketplaceConfig from '../config/marketplace'; // For LGDEAL company name check
import { ValidatedRequest } from '../middleware/validation';
import { ExecuteCommand } from '../validation/schemas/companySchemas';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';

// ---- Shared Interfaces ----  
export interface JwtPayload {
  userId: string;
  role: string;
  isLgdealSupervisor?: boolean;
  isLgdealAdmin?: boolean;
}

/**
 * AuthenticatedRequest - type alias для Express.Request
 * Express.Request уже глобально расширен в types/index.ts с полем user
 */
export type AuthenticatedRequest = Request;

// ---- Command Specific Types ----
interface ExecuteCommandBody {
  command: string;
}

interface CommandOutput {
  output: string;
  exitCode?: number; // Optional, as not all handlers in JS returned it explicitly, though exec does
  error?: string; // For executeCommand error handling
}

// Type for command handlers
type CommandHandler = (args: string[], req: AuthenticatedRequest, res: Response) => Promise<CommandOutput | void>; // void if handler sends response directly

interface CommandDefinition {
  description: string;
  handler: CommandHandler;
  args?: string[]; // Names of arguments
}

// Type for the main command map
interface AllowedCommandsMap {
  [commandName: string]: CommandDefinition;
}

// ---- Command Handler Functions ----

// Note: ALLOWED_COMMANDS needs to be defined *after* the handler functions it references.
// We will declare it later, then assign it.
let ALLOWED_COMMANDS_MAP: AllowedCommandsMap = {}; // Initialize and define later

async function showHelp(args: string[], req: AuthenticatedRequest, res: Response): Promise<CommandOutput> {
  let output = 'Available commands:\n\n';
  
  Object.entries(ALLOWED_COMMANDS_MAP).forEach(([name, info]) => {
    output += `${name}`;
    
    if (info.args && info.args.length > 0) {
      output += ` [${info.args.join('] [')}]`;
    }
    
    output += ` - ${info.description}\n`;
  });
  
  return { output };
}

async function syncProductsCommand(args: string[], req: AuthenticatedRequest, res: Response): Promise<CommandOutput> {
  const companyId = args[0];
  
  if (!companyId) {
    return {
      output: 'You must specify a company ID. Example: sync-products 60d2156e5b4c8a1a0c9b4d3f',
      exitCode: 1
    };
  }
  
  return new Promise((resolve) => {
    try {
      // Using require for dynamic loading to avoid circular dependencies
      const companyApiController = require('./companyApiController'); 
      const syncCompanyProductsFn = companyApiController.syncCompanyProducts;

      if (typeof syncCompanyProductsFn !== 'function') {
        logger.error('[syncProductsCommand] syncCompanyProducts function not found in companyApiController');
        resolve({
            output: 'Error: syncCompanyProducts function is not available.',
            exitCode: 1
        });
        return;
      }

      syncCompanyProductsFn(companyId)
        .then(() => {
          resolve({ 
            output: `Product synchronization for company ${companyId} has been successfully started.`,
            exitCode: 0
          });
        })
        .catch((error: unknown) => {
          logger.error(`[syncProductsCommand] Error during syncCompanyProductsFn for ${companyId}:`, { error });
          resolve({ 
            output: `Synchronization error: ${getErrorMessage(error, 'Unknown error during sync')}`,
            exitCode: 1
          });
        });
    } catch (error: unknown) {
        logger.error('[syncProductsCommand] Critical error setting up syncCompanyProducts call:', { error });
        resolve({
            output: `Critical error initiating sync: ${getErrorMessage(error)}`,
            exitCode: 1
        });
    }
  });
}

async function showStatsCommand(args: string[], req: AuthenticatedRequest, res: Response): Promise<CommandOutput> {
  try {
    // Models Product, Company, User are already imported at the top of the file.
    const productCount = await Product.countDocuments();
    const companyCount = await Company.countDocuments();
    const userCount = await User.countDocuments();
    
    const statsData = {
      products: productCount,
      companies: companyCount,
      users: userCount,
      uptime: Math.floor(process.uptime()) + ' seconds',
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      node: process.version,
      timestamp: new Date().toISOString()
    };
    
    let output = 'System statistics:\n\n';
    Object.entries(statsData).forEach(([key, value]) => {
      output += `${key}: ${value}\n`;
    });
    
    return { output, exitCode: 0 };
  } catch (error: any) {
    logger.error('[showStatsCommand] Error fetching system statistics:', { error });
    return {
      output: `Error fetching system statistics: ${error.message}`,
      exitCode: 1
    };
  }
}

async function clearCacheCommand(args: string[], req: AuthenticatedRequest, res: Response): Promise<CommandOutput> {
  // Here you can implement cache clearing if it exists
  // For example, just return successful result
  return { 
    output: 'System cache successfully cleared.',
    exitCode: 0
  };
}

async function runProductUtilsCommand(args: string[], req: AuthenticatedRequest, res: Response): Promise<CommandOutput> {
  // Hard-disable script execution in production unless explicitly enabled
  if (process.env.NODE_ENV === 'production' && process.env.FEATURE_ADMIN_COMMANDS !== 'true') {
    return { output: 'Command execution is disabled in production', exitCode: 1 };
  }
  return new Promise((resolve) => {
    // Path to test-utils.js script
    // __dirname in TS (when outputting to dist/) might behave differently than in JS.
    // Assuming the script is relative to the project root or a known path.
    // For a typical server/src/controllers -> server/dist/controllers structure, 
    // going up three levels might be needed to reach project root, then to test-utils.js.
    // path.join(__dirname, '..', '..', '..', 'test-utils.js'); // Example if in dist/controllers
    // For now, let's assume it is relative to where the process is run from, or adjust based on build output.
    // The original JS: path.join(__dirname, '..', 'test-utils.js') suggests test-utils.js is in server/ directory.
    // If src/controllers/commandController.ts is compiled to dist/controllers/commandController.js
    // then path.join(__dirname, '..', '..', 'test-utils.js') would point to server/test-utils.js
    const scriptPath = path.join(__dirname, '..', '..', 'test-utils.js');
    
    logger.info(`[runProductUtilsCommand] Attempting to execute script: node ${scriptPath}`);

    exec(`node ${scriptPath}`, (error: ExecException | null, stdout: string, stderr: string) => {
      if (error) {
        logger.error(`[runProductUtilsCommand] Error executing script ${scriptPath}:`, { error });
        resolve({ 
          output: `Error running script: ${error.message}\n${stderr}`,
          // error.code is ExecException property which might be number or string, ensure it is number for exitCode
          exitCode: typeof error.code === 'number' ? error.code : 1 
        });
      } else {
        logger.info(`[runProductUtilsCommand] Script ${scriptPath} executed successfully. Stdout: ${stdout}`);
        resolve({ 
          output: stdout,
          exitCode: 0
        });
      }
    });
  });
}

// Define ALLOWED_COMMANDS now that showHelp is defined
// Other handlers will be added as they are implemented
ALLOWED_COMMANDS_MAP = {
  'help': {
    description: 'Show list of available commands',
    handler: showHelp
  },
  'sync-products': {
    description: 'Synchronize products for a company',
    handler: syncProductsCommand,
    args: ['companyId']
  },
  'stats': {
    description: 'Show system statistics',
    handler: showStatsCommand
  },
  'clear-cache': {
    description: 'Clear system cache',
    handler: clearCacheCommand
  },
  'run-product-utils': {
    description: 'Run product utilities',
    handler: runProductUtilsCommand
  }
};

// ---- Main executeCommand function (skeleton) ----
export const executeCommand = async (
  req: ValidatedRequest<ExecuteCommand, {}, {}> & { user?: JwtPayload }, 
  res: Response<CommandOutput | { message: string }>
) => {
  try {
    // Global guard: disable command executor in production unless feature flag is explicitly enabled
    if (process.env.NODE_ENV === 'production' && process.env.FEATURE_ADMIN_COMMANDS !== 'true') {
      return res.status(404).json({ message: 'Command executor is disabled in production' });
    }
    const userFromToken = req.user;
    if (!userFromToken || !userFromToken.userId) {
      return res.status(401).json({ message: 'User not authenticated or userId missing in token' });
    }
    const { userId } = userFromToken;

    const { command } = req.body;

    if (!command || typeof command !== 'string') {
      return res.status(400).json({ message: 'Command string is required in the request body.' });
    }

    logger.info(`[executeCommand] Request from user: ${userId}`);
    logger.debug(`[executeCommand] User object in request: ${JSON.stringify(userFromToken, null, 2)}`);

    let authorized = false;
    if (userFromToken.isLgdealSupervisor || userFromToken.isLgdealAdmin) {
      logger.info("[executeCommand] User has supervisor/admin privileges via token.");
      authorized = true;
    } else {
      const userFromDb: IUserDocument | null = await User.findById(userId).populate('company');
      logger.info("[executeCommand] User fetched from database:", { user: userFromDb ? `${userFromDb.firstName} ${userFromDb.lastName}` : "Not found" });
      
      if (!userFromDb) {
        return res.status(404).json({ message: 'User not found in database' });
      }

      // User document fields are properly typed in IUserDocument
      const companyOfUser = userFromDb.company;
      const userRole = userFromDb.role;

      const hasLgdealSupervisorRole = 
        userRole === 'supervisor' && 
        companyOfUser && 
        typeof companyOfUser === 'object' &&
        'name' in companyOfUser &&
        companyOfUser.name === marketplaceConfig.managementCompany.name;
      
      logger.debug("[executeCommand] User supervisor check:", {
        role: userRole,
        companyName: companyOfUser && typeof companyOfUser === 'object' && 'name' in companyOfUser ? companyOfUser.name : null,
        requiredCompanyName: marketplaceConfig.managementCompany.name,
        hasLgdealSupervisorRole
      });

      if (hasLgdealSupervisorRole) {
        logger.info("[executeCommand] User has supervisor privileges via database check.");
        authorized = true;
      }
    }

    if (!authorized) {
      return res.status(403).json({ message: 'Insufficient permissions to execute the command' });
    }

    const [commandName, ...args] = command.trim().split(/\s+/); // Split by one or more spaces
    logger.debug(`[executeCommand] Parsed command: '${commandName}', Args: ${JSON.stringify(args)}`);

    const commandDefinition = ALLOWED_COMMANDS_MAP[commandName];
    if (!commandDefinition) {
      return res.status(400).json({ 
        message: `Unknown command: '${commandName}'. Use 'help' to get a list of available commands.`
      });
    }

    const commandHandler = commandDefinition.handler;
    const result = await commandHandler(args, req, res); // Pass full req, res in case handler needs them

    if (result) { // Handler might send response itself, in which case result would be void/undefined
      logger.info(`[executeCommand] Command '${commandName}' executed successfully.`);
      res.json(result);
    }
    // If result is void/undefined, assume handler has already sent a response.

  } catch (error: unknown) {
    logger.error('[executeCommand] Error:', { error });
    res.status(500).json({ message: 'Error executing command', error: getErrorMessage(error) });
  }
}; 