/**
 * Realtime room names shared by the Socket.IO server and event consumers.
 *
 * The availability room carries only public merchant operating-state
 * invalidations. Membership is granted by the verified role in websocket.ts;
 * clients never choose the room themselves.
 */
export const MERCHANT_AVAILABILITY_ROOM = 'merchant_availability';
