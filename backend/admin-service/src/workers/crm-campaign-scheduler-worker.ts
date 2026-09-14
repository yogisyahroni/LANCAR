import { activateDueCrmCampaigns } from '../services/crmCampaignScheduler.service';

let started = false;
let running = false;

const workerId = `${process.env.HOSTNAME || 'admin-service'}:${process.pid}:crm-campaign-scheduler`;

const structuredLog = (
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown>,
) => {
  console[level](JSON.stringify({ level, event, worker_id: workerId, ...fields }));
};

const resolvePositiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const startCrmCampaignSchedulerWorker = () => {
  if (started) return;
  started = true;

  if (process.env.CRM_CAMPAIGN_SCHEDULER_ENABLED === 'false') {
    structuredLog('info', 'crm_campaign_scheduler_worker_disabled', {});
    return;
  }

  const intervalMs = Math.max(
    5000,
    resolvePositiveInt(process.env.CRM_CAMPAIGN_SCHEDULER_INTERVAL_MS, 60_000),
  );

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await activateDueCrmCampaigns();
      if (result.activated || result.completed) {
        structuredLog('info', 'crm_campaign_scheduler_transitioned', result);
      }
    } catch (error: any) {
      structuredLog('error', 'crm_campaign_scheduler_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  setTimeout(tick, Math.min(intervalMs, 10_000)).unref();
  setInterval(tick, intervalMs).unref();
  structuredLog('info', 'crm_campaign_scheduler_worker_started', {
    interval_ms: intervalMs,
  });
};
