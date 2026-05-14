import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getCookie } from '../utils/cookies';
import { logger } from '../utils/logger';
import { Deal } from '../types';

// Socket.io configuration - use current origin to go through nginx
const SOCKET_URL = window.location.origin;

type SocketEntry = {
  socket: Socket;
  refs: number;
  disconnectTimer: number | null;
};

const SOCKET_CACHE = new Map<string, SocketEntry>();

const DISCONNECT_GRACE_MS = 15_000;

function getOrCreateSocket(namespace: string): SocketEntry {
  const existing = SOCKET_CACHE.get(namespace);
  if (existing) return existing;

  const authToken = getCookie('authToken');

  const s = io(`${SOCKET_URL}${namespace}`, {
    withCredentials: true,
    auth: authToken ? { token: authToken } : undefined,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  });

  const entry: SocketEntry = { socket: s, refs: 0, disconnectTimer: null };
  SOCKET_CACHE.set(namespace, entry);
  return entry;
}

/**
 * Custom hook for Socket.io connection
 * @param namespace - Socket.io namespace (default: '/')
 * @returns Socket instance (null until connected, so components re-render and can subscribe)
 */
export const useSocket = (namespace = '/'): Socket | null => {
  const [socket, setSocket] = useState<Socket | null>(() => {
    // Provide cached socket immediately to avoid first-render null.
    const entry = SOCKET_CACHE.get(namespace);
    return entry?.socket ?? null;
  });

  useEffect(() => {
    logger.debug('🔌 [useSocket] Initializing connection', { namespace });

    const entry = getOrCreateSocket(namespace);
    entry.refs += 1;

    // Cancel pending disconnect if we remounted within grace window.
    if (entry.disconnectTimer != null) {
      window.clearTimeout(entry.disconnectTimer);
      entry.disconnectTimer = null;
    }

    const s = entry.socket;
    setSocket(s);

    logger.debug('🔧 [useSocket] Socket acquired', {
      namespace,
      url: `${SOCKET_URL}${namespace}`,
      connected: s.connected,
      id: s.id,
      refs: entry.refs
    });

    const onConnect = () => {
      logger.debug('✅ [useSocket] Connected to socket.io', { namespace, socketId: s.id, connected: s.connected });
    };

    const onConnectError = (error: unknown) => {
      let message: string | undefined;
      if (error instanceof Error) message = error.message;
      else if (typeof error === 'object' && error !== null && 'message' in error) {
        const maybeMessage = (error as { message?: unknown }).message;
        message = typeof maybeMessage === 'string' ? maybeMessage : undefined;
      }

      const err = error instanceof Error ? error : new Error(message ?? String(error));
      logger.error('❌ [useSocket] Connection error', err, { namespace });
    };

    const onDisconnect = (reason: string) => {
      logger.warn('⚠️ [useSocket] Disconnected', { namespace, reason, id: s.id });
    };

    s.on('connect', onConnect);
    s.on('connect_error', onConnectError);
    s.on('disconnect', onDisconnect);

    return () => {
      logger.debug('🧹 [useSocket] Cleanup for namespace', { namespace });

      // Detach listeners for this hook instance (socket may stay alive).
      s.off('connect', onConnect);
      s.off('connect_error', onConnectError);
      s.off('disconnect', onDisconnect);

      const current = SOCKET_CACHE.get(namespace);
      if (!current) {
        setSocket(null);
        return;
      }

      current.refs = Math.max(0, current.refs - 1);

      if (current.refs === 0) {
        // Delay disconnect to survive quick remounts/navigation/React tree resets.
        current.disconnectTimer = window.setTimeout(() => {
          const latest = SOCKET_CACHE.get(namespace);
          if (!latest || latest.refs !== 0) return;

          logger.debug('🧹 [useSocket] Disconnecting cached socket', { namespace });
          latest.socket.disconnect();
          SOCKET_CACHE.delete(namespace);
        }, DISCONNECT_GRACE_MS);
      }

      setSocket(null);
    };
  }, [namespace]);

  return socket;
};

/**
 * Custom hook for subscribing to deal updates
 * @param dealId - Deal ID to subscribe to
 * @param onUpdate - Callback function when deal is updated
 */
export const useDealUpdates = (
  dealId: string | null | undefined,
  onUpdate: (deal: Deal) => void
) => {
  // Use default namespace for maximum compatibility/stability in production.
  const socket = useSocket('/');
  // Use ref to store the latest callback without triggering re-subscription
  const onUpdateRef = useRef(onUpdate);

  // Update ref when callback changes
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!socket || !dealId) {
      logger.warn('⚠️ [useDealUpdates] useEffect skipped', { hasSocket: !!socket, dealId });
      return;
    }

    // Stable handler that always calls the latest callback
    const handleUpdate = (deal: Deal) => {
      logger.debug('📬 [useDealUpdates] Received deal_updated event', { dealId: deal._id || dealId });
      onUpdateRef.current(deal);
    };

    // Re-subscribe on every connect/reconnect so server-side room membership
    // is always fresh (Socket.IO rooms are reset on reconnect).
    const subscribe = () => {
      socket.emit('subscribe_deal', { dealId });
      logger.debug('📡 [useDealUpdates] (Re-)subscribed to deal', { dealId });
    };

    logger.debug('🔧 [useDealUpdates] Setting up deal subscription', {
      dealId,
      socketId: socket.id,
      connected: socket.connected
    });

    socket.on('deal_updated', handleUpdate);

    // Use socket.on (not once) so the handler fires on every reconnect,
    // not just the initial connection.
    socket.on('connect', subscribe);

    // Subscribe immediately if already connected.
    if (socket.connected) {
      subscribe();
    }

    return () => {
      logger.debug('🧹 [useDealUpdates] Cleaning up subscription', { dealId });
      socket.off('deal_updated', handleUpdate);
      socket.off('connect', subscribe);
    };
  }, [socket, dealId]);

  return { socket };
};
