const assert = require('node:assert/strict');
const { verifyCsrfToken } = require('../dist/middleware/csrf.js');

const runMiddleware = ({ method, cookie, header }) => {
  let nextCalled = false;
  let statusCode = 0;
  let body = null;

  const request = {
    method,
    headers: {
      cookie,
      'x-csrf-token': header,
    },
  };
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };

  verifyCsrfToken(request, response, () => {
    nextCalled = true;
  });

  return { nextCalled, statusCode, body };
};

const migratedCookies = runMiddleware({
  method: 'DELETE',
  cookie: 'csrf_token=canonical; tembus_admin_csrf=legacy',
  header: 'legacy',
});
assert.equal(migratedCookies.nextCalled, true);

const invalidToken = runMiddleware({
  method: 'DELETE',
  cookie: 'csrf_token=canonical; tembus_admin_csrf=legacy',
  header: 'wrong',
});
assert.equal(invalidToken.statusCode, 403);
assert.equal(invalidToken.body.code, 'ERR_CSRF_TOKEN_INVALID');

const missingToken = runMiddleware({
  method: 'DELETE',
  cookie: undefined,
  header: 'legacy',
});
assert.equal(missingToken.statusCode, 403);
assert.equal(missingToken.body.code, 'ERR_CSRF_TOKEN_MISSING');

const safeRequest = runMiddleware({ method: 'GET' });
assert.equal(safeRequest.nextCalled, true);

console.log('CSRF middleware tests passed');
