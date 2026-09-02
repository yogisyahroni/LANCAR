import type { RecoverableApiError } from './api';

export type ErrorPresentation = {
  message: string;
  action?: string;
  retryable: boolean;
  reference?: string;
};

export function presentRecoverableError(error: any, fallback: string): ErrorPresentation {
  const data = error?.recoverable as RecoverableApiError | null | undefined;
  if (data) {
    return {
      message: data.message || fallback,
      action: data.action,
      retryable: data.retryable,
      reference: data.correlationId,
    };
  }
  return { message: fallback, retryable: false };
}
