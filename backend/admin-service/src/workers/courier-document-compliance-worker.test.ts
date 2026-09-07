import { createNotification } from '../notifications';
import { runCourierDocumentComplianceTick } from './courier-document-compliance-worker';

jest.mock('../notifications', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../db', () => ({
  db: { query: jest.fn() },
}));

describe('courier document compliance worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('expires documents through policy and sends an idempotent communication reminder', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'expired-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{
          id: 'doc-1',
          user_id: 'user-1',
          doc_type: 'sim',
          expires_at: '2026-10-08',
          reminder_type: 'expiry_30d',
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: 'reminder-1', status: 'pending' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await runCourierDocumentComplianceTick({ query }, new Date('2026-09-08T10:00:00.000Z'));

    expect(result).toEqual({ expired: 1, retentionExpired: 0, remindersSent: 1, remindersFailed: 0 });
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      type: 'courier_document_reverification',
      metadata: expect.objectContaining({
        courier_document_id: 'doc-1',
        reminder_type: 'expiry_30d',
      }),
    }));
    expect(query.mock.calls[0][0]).toContain("document_status = 'expired'");
  });

  it('does not resend a reminder already marked sent', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{
          id: 'doc-1',
          user_id: 'user-1',
          doc_type: 'sim',
          expires_at: '2026-10-08',
          reminder_type: 'expiry_30d',
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: 'reminder-1', status: 'sent' }], rowCount: 1 });

    await runCourierDocumentComplianceTick({ query }, new Date('2026-09-08T10:00:00.000Z'));

    expect(createNotification).not.toHaveBeenCalled();
  });
});
