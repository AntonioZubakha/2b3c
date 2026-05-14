import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from 'react';
import { Deal } from '../../../types';
import { getDealDetails, performDealAction } from '../../../api/dealApi';
import type { DealJsonActionName } from '../../../api/dealApi';
import { useDealUpdates } from '../../../hooks/useSocket';
import { logger } from '../../../utils/logger';

interface DealContextType {
  deal: Deal | null;
  isLoading: boolean;
  error: string | null;
  setDeal: (deal: Deal) => void;
  setError: (error: string | null) => void;
  fetchDealDetails: () => Promise<void>;
  handleDealAction: (actionName: DealJsonActionName, payload?: Record<string, unknown>) => Promise<void>;
}

const DealContext = createContext<DealContextType | undefined>(undefined);

export const useDeal = (): DealContextType => {
  const context = useContext(DealContext);
  if (!context) {
    throw new Error('useDeal must be used within a DealProvider');
  }
  return context;
};

interface DealProviderProps {
  children: ReactNode;
  dealId: string;
}

export const DealProvider: React.FC<DealProviderProps> = ({ children, dealId }) => {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Ref for debounced background refetch timer
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDealDetails = useCallback(async (): Promise<void> => {
    if (!dealId) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const dealData = await getDealDetails(dealId);
      setDeal(dealData);
    } catch (err: unknown) {
      let errorMessage = 'Failed to load deal details.';
      if (err instanceof Error) errorMessage = err.message;
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  /**
   * Handles real-time deal updates from WebSocket.
   *
   * Strategy: merge the incoming socket data (which has correct embedded fields
   * like shippingCost, status, stage, etc.) with the *current* deal state so
   * that allowedActions / dealState / userRole — fields only the REST endpoint
   * computes — are preserved from the previous state rather than wiped.
   * A debounced background refetch then retrieves the fully-authoritative deal
   * including freshly-computed allowedActions for the current viewer.
   */
  const handleDealUpdate = useCallback((dealFromSocket: Deal) => {
    logger.debug('[DealContext] Received real-time deal update via WebSocket', {
      dealId: dealFromSocket._id,
      status: dealFromSocket.status,
      stage: dealFromSocket.stage,
    });

    // Merge socket payload into current state, preserving role-specific fields
    // that the server computes per-viewer and that the raw socket data lacks.
    setDeal(prev => {
      if (!prev) return dealFromSocket;
      return {
        ...prev,
        ...dealFromSocket,
        // Preserve viewer-specific computed fields from previous state
        allowedActions:   prev.allowedActions,
        dealState:        prev.dealState,
        userRole:         prev.userRole,
        isDirectLgdealDeal: prev.isDirectLgdealDeal,
      };
    });

    // Debounced background refetch (300 ms) to get freshly-computed
    // allowedActions / dealState from the REST endpoint.
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(async () => {
      try {
        const fullDeal = await getDealDetails(dealId);
        setDeal(fullDeal);
        logger.debug('[DealContext] Background refetch complete – allowedActions updated', { dealId });
      } catch (err) {
        logger.warn('[DealContext] Background refetch failed after WebSocket update', {
          dealId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, 300);
  }, [dealId]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    };
  }, []);

  // Subscribe to deal updates via WebSocket
  useDealUpdates(dealId, handleDealUpdate);

  // Initial fetch on mount
  useEffect(() => {
    fetchDealDetails();
  }, [fetchDealDetails]);

  const handleDealAction = useCallback(async (actionName: DealJsonActionName, payload: Record<string, unknown> = {}): Promise<void> => {
    if (!deal) return;

    setIsLoading(true);
    setError(null);
    try {
      const updatedDeal = await performDealAction(deal._id, actionName, payload);
      setDeal(updatedDeal);
    } catch (err: unknown) {
      let errorMessage = `Failed to perform action: ${actionName}`;
      if (err instanceof Error) errorMessage = err.message;
      setError(errorMessage);
      throw err; // Re-throw to allow components to handle it
    } finally {
      setIsLoading(false);
    }
  }, [deal]);

  const value = useMemo<DealContextType>(() => ({
    deal,
    isLoading,
    error,
    setDeal,
    setError,
    fetchDealDetails,
    handleDealAction,
  }), [deal, isLoading, error, fetchDealDetails, handleDealAction]);

  return <DealContext.Provider value={value}>{children}</DealContext.Provider>;
}; 