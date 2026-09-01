import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { ProxyBreaker, ProxyBulkhead } from './directProxy';

export interface WebSocketUpgradePolicy {
  serviceName: string;
  breaker: ProxyBreaker;
  bulkhead: ProxyBulkhead;
}

export interface WebSocketUpgradeProxy {
  upgrade(req: IncomingMessage, socket: Socket, head: Buffer): void;
}

const rejectUpgrade = (socket: Socket, message: string) => {
  try {
    socket.write(
      `HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`,
    );
  } finally {
    socket.destroy();
  }
};

/** Protects a WebSocket upgrade path, which bypasses Express middleware. */
export const createWebSocketUpgradeHandler = (
  policy: WebSocketUpgradePolicy,
  proxy: WebSocketUpgradeProxy,
) => (req: IncomingMessage, socket: Socket, head: Buffer): void => {
  if (policy.breaker.opened) {
    rejectUpgrade(socket, `${policy.serviceName} is currently unavailable`);
    return;
  }

  if (!policy.bulkhead.tryAcquire()) {
    rejectUpgrade(socket, `${policy.serviceName} is at capacity`);
    return;
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    policy.bulkhead.release();
  };

  socket.once('close', release);
  socket.once('error', release);

  try {
    proxy.upgrade(req, socket, head);
  } catch (error) {
    release();
    socket.destroy(error instanceof Error ? error : undefined);
  }
};
