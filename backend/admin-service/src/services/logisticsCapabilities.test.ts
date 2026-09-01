import axios from 'axios';
import { assertProviderCapability, LogisticsCapabilityError } from './logisticsCapabilities';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('assertProviderCapability', () => {
  it('accepts a capability declared by the provider registry', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { providers: [{ code: 'jne', capabilities: ['tariff', 'cod'] }] },
    } as any);

    await expect(assertProviderCapability('JNE', 'COD')).resolves.toBeUndefined();
  });

  it('fails closed when a provider does not declare the requested capability', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { providers: [{ code: 'jne', capabilities: ['tariff', 'shipment'] }] },
    } as any);

    try {
      await assertProviderCapability('jne', 'cod');
      throw new Error('expected capability assertion to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(LogisticsCapabilityError);
      expect((error as LogisticsCapabilityError).code).toBe('LOGISTICS_PROVIDER_CAPABILITY_UNSUPPORTED');
      expect((error as LogisticsCapabilityError).statusCode).toBe(400);
    }
  });
});
