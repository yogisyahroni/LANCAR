export {};

const { db } = require('../db');
const {
  createResiTemplate,
  updateResiTemplate,
  deleteResiTemplate,
} = require('./resiTemplates.controller');

jest.mock('../db', () => ({
  db: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

const makeRes = () => {
  const res: any = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (payload: unknown) => { res.body = payload; return res; };
  return res;
};

const makeClient = () => ({
  query: jest.fn(),
  release: jest.fn(),
});

describe('resi template admin controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deactivates the previous provider template before creating an active template', async () => {
    const client = makeClient();
    db.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'new-template', provider_code: 'jne', is_active: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await createResiTemplate(
      {
        body: {
          name: 'JNE A6',
          layout_config: { elements: [] },
          is_active: true,
          provider_code: 'JNE',
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(201);
    expect(client.query).toHaveBeenNthCalledWith(2, expect.stringContaining('provider_code IS NOT DISTINCT FROM $1'), ['jne']);
    expect(client.query).toHaveBeenNthCalledWith(3, expect.stringContaining('RETURNING id, name, paper_size'), [
      expect.any(String),
      'JNE A6',
      'A6',
      { elements: [] },
      true,
      'jne',
    ]);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('deactivates competing templates when an existing template is activated', async () => {
    const client = makeClient();
    db.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: 'template-2',
        name: 'Template 2',
        paper_size: 'A6',
        layout_config: { elements: [] },
        is_active: false,
        provider_code: 'jne',
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'template-2', is_active: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await updateResiTemplate(
      { params: { id: 'template-2' }, body: { is_active: true } } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(client.query).toHaveBeenNthCalledWith(3, expect.stringContaining('provider_code IS NOT DISTINCT FROM $1'), ['jne', 'template-2']);
    expect(client.query).toHaveBeenNthCalledWith(4, expect.stringContaining('UPDATE resi_templates'), [
      'Template 2',
      'A6',
      { elements: [] },
      true,
      'jne',
      'template-2',
    ]);
  });

  it('rejects deleting an active template so the renderer always has a safe owner', async () => {
    const client = makeClient();
    db.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'active-template', is_active: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await deleteResiTemplate({ params: { id: 'active-template' } } as any, res as any);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain('Active template cannot be deleted');
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
