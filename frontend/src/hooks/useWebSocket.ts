'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface WebSocketHookOptions {
  onMessage?: (data: any) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  autoConnect?: boolean;
}

// CORE-2026-007: client-side dedupe for out-of-order / duplicate events.
let lastEventVersion: Record<string, number> = {};

export function useWebSocket(url: string | null, options: WebSocketHookOptions = {}) {
  const { onMessage, onOpen, onClose, onError, autoConnect = true } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

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
        // CORE-2026-007: on (re)connect, request authoritative resume version
        // so the client knows which events to ignore as older/duplicate.
        try {
          ws.send(JSON.stringify({ action: 'sync_request', room: 'sync' }));
        } catch {}
        if (onOpen) onOpen();
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          // Dedupe: ignore stale/duplicate events by version per order (CORE-2026-007).
          if (parsed && typeof parsed === 'object' && parsed.version && parsed.order_id) {
            const key = String(parsed.order_id);
            const incoming = Number(parsed.version);
            const seen = lastEventVersion[key] || 0;
            if (incoming <= seen) {
              // Older or duplicate — drop silently.
              return;
            }
            lastEventVersion[key] = incoming;
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
    disconnect,
  };
}
