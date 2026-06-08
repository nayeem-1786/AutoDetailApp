'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { toast } from 'sonner';
import type { Reader } from '@stripe/terminal-js';

interface ReaderContextType {
  connectedReader: Reader | null;
  isConnecting: boolean;
  connectionError: string | null;
  discoverAndConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
}

const ReaderContext = createContext<ReaderContextType | null>(null);

export function ReaderProvider({ children }: { children: ReactNode }) {
  const [connectedReader, setConnectedReader] = useState<Reader | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const isConnectingRef = useRef(false);

  // Auto-connect on mount
  useEffect(() => {
    let mounted = true;

    async function autoConnect() {
      setIsConnecting(true);
      isConnectingRef.current = true;

      try {
        const { ensureConnected } = await import('../lib/stripe-terminal');
        const reader = await ensureConnected();

        if (mounted) {
          setConnectedReader(reader);
          localStorage.setItem('pos_reader_id', reader.id);
        }
      } catch (err) {
        if (mounted) {
          const message = err instanceof Error ? err.message : 'Failed to connect';
          console.warn('[ReaderContext] Auto-connect failed:', message);
          // Don't set error on auto-connect failure - just log it
        }
      } finally {
        if (mounted) {
          setIsConnecting(false);
          isConnectingRef.current = false;
        }
      }
    }

    autoConnect();

    return () => {
      mounted = false;
    };
  }, []);

  const discoverAndConnect = useCallback(async () => {
    // Prevent concurrent connection attempts
    if (isConnectingRef.current) return;

    setIsConnecting(true);
    isConnectingRef.current = true;
    setConnectionError(null);

    try {
      // Reset the Terminal SDK to clear stale state (fixes PWA sleep/wake issues)
      const stripeTerminal = await import('../lib/stripe-terminal');
      await stripeTerminal.resetTerminal();

      const reader = await stripeTerminal.ensureConnected();
      setConnectedReader(reader);
      localStorage.setItem('pos_reader_id', reader.id);
      toast.success(`Connected to ${reader.label || 'card reader'}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to reader';
      setConnectionError(message);
      toast.error(`Reader: ${message}`, { duration: 4000 });
    } finally {
      setIsConnecting(false);
      isConnectingRef.current = false;
    }
  }, []);

  // Re-check connection when page becomes visible (PWA resume from background)
  useEffect(() => {
    let reconnectAttempted = false;

    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') {
        reconnectAttempted = false;
        return;
      }
      if (reconnectAttempted || isConnectingRef.current) return;
      reconnectAttempted = true;

      try {
        const { isReaderConnected } = await import('../lib/stripe-terminal');
        const stillConnected = await isReaderConnected();
        if (!stillConnected) {
          // Was connected before but now stale — auto-reconnect.
          console.log('[ReaderContext] Connection stale after resume, reconnecting...');
          setConnectedReader(null);
          // Session #145 Gap D — wrap the un-awaited reconnect's rejection so
          // it can NEVER bubble to `pos-shell.tsx`'s global error/rejection
          // listener (the listener matches third-party Stripe Terminal SDK
          // error strings like "POS no longer authenticated" and falsely
          // redirects to /pos/login?reason=session_expired on PWA wake).
          // The reconnect failing here is NOT a POS session expiry — it's a
          // Stripe Terminal internal session ticket failure that the operator
          // can resolve by tapping "Connect Reader" when they next need card
          // payment. Logging at warn surfaces the failure for operator
          // devtools without forcing an unwanted logout.
          discoverAndConnect().catch((err) => {
            console.warn(
              '[reader-context] visibility reconnect failed (silenced — operator stays logged in)',
              err
            );
          });
        }
      } catch {
        setConnectedReader(null);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [discoverAndConnect]);

  const disconnect = useCallback(async () => {
    try {
      const { disconnectReader } = await import('../lib/stripe-terminal');
      await disconnectReader();
      setConnectedReader(null);
      localStorage.removeItem('pos_reader_id');
    } catch (err) {
      console.error('Failed to disconnect reader:', err);
    }
  }, []);

  const clearError = useCallback(() => {
    setConnectionError(null);
  }, []);

  return (
    <ReaderContext.Provider
      value={{
        connectedReader,
        isConnecting,
        connectionError,
        discoverAndConnect,
        disconnect,
        clearError,
      }}
    >
      {children}
    </ReaderContext.Provider>
  );
}

export function useReader() {
  const context = useContext(ReaderContext);
  if (!context) {
    throw new Error('useReader must be used within a ReaderProvider');
  }
  return context;
}
