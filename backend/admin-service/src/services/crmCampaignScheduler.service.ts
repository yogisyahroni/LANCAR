import { db } from '../db';

export type CrmCampaignSchedulerResult = {
  activated: number;
  completed: number;
};

/**
 * Advance only campaigns whose persisted schedule is due. The transaction
 * keeps completion and activation mutually consistent when multiple admin
 * replicas run the scheduler at the same time.
 */
export const activateDueCrmCampaigns = async (): Promise<CrmCampaignSchedulerResult> => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const completed = await client.query<{ id: string }>(
      `UPDATE crm_campaigns
          SET state = 'COMPLETED', updated_at = NOW()
        WHERE state IN ('SCHEDULED','ACTIVE') AND ends_at IS NOT NULL AND ends_at <= NOW()
        RETURNING id`,
    );
    const activated = await client.query<{ id: string }>(
      `UPDATE crm_campaigns
          SET state = 'ACTIVE', updated_at = NOW()
        WHERE state = 'SCHEDULED' AND starts_at <= NOW()
          AND (ends_at IS NULL OR ends_at > NOW())
        RETURNING id`,
    );
    for (const row of [...completed.rows, ...activated.rows]) {
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, target_id, payload)
         VALUES (NULL, 'crm.campaign.scheduler_state_transition', $1, $2::jsonb)`,
        [row.id, JSON.stringify({
          transition_actor: 'crm_scheduler',
          state: activated.rows.some((item) => item.id === row.id) ? 'ACTIVE' : 'COMPLETED',
        })],
      );
    }
    await client.query('COMMIT');
    return {
      activated: activated.rowCount || 0,
      completed: completed.rowCount || 0,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
