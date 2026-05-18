import { dispatchApprovedPayouts } from '../services/payoutProviderDispatcher';
import { payoutStructuredLog } from '../utils/payoutObservability';

let started = false;
let running = false;

export const startPayoutDispatcherWorker = () => {
  if (started) return;
  started = true;

  if (process.env.PAYOUT_DISPATCHER_WORKER_ENABLED === 'false') {
    payoutStructuredLog('info', 'payout_dispatcher_worker_disabled', {});
    return;
  }

  const intervalMs = Number(process.env.PAYOUT_DISPATCHER_INTERVAL_MS || 30000);

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await dispatchApprovedPayouts();
      if (result.processed > 0) {
        payoutStructuredLog('info', 'payout_dispatcher_worker_processed', result);
      }
    } catch (error) {
      payoutStructuredLog('error', 'payout_dispatcher_worker_error', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  setTimeout(tick, Math.min(intervalMs, 5000)).unref();
  setInterval(tick, intervalMs).unref();
  payoutStructuredLog('info', 'payout_dispatcher_worker_started', { interval_ms: intervalMs });
};
