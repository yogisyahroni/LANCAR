import { updateCourierDocumentVerification, updateCourierStatus } from './couriers.controller';
import { db } from '../db';

jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../notifications', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../security/uploadSecurity', () => ({
  saveSecureUploadBuffer: jest.fn(),
}));

const makeResponse = () => {
  const response: any = {
    statusCodeValue: 200,
    bodyValue: undefined,
  };
  response.status = jest.fn((code: number) => {
    response.statusCodeValue = code;
    return response;
  });
  response.json = jest.fn((body: unknown) => {
    response.bodyValue = body;
    return response;
  });
  return response;
};

describe('courier onboarding activation authority', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects activation before the server-side checklist is complete', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'profile-1',
          user_id: 'user-1',
          onboarding_status: 'VERIFYING',
          verification_status: 'pending',
          onboarding_checklist: { passed: false },
          is_verified: false,
          has_vehicle: true,
        }],
      });
    const client = { query, release: jest.fn() };
    (db.connect as jest.Mock).mockResolvedValueOnce(client);

    const response = makeResponse();
    await updateCourierStatus({
      params: { id: 'profile-1' },
      body: { status: 'Active' },
      user: { id: 'admin-1' },
    } as any, response);

    expect(response.statusCodeValue).toBe(409);
    expect(response.bodyValue).toEqual(expect.objectContaining({
      code: 'ERR_COURIER_ONBOARDING_NOT_READY',
      data: expect.objectContaining({ missing_requirements: ['onboarding_checklist'] }),
    }));
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), expect.anything());
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE courier_profiles'), expect.anything());
    expect(client.release).toHaveBeenCalled();
  });

  it('requires an allowed compliance document status', async () => {
    const response = makeResponse();
    await updateCourierDocumentVerification({
      params: { id: 'profile-1', documentId: 'doc-1' },
      body: { document_status: 'expired' },
      user: { id: 'admin-1' },
    } as any, response);

    expect(response.statusCodeValue).toBe(400);
    expect(response.bodyValue).toEqual(expect.objectContaining({ error: 'Invalid document status' }));
    expect(db.connect).not.toHaveBeenCalled();
  });

  it('records a server-side document verification decision and access audit', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // set_config
      .mockResolvedValueOnce({ rows: [{ id: 'doc-1', document_status: 'pending_review', verification_source: 'self_declared', expires_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'doc-1', document_status: 'verified', verification_source: 'samsat', is_verified: true }] })
      .mockResolvedValueOnce(undefined) // access log
      .mockResolvedValueOnce(undefined); // COMMIT
    const client = { query, release: jest.fn() };
    (db.connect as jest.Mock).mockResolvedValueOnce(client);

    const response = makeResponse();
    await updateCourierDocumentVerification({
      params: { id: 'profile-1', documentId: 'doc-1' },
      body: { document_status: 'verified', verification_source: 'samsat', document_number: 'SIM-123' },
      user: { id: 'admin-1' },
    } as any, response);

    expect(response.statusCodeValue).toBe(200);
    expect(response.bodyValue).toEqual(expect.objectContaining({ success: true }));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("SET document_status = $1"), expect.arrayContaining(['verified', 'samsat']));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO courier_document_access_log'), expect.anything());
    expect(client.release).toHaveBeenCalled();
  });
});
