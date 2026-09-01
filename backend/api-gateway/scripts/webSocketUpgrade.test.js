const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createWebSocketUpgradeHandler } = require('../dist/resilience/webSocketUpgrade.js');

const makeSocket = () => {
  const socket = new EventEmitter();
  socket.writes = [];
  socket.write = (payload) => { socket.writes.push(payload); return true; };
  socket.destroy = (error) => { socket.destroyedWith = error || true; };
  return socket;
};

const makePolicy = (overrides = {}) => ({
  serviceName: 'admin-service',
  breaker: { opened: false },
  bulkhead: {
    active: 0,
    tryAcquire() { this.active += 1; return true; },
    release() { this.active -= 1; },
  },
  ...overrides,
});

const policy = makePolicy();
const socket = makeSocket();
let upgraded = false;
createWebSocketUpgradeHandler(policy, { upgrade() { upgraded = true; } })({ url: '/socket.io/?EIO=4', method: 'GET' }, socket, Buffer.alloc(0));
assert.equal(upgraded, true);
assert.equal(policy.bulkhead.active, 1);
socket.emit('error', new Error('client disconnected'));
socket.emit('close');
assert.equal(policy.bulkhead.active, 0);

const fullPolicy = makePolicy({
  bulkhead: { tryAcquire: () => false, release: () => { throw new Error('must not release'); } },
});
const fullSocket = makeSocket();
let fullUpgrade = false;
createWebSocketUpgradeHandler(fullPolicy, { upgrade() { fullUpgrade = true; } })({ url: '/socket.io' }, fullSocket, Buffer.alloc(0));
assert.equal(fullUpgrade, false);
assert.equal(fullSocket.writes[0].includes('503 Service Unavailable'), true);
assert.equal(fullSocket.destroyedWith, true);

const openSocket = makeSocket();
createWebSocketUpgradeHandler(makePolicy({ breaker: { opened: true } }), { upgrade() {} })({ url: '/socket.io' }, openSocket, Buffer.alloc(0));
assert.equal(openSocket.writes[0].includes('503 Service Unavailable'), true);
assert.equal(openSocket.destroyedWith, true);

const throwingPolicy = makePolicy();
const throwingSocket = makeSocket();
createWebSocketUpgradeHandler(throwingPolicy, { upgrade() { throw new Error('proxy unavailable'); } })({ url: '/socket.io' }, throwingSocket, Buffer.alloc(0));
assert.equal(throwingPolicy.bulkhead.active, 0);
assert.equal(throwingSocket.destroyedWith.message, 'proxy unavailable');

console.log('websocket upgrade resilience tests passed');
