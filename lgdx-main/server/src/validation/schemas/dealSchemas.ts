import { z } from "zod";
import {
  ObjectIdSchema,
  NonEmptyStringSchema,
  OptionalNonEmptyStringSchema,
  PriceSchema,
  DealStatusSchema,
  DealStageSchema,
  DealTypeSchema,
  AddressSchema,
  ShippingAddressSchema,
  DateStringSchema,
  OptionalDateStringSchema,
  FileUploadSchema,
} from "../baseSchemas";

// ---- Route Parameter Schemas ----

export const DealIdParamSchema = z.object({
  dealId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid deal ID format"),
});

export const DealActionParamsSchema = DealIdParamSchema.extend({
  actionName: z.string().min(1, "Action name is required"),
});

// ---- Deal Product Schemas ----

export const DealProductSchema = z.object({
  product: ObjectIdSchema,
  price: PriceSchema,
  quantity: z.number().int().positive().default(1),
  marketPriceAtInitiation: PriceSchema.optional(),
  originalPrice: PriceSchema.optional(),
  status: z.string().optional(),
  selectedAlternativeProduct: ObjectIdSchema.optional(),
  selectedAlternativePrice: PriceSchema.optional(),
  selectedAlternativeNotes: OptionalNonEmptyStringSchema,
  originalProductDetailsBeforeSwap: z.any().optional(),
  originalPriceBeforeSwap: PriceSchema.optional(),
  originalProductStruckOut: z.boolean().optional(),
  isValidated: z.boolean().default(false),
  validatedAt: DateStringSchema.optional(),
  validatedBy: ObjectIdSchema.optional(),
});

// ---- Deal Initiation Schemas ----

export const InitiateDealRequestSchema = z.object({
  cartItemIds: z
    .array(ObjectIdSchema)
    .min(1, "At least one cart item must be selected"),
  shippingAddress: AddressSchema,
});

export const InitiateDealResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  buyerDeal: z.any(), // Will be DealFullDto from service
  lgdealToSellerAlternativeDeals: z.array(z.string()),
  lgdealToSellerOriginalProductDeals: z.array(z.string()),
});

// ---- Deal Action Schemas ----

export const ApproveRequestSchema = z.object({
  shippingCost: PriceSchema.optional(),
  notes: OptionalNonEmptyStringSchema,
});

export const RejectRequestSchema = z.object({
  rejectionReason: NonEmptyStringSchema,
  notes: OptionalNonEmptyStringSchema,
});

export const CancelDealSchema = z.object({
  rejectionReason: z
    .string()
    .min(1, { message: "Rejection reason is required when cancelling a deal." })
    .optional(),
  notes: OptionalNonEmptyStringSchema,
});

export const UploadInvoiceSchema = z.object({
  invoiceFile: z.object({
    filename: NonEmptyStringSchema,
    originalName: NonEmptyStringSchema,
    mimetype: z.string(),
    size: z.number().positive(),
  }),
});

export const RejectInvoiceSchema = z.object({
  rejectionReason: z
    .string()
    .min(1, { message: "Rejection reason is required." }),
  notes: OptionalNonEmptyStringSchema,
});

export const UpdateShippingSchema = z.object({
  trackingNumber: OptionalNonEmptyStringSchema,
  carrier: OptionalNonEmptyStringSchema,
  estimatedDeliveryDate: OptionalDateStringSchema,
  notes: OptionalNonEmptyStringSchema,
});

export const UploadShippingDocumentsSchema = z.object({
  documents: z
    .array(FileUploadSchema)
    .min(1, "At least one shipping document is required"),
});

export const ConfirmDeliverySchema = z.object({
  deliveryDate: DateStringSchema.optional(),
  notes: OptionalNonEmptyStringSchema,
});

// ---- Deal Query Schemas ----

export const GetDealsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: DealStatusSchema.optional(),
  stage: DealStageSchema.optional(),
  dealType: DealTypeSchema.optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  dateFrom: OptionalDateStringSchema,
  dateTo: OptionalDateStringSchema,
});

export const GetDealsByUserQuerySchema = z.object({
  userId: ObjectIdSchema,
  role: z.enum(["buyer", "seller"]).optional(),
  ...GetDealsQuerySchema.shape,
});

// ---- Deal State Update Schemas ----

export const UpdateDealStatusSchema = z.object({
  status: DealStatusSchema,
  notes: OptionalNonEmptyStringSchema,
  rejectionReason: OptionalNonEmptyStringSchema, // For cancellations/rejections
});

