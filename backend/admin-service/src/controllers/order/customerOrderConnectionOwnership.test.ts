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
    expect(createOrderSource).toContain('if (clientReleased || !client) return;');
    expect(createOrderSource).toContain('clientReleased = true;');
    expect(createOrderSource.match(/client\.release\(\)/g)).toHaveLength(1);
    expect(createOrderSource.match(/releaseClient\(\)/g)?.length).toBeGreaterThan(1);

    const quoteCalculationIndex = createOrderSource.indexOf('calculateCustomerPriceBreakdown');
    const transactionAcquireIndex = createOrderSource.indexOf('client = await db.connect()');
    expect(transactionAcquireIndex).toBeGreaterThan(quoteCalculationIndex);
    expect(createOrderSource).toContain("await db.query(\"SELECT is_enabled FROM feature_flags");
  });
});
