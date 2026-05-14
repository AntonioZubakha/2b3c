import mongoose, { Schema, Document, Types } from 'mongoose';
import { 
    IDeal, 
    IDealProduct, 
    IShippingDetails, 
    IShippingAddress,
    IRequestDetails, 
    IActivityLog,
    INegotiationDetails,
    IProposedTerm,
    IProposedTermProduct,
    IFinalNegotiationTerms,
    IUser,
    IProduct,
    IPaymentDetails,
    IRejectedInvoice
} from '../types';

// Снапшот продукта для отображения в сделке (если продукт удалён из каталога)
const ProductDisplaySnapshotSchema = new Schema({
  shape: { type: String },
  carat: { type: Number },
  color: { type: String },
  clarity: { type: String },
  certificateNumber: { type: String },
  certificateInstitute: { type: String },
  location: { type: String },
}, { _id: false });

// Схема для продуктов в сделке
const DealProductSchema = new Schema<IDealProduct>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  productSnapshot: { type: ProductDisplaySnapshotSchema },
  price: { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  marketPriceAtInitiation: { type: Number },
  suggestedAlternatives: [{
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    pairedLgdealToSellerDealId: { type: Schema.Types.ObjectId, ref: 'Deal' },
    _id: false
  }],
  originalProductStruckOut: { type: Boolean, default: false },
  originalPriceBeforeSwap: { type: Number },
  originalShippingCostBeforeSwap: { type: Number },
  selectedAlternativeProduct: { type: Schema.Types.ObjectId, ref: 'Product' },
  originalProductDetailsBeforeSwap: { type: Schema.Types.Mixed },

}, { _id: false });

// Схема для адреса доставки (внутри ShippingDetails)
const ShippingAddressSchema = new Schema<IShippingAddress>({
    recipientName: { type: String },
    companyName: { type: String },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    stateProvinceRegion: { type: String },
    postalCode: { type: String },
    country: { type: String, required: true },
    phone: { type: String },
    email: { type: String },
}, { _id: false });

// Схема для деталей доставки
const ShippingDetailsSchema = new Schema<IShippingDetails>({
  shippingAddress: ShippingAddressSchema,
  cost: { type: Number, default: 0 },
  importTariff: { type: Number, default: 0 },
  method: { type: String },
  trackingNumber: { type: String },
  estimatedDeliveryDate: { type: Date },
  deliveredDate: { type: Date },
  status: { type: String },
  deliveryConfirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  carrier: { type: String }
}, { _id: false });

// Схема для деталей запроса
const RequestDetailsSchema = new Schema<IRequestDetails>({
  requestDate: { type: Date, default: Date.now, required: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  notes: { type: String },
  rejectionReason: { type: String },
}, { _id: false });

// Схема для лога активности
const ActivityLogSchema = new Schema<IActivityLog>({
  timestamp: { type: Date, default: Date.now, required: true },
  action: { type: String, required: true },
  performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  details: { type: String, required: true },
  previousState: { type: Schema.Types.Mixed },
  newState: { type: Schema.Types.Mixed },
}, { _id: false });

// Новые схемы для деталей переговоров
const ProposedTermProductSchema = new Schema<IProposedTermProduct>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  price: { type: Number, required: true },
  originalPrice: { type: Number, required: true },
  discountPercent: { type: Number, required: true },
}, { _id: false });

const ProposedTermSchema = new Schema<IProposedTerm>({
  proposedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  proposedDate: { type: Date, default: Date.now, required: true },
  price: { type: Number },
  products: [ProposedTermProductSchema],
  deliveryTerms: { type: String },
  additionalTerms: { type: String },
  status: { type: String, enum: ['proposed', 'accepted', 'rejected', 'countered'], required: true },
  shippingCost: { type: Number },
}, { _id: false });

const FinalNegotiationTermsSchema = new Schema<IFinalNegotiationTerms>({
  price: { type: Number, required: true },
  products: [ProposedTermProductSchema],
  deliveryTerms: { type: String },
  additionalTerms: { type: String },
  acceptedDate: { type: Date, required: true },
  shippingCost: { type: Number },
}, { _id: false });

