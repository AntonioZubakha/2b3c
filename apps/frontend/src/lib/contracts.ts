import type { ICart, IDiamond, IJewelry, ISetting, KycStatus, UserRole } from '@stonee/shared-types';

export type ApiDoc<T> = T & { _id: string };

export type ApiOk<T> = { success: true; data: T };
export type ApiFail = { success: false; error?: string };
export type ApiResponse<T> = ApiOk<T> | ApiFail;

export type ListResponse<T> = ApiResponse<T[]> & { count?: number };

// --- Domain docs returned by services (mongoose docs with _id) ---
export type DiamondDoc = ApiDoc<IDiamond>;
export type SettingDoc = ApiDoc<ISetting>;
export type JewelryDoc = ApiDoc<IJewelry>;
export type CartDoc = ApiDoc<ICart> | ICart; // order-service may return a synthesized cart without _id

// --- Endpoints used by the frontend ---
export type SearchFilterResponse = ApiResponse<DiamondDoc[]> & { count?: number };
export type SearchFacetsResponse = ApiResponse<unknown>;

export type JewelryCollectionsResponse = ApiResponse<JewelryDoc[]> & { count?: number };
export type JewelrySettingsResponse = ApiResponse<SettingDoc[]> & { count?: number };

export type CartGetResponse = ApiResponse<CartDoc>;
export type CartMutateResponse = ApiResponse<CartDoc>;

export type RecommendationsMatchResponse = ApiResponse<JewelryDoc[]> & { style?: string };

export type CheckoutResponse = ApiResponse<{ orderId: string }>;

export type PaymentIntentPayload = {
  clientSecret: string | null;
  amount: number;
  currency: string;
};
export type PaymentIntentCreateResponse = ApiResponse<PaymentIntentPayload>;

// Orders (shape matches order-service mongoose model output)
export type OrderStatus = 'PENDING' | 'PAID' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type OrderItem = {
  type: 'diamond' | 'setting' | 'jewelry' | 'bespoke';
  productId: string;
  bespokePair?: { diamondId?: string; settingId?: string };
  price: number;
  quantity: number;
};
export type OrderDoc = ApiDoc<{
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  shippingAddress: {
    fullName: string;
    addressLine1: string;
    city: string;
    country: string;
    zipCode: string;
  };
  paymentIntentId?: string;
  createdAt: string;
  updatedAt: string;
}>;
export type OrdersListResponse = ApiResponse<OrderDoc[]>;

/** `GET /api/user/auth/me` — пароль в ответе не приходит. */
export type AuthMeUser = {
  _id: string;
  email: string;
  role: UserRole;
  name?: string;
  supplierCategory?: string;
  kycStatus?: KycStatus;
};
export type AuthMeResponse = { success: true; user: AuthMeUser };

