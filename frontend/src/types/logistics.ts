export type LogisticsCapability =
  | "tariff"
  | "shipment"
  | "tracking_pull"
  | "tracking_webhook"
  | "pickup"
  | "cancellation"
  | "label"
  | "pod"
  | "insurance"
  | "cod"
  | "return"
  | "claim";

export interface LogisticsProviderOption {
  id: string;
  code: string;
  name: string;
  capabilities: LogisticsCapability[];
}

export interface LogisticsLocationOption {
  code: string;
  name: string;
  type?: "origin" | "destination" | "both";
}
