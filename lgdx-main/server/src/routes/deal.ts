import { Router } from "express";
import {
  getBuyerDeals,
  getSellerDeals,
  getDealById,
  getSupervisorDashboardDeals,
  downloadInvoice,
} from "../controllers/deal/retrievalController";
import { getDealState } from "../controllers/deal/stateController";
import { initiateDealFromCart } from "../controllers/deal/initiationController";
import { handleDealAction } from "../controllers/deal/actionController";
import {
  getLgdealManagers,
  getLgdealLogists,
  getLgdealManagersCount,
} from "../controllers/deal/lgdealHelperController";

// Corrected Auth Imports
import auth, {
  fullAccessMiddleware,
  lgdealSupervisorOnly as supervisorAuth,
} from "../middleware/auth";

import { validate } from "../middleware/validation";
import {
  InitiateDealRequestSchema,
  DealIdParamSchema,
  DealActionParamsSchema,
} from "../validation/schemas/dealSchemas";
import upload from "../middleware/upload";

const validateDealId = validate({ params: DealIdParamSchema });
const validateDealAction = validate({ params: DealActionParamsSchema });

const router = Router();

// --- Deal Retrieval Routes ---
router.get("/buyer", auth, getBuyerDeals);
router.get("/seller", auth, getSellerDeals);
router.get(
  "/supervisor-dashboard",
  auth,
  supervisorAuth,
  getSupervisorDashboardDeals,
);

// Legacy routes for backward compatibility with client
router.get("/dashboard", auth, getSupervisorDashboardDeals);
router.get("/buyer-to-lgdeal", auth, getBuyerDeals);
router.get("/lgdeal-to-seller", auth, getSellerDeals);

router.get("/:dealId", auth, validateDealId, getDealById);
router.get("/:dealId/state", auth, validateDealId, getDealState);
router.get("/:dealId/invoice/download", auth, validateDealId, downloadInvoice);

// --- LGDEAL Helper Routes ---
// Get list of managers for assignment (LGDEAL supervisors only)
router.get("/lgdeal/managers", auth, supervisorAuth, getLgdealManagers);
// Get count of managers (for UI logic)
router.get(
  "/lgdeal/managers/count",
  auth,
  supervisorAuth,
  getLgdealManagersCount,
);
// Get list of logists for assignment (LGDEAL managers and supervisors)
router.get("/lgdeal/logists", auth, getLgdealLogists);

// --- Deal Initiation Routes ---
router.post(
  "/initiate-from-cart",
  fullAccessMiddleware,
  validate({ body: InitiateDealRequestSchema }),
  initiateDealFromCart,
);

// --- Deal State Modification Routes (Unified) ---

// This single route handles all deal actions.
// The multer middleware is applied conditionally inside the action handler for uploads.
router.post(
  "/:dealId/action/:actionName",
  fullAccessMiddleware,
  validateDealAction,
  // Apply multer middleware conditionally based on actionName.
  (req, res, next) => {
    if (req.params.actionName === "upload_invoice") {
      upload.single("invoice")(req, res, (err: unknown) => {
        if (!err) {
          next();
          return;
        }
        const e = err instanceof Error ? err : new Error(String(err));
        const multerCode =
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          typeof (err as { code: unknown }).code === "string"
            ? (err as { code: string }).code
            : undefined;
        if (e.message.includes("File type")) {
          return res.status(415).json({
            message: e.message,
            error: "Unsupported Media Type",
          });
        }
        if (
          e.message.includes("File too large") ||
          multerCode === "LIMIT_FILE_SIZE"
        ) {
          return res.status(413).json({
            message: "File size exceeds the 5MB limit",
            error: "Payload Too Large",
          });
        }
        // Malformed multipart, wrong field name, etc. — avoid opaque 500 from global handler
        return res.status(400).json({
          message: e.message || "Invoice upload failed",
          error: "Bad Request",
        });
      });
    } else {
      next();
    }
  },
  handleDealAction,
);

export default router;
