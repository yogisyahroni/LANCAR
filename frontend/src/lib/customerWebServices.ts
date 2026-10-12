export type CustomerWebServiceIdentity = {
  code?: string | null;
  name?: string | null;
  service_category?: string | null;
};

const normalizeServiceValue = (value: string | null | undefined) =>
  String(value || '').trim().toLowerCase();

/**
 * Food remains available to other product surfaces, but is not exposed by the
 * customer web parcel-ordering flow.
 */
export const isCustomerWebFoodService = (service: CustomerWebServiceIdentity | null | undefined) => {
  const category = normalizeServiceValue(service?.service_category);
  const code = normalizeServiceValue(service?.code);
  const name = normalizeServiceValue(service?.name);

  return category === 'food' || category === 'food_delivery' || code.includes('food') || name.includes('food');
};
