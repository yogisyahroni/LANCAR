import axios from 'axios';

const INTEGRATION_GATEWAY_URL = process.env.INTEGRATION_GATEWAY_URL || 'http://integration-gateway:8085';

export class LogisticsCapabilityError extends Error {
  constructor(
    message: string,
    public readonly code: 'LOGISTICS_PROVIDER_CAPABILITY_UNAVAILABLE' | 'LOGISTICS_PROVIDER_CAPABILITY_UNSUPPORTED',
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'LogisticsCapabilityError';
  }
}

export async function assertProviderCapability(provider: unknown, capability: string): Promise<void> {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const normalizedCapability = String(capability || '').trim().toLowerCase();
  if (!normalizedProvider || !normalizedCapability) {
    throw new LogisticsCapabilityError(
      'Provider dan capability logistics wajib ditentukan.',
      'LOGISTICS_PROVIDER_CAPABILITY_UNSUPPORTED',
      400,
    );
  }

  try {
    const response = await axios.get(`${INTEGRATION_GATEWAY_URL.replace(/\/$/, '')}/api/internal/logistics/providers`, {
      headers: { 'X-Internal-Api-Key': process.env.INTERNAL_API_KEY || '' },
      timeout: 3000,
    });
    const providerDescriptor = response.data?.providers?.find(
      (item: { code?: string }) => String(item?.code || '').trim().toLowerCase() === normalizedProvider,
    );
    const capabilities = Array.isArray(providerDescriptor?.capabilities)
      ? providerDescriptor.capabilities.map((item: unknown) => String(item).trim().toLowerCase())
      : [];
    if (!providerDescriptor || !capabilities.includes(normalizedCapability)) {
      throw new LogisticsCapabilityError(
        `Provider ${normalizedProvider.toUpperCase()} tidak mendukung capability ${normalizedCapability.toUpperCase()}.`,
        'LOGISTICS_PROVIDER_CAPABILITY_UNSUPPORTED',
        400,
      );
    }
  } catch (error) {
    if (error instanceof LogisticsCapabilityError) throw error;
    throw new LogisticsCapabilityError(
      'Capability provider logistics belum dapat diverifikasi dari server.',
      'LOGISTICS_PROVIDER_CAPABILITY_UNAVAILABLE',
      503,
    );
  }
}