export const UpdateDealStageSchema = z.object({
  stage: DealStageSchema,
  notes: OptionalNonEmptyStringSchema,
});

// ---- Payment Schemas ----

export const PaymentDetailsSchema = z.object({
  method: OptionalNonEmptyStringSchema,
  status: z.enum(["pending", "paid", "failed"]).optional(),
  transactionId: OptionalNonEmptyStringSchema,
  paymentDate: OptionalDateStringSchema,
  amountPaid: PriceSchema.optional(),
});

export const UpdatePaymentSchema = z.object({
  paymentDetails: PaymentDetailsSchema,
  notes: OptionalNonEmptyStringSchema,
});

// ---- Shipping Schemas ----

export const ShippingDetailsSchema = z.object({
  shippingAddress: ShippingAddressSchema.optional(),
  cost: PriceSchema.optional(),
  method: OptionalNonEmptyStringSchema,
  trackingNumber: OptionalNonEmptyStringSchema,
  estimatedDeliveryDate: OptionalDateStringSchema,
  actualDeliveryDate: OptionalDateStringSchema,
  status: z.enum(["pending", "shipped", "delivered"]).optional(),
  deliveredDate: OptionalDateStringSchema,
  carrier: OptionalNonEmptyStringSchema,
});

// ---- Activity Log Schema ----

export const ActivityLogSchema = z.object({
  timestamp: DateStringSchema,
  action: NonEmptyStringSchema,
  performedBy: ObjectIdSchema.optional(),
  details: NonEmptyStringSchema,
  previousState: z.any().optional(),
  newState: z.any().optional(),
});

// ---- Deal Response Schemas ----

export const DealSummarySchema = z.object({
  _id: ObjectIdSchema,
  dealNumber: z.string(),
  status: DealStatusSchema,
  stage: DealStageSchema,
  dealType: DealTypeSchema,
  amount: PriceSchema, // Renamed from totalAmount
  currency: z.string().default("USD"),
  createdAt: DateStringSchema,
  lastActionAt: OptionalDateStringSchema,
  buyerCompany: z.object({
    name: z.string(),
    _id: ObjectIdSchema,
  }),
  sellerCompany: z.object({
    name: z.string(),
    _id: ObjectIdSchema,
  }),
  productCount: z.number().int().nonnegative(),
});

// ---- Type Exports ----

export type InitiateDealRequest = z.infer<typeof InitiateDealRequestSchema>;
export type InitiateDealResponse = z.infer<typeof InitiateDealResponseSchema>;
export type ApproveRequest = z.infer<typeof ApproveRequestSchema>;
export type RejectRequest = z.infer<typeof RejectRequestSchema>;
export type CancelDeal = z.infer<typeof CancelDealSchema>;
export type UploadInvoice = z.infer<typeof UploadInvoiceSchema>;
export type RejectInvoice = z.infer<typeof RejectInvoiceSchema>;
export type UpdateShipping = z.infer<typeof UpdateShippingSchema>;
export type UploadShippingDocuments = z.infer<
  typeof UploadShippingDocumentsSchema
>;
export type ConfirmDelivery = z.infer<typeof ConfirmDeliverySchema>;
export type GetDealsQuery = z.infer<typeof GetDealsQuerySchema>;
export type GetDealsByUserQuery = z.infer<typeof GetDealsByUserQuerySchema>;
export type UpdateDealStatus = z.infer<typeof UpdateDealStatusSchema>;
export type UpdateDealStage = z.infer<typeof UpdateDealStageSchema>;
export type PaymentDetails = z.infer<typeof PaymentDetailsSchema>;
export type UpdatePayment = z.infer<typeof UpdatePaymentSchema>;
export type ShippingDetails = z.infer<typeof ShippingDetailsSchema>;
export type ActivityLog = z.infer<typeof ActivityLogSchema>;
export type DealSummary = z.infer<typeof DealSummarySchema>;

export const AddTrackingSchema = z.object({
  trackingNumber: z.string().nonempty("Tracking number is required"),
  carrier: z.string().optional(),
});

export const SelectAlternativeProductSchema = z.object({
  originalProductId: z.string().nonempty(),
  alternativeProductId: z.string().nonempty(),
});

export const RejectAlternativeProductSchema = z.object({
  rejectionReason: z
    .string()
    .min(1, {
      message: "Rejection reason is required when rejecting an alternative.",
    })
    .optional(),
});

export const SetShippingCostSchema = z.object({
  shippingCost: PriceSchema,
});

export const SetImportTariffSchema = z.object({
  importTariff: PriceSchema,
});
