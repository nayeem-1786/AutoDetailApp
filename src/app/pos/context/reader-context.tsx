'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
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

  // Auto-connect on mount
  useEffect(() => {
    let mounted = true;

    async function autoConnect() {
      setIsConnecting(true);

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
        }
      }
    }

    autoConnect();

    return () => {
      mounted = false;
    };
  }, []);

  const discoverAndConnect = useCallback(async () => {
    setIsConnecting(true);
    setConnectionError(null);

    try {
      const { ensureConnected } = await import('../lib/stripe-terminal');
      const reader = await ensureConnected();
      setConnectedReader(reader);
      localStorage.setItem('pos_reader_id', reader.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to reader';
      setConnectionError(message);
    } finally {
      setIsConnecting(false);
    }
  }, []);

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
