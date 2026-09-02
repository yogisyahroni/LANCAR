'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { shouldAcceptRealtimeEvent } from '@/lib/realtimeEventGuard';

interface WebSocketHookOptions {
  onMessage?: (data: any) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  /** Fetch authoritative state after every connection, including reconnects. */
  onResync?: () => void;
  autoConnect?: boolean;
}

export function useWebSocket(url: string | null, options: WebSocketHookOptions = {}) {
  const { onMessage, onOpen, onClose, onError, onResync, autoConnect = true } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const seenVersionsRef = useRef(new Map<string, number>());

  const connect = useCallback(() => {
    if (!url) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        if (onOpen) onOpen();
        if (onResync) onResync();
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && typeof parsed === 'object' && !shouldAcceptRealtimeEvent(seenVersionsRef.current, parsed)) {
            return;
          }
          if (onMessage) onMessage(parsed);
        } catch (err) {
          if (onMessage) onMessage(event.data);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (onClose) onClose();
      };

      ws.onerror = (err) => {
        setError(err);
        if (onError) onError(err);
      };
    } catch (err: any) {
      setError(err);
    }
  }, [url, onMessage, onOpen, onClose, onError]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const sendMessage = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      wsRef.current.send(message);
    }
  }, []);

  useEffect(() => {
    if (autoConnect && url) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [url, autoConnect, connect, disconnect]);

  return {
    isConnected,
    error,
    sendMessage,
    connect,
    disconnect
  };
}
