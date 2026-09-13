import fs from 'fs';
import { downloadAdminSafetyEvidence } from './safety.controller';

jest.mock('../db', () => ({
  db: { query: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: { error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../security/uploadSecurity', () => ({
  resolvePrivateUploadPath: jest.fn(),
  saveSecureUploadBuffer: jest.fn(),
}));

const { db, readDb } = jest.requireMock('../db') as {
  db: { query: jest.Mock };
  readDb: { query: jest.Mock };
};
const { resolvePrivateUploadPath } = jest.requireMock('../security/uploadSecurity') as {
  resolvePrivateUploadPath: jest.Mock;
};

const incidentId = '11111111-1111-4111-8111-111111111111';
const evidenceId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';

const response = () => ({
  headersSent: false,
  json: jest.fn(),
  setHeader: jest.fn(),
  sendFile: jest.fn(),
  status: jest.fn().mockReturnThis(),
});

describe('safety evidence download controller', () => {
  beforeEach(() => {
    db.query.mockReset();
    readDb.query.mockReset();
    resolvePrivateUploadPath.mockReset();
  });

  it('fails closed before sending bytes when the evidence row is absent', async () => {
    readDb.query.mockResolvedValueOnce({ rows: [] });
    const res = response();

    await downloadAdminSafetyEvidence({ params: { id: incidentId, evidenceId } , user: { id: actorId } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, code: 'ERR_EVIDENCE_NOT_FOUND' });
    expect(res.sendFile).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('resolves only the private path, audits the actor, and then sends the file', async () => {
    const privatePath = 'C:/private/uploads/safety-evidence/evidence.png';
    readDb.query.mockResolvedValueOnce({ rows: [{
      id: evidenceId,
      incident_id: incidentId,
      object_key: 'safety-evidence/evidence.png',
      sha256: 'a'.repeat(64),
      content_type: 'image/png',
      size_bytes: 42,
    }] });
    resolvePrivateUploadPath.mockReturnValueOnce(privatePath);
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as fs.Stats);
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = response();

    await downloadAdminSafetyEvidence({ params: { id: incidentId, evidenceId }, user: { id: actorId } } as any, res as any);

    expect(resolvePrivateUploadPath).toHaveBeenCalledWith('safety-evidence/evidence.png');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("safety.evidence.downloaded"), [
      actorId,
      incidentId,
      expect.stringContaining(evidenceId),
    ]);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="evidence.png"');
    expect(res.sendFile).toHaveBeenCalledWith(privatePath, expect.any(Function));
    jest.restoreAllMocks();
  });

  it('rejects malformed identifiers without touching storage or database', async () => {
    const res = response();

    await downloadAdminSafetyEvidence({ params: { id: incidentId, evidenceId: 'not-a-uuid' }, user: { id: actorId } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(readDb.query).not.toHaveBeenCalled();
    expect(resolvePrivateUploadPath).not.toHaveBeenCalled();
  });
});
