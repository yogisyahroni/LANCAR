import fs from 'node:fs';
import path from 'node:path';

const controllerSource = fs.readFileSync(
  path.join(__dirname, 'customerOrder.controller.ts'),
  'utf8',
);
const createOrderSource = controllerSource.slice(
  controllerSource.indexOf('export const createCustomerOrder'),
  controllerSource.indexOf('export const cancelCustomerOrder'),
);

describe('customer order connection ownership', () => {
  it('uses one idempotent release path for every create-order exit', () => {
    expect(createOrderSource).toContain('let clientReleased = false;');
    expect(createOrderSource).toContain('if (clientReleased) return;');
    expect(createOrderSource).toContain('clientReleased = true;');
    expect(createOrderSource.match(/client\.release\(\)/g)).toHaveLength(1);
    expect(createOrderSource.match(/releaseClient\(\)/g)?.length).toBeGreaterThan(1);
  });
});