const NegotiationDetailsSchema = new Schema<INegotiationDetails>({
  startDate: { type: Date },
  proposedTerms: [ProposedTermSchema],
  endDate: { type: Date },
  finalTerms: FinalNegotiationTermsSchema,
}, { _id: false });

// +++ НОВЫЕ СХЕМЫ ДЛЯ ДЕТАЛЕЙ ПЛАТЕЖА +++
const RejectedInvoiceSchema = new Schema<IRejectedInvoice>({
  date: { type: Date, required: true },
  reason: { type: String, required: true },
  rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  originalFilename: { type: String } 
}, { _id: false });

const PaymentDetailsSchema = new Schema<IPaymentDetails>({
  invoiceFilename: { type: String },
  method: { type: String }, // 'bank_transfer' | 'stripe'
  status: { type: String }, // e.g., 'pending', 'paid', 'failed'
  transactionId: { type: String },
  paymentDate: { type: Date },
  amountPaid: { type: Number },
  rejectedInvoices: [RejectedInvoiceSchema],
  uploadedByCompany: { type: String }, // ID или название компании, загрузившей инвойс
  
  // Stripe-specific fields
  stripePaymentIntentId: { type: String },
  stripeClientSecret: { type: String },
  stripeStatus: { type: String },
  stripeChargeId: { type: String },
  stripeRefundId: { type: String }
}, { _id: false });
// +++ КОНЕЦ НОВЫХ СХЕМ ДЛЯ ДЕТАЛЕЙ ПЛАТЕЖА +++

// Основная схема сделки
const DealSchema = new Schema<IDeal>({
    dealNumber: { type: String, unique: true, required: true },
    status: { type: String, required: true, default: 'pending' },
    stage: { type: String, required: true, default: 'request' },
    dealType: { type: String, required: true },
    
    amount: { type: Number, required: true },
    fee: { type: Number, required: true },

    buyerId: { type: Schema.Types.ObjectId, ref: 'User' }, 
    sellerId: { type: Schema.Types.ObjectId, ref: 'User' },
    
    buyerCompanyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    sellerCompanyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    
    products: [DealProductSchema],
    
    shippingDetails: ShippingDetailsSchema,
    requestDetails: RequestDetailsSchema,
    activityLog: [ActivityLogSchema],
    negotiationDetails: NegotiationDetailsSchema,
    paymentDetails: PaymentDetailsSchema,
    
    pairedDealId: { type: Schema.Types.ObjectId, ref: 'Deal' },
    pairedDealIds: [{ type: Schema.Types.ObjectId, ref: 'Deal' }],
    
    lastActionAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    cancellationReason: { type: String, default: null },
    notificationSentForPendingProducts: { type: Boolean, default: false },

    // Field to track which lgdeal-to-seller deal is currently active for this buyer-to-lgdeal deal,
    // especially after an alternative product swap.
    activePurchaseDealId: { type: Schema.Types.ObjectId, ref: 'Deal', default: null },

    // LGDEAL Internal Workflow fields (для internal assignment)
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assignedRole: { type: String, enum: ['manager', 'logist'], required: false, index: true },
    assignedAt: { type: Date, default: null },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignmentHistory: [{
        assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        assignedRole: { type: String, enum: ['manager', 'logist'], required: true },
        assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        assignedAt: { type: Date, default: Date.now, required: true },
        reassignmentReason: { type: String },
        autoAssigned: { type: Boolean, default: false },
        autoAssignmentReason: { type: String },
        _id: false
    }],

    metadata: {
        dashboardDealType: { type: String }
    }

}, {
    timestamps: true
});

DealSchema.pre('save', function(this: IDeal, next) {
  if (this.isModified('status') || this.isNew) {
    this.lastActionAt = new Date();
  }
  next();
});

export default mongoose.model<IDeal>('Deal', DealSchema); 