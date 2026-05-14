import api from '.';

export interface StripePaymentIntent {
  id: string;
  clientSecret: string;
  amount: number;
  currency: string;
  status: string;
}

export interface CreatePaymentIntentRequest {
  amount?: number;
  currency?: string;
}

export interface CreatePaymentIntentResponse {
  success: boolean;
  paymentIntent: StripePaymentIntent;
}

export interface CheckPaymentStatusResponse {
  success: boolean;
  paymentIntent: {
    id: string;
    status: string;
    amount: number;
    currency: string;
  };
  dealStatus: string;
}

export interface StripePublishableKeyResponse {
  success: boolean;
  publishableKey: string;
}

/**
 * Получает публичный ключ Stripe
 */
export const getStripePublishableKey = async (): Promise<string> => {
  const response = await api.get<StripePublishableKeyResponse>('/stripe/publishable-key');
  return response.data.publishableKey;
};

/**
 * Создает Payment Intent для оплаты сделки
 */
export const createStripePaymentIntent = async (
  dealId: string,
  data: CreatePaymentIntentRequest = {}
): Promise<StripePaymentIntent> => {
  const response = await api.post<CreatePaymentIntentResponse>(
    `/stripe/payment-intent/${dealId}`,
    data
  );
  return response.data.paymentIntent;
};

/**
 * Проверяет статус платежа и обновляет статус сделки
 */
export const checkPaymentStatus = async (dealId: string): Promise<CheckPaymentStatusResponse> => {
  const response = await api.post<CheckPaymentStatusResponse>(`/stripe/payment-intent/${dealId}/check-status`);
  return response.data;
};
