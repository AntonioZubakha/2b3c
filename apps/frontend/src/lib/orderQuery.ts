import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiJson, GATEWAY } from './api';
import type { CartDoc, CartGetResponse } from './contracts';

/** TanStack Query keys for order-service–backed state (cart, etc.). */
export const orderQueryKeys = {
  all: ['order'] as const,
  carts: () => [...orderQueryKeys.all, 'cart'] as const,
  cart: (sessionId: string) => [...orderQueryKeys.carts(), sessionId] as const,
};

export async function fetchCartBySession(sessionId: string): Promise<CartDoc | null> {
  const json = (await apiJson<CartDoc>(`${GATEWAY.order}/cart/${sessionId}`)) as CartGetResponse;
  if (!json.success) return null;
  return json.data;
}

export type CartQueryData = Awaited<ReturnType<typeof fetchCartBySession>>;

export function useCartQuery(
  sessionId: string,
  options?: Pick<
    UseQueryOptions<CartQueryData, Error, CartQueryData, ReturnType<typeof orderQueryKeys.cart>>,
    'enabled' | 'staleTime'
  >,
) {
  return useQuery({
    queryKey: orderQueryKeys.cart(sessionId),
    queryFn: () => fetchCartBySession(sessionId),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 20_000,
    refetchOnMount: 'always',
  });
}
