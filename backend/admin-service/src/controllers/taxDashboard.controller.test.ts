import { Request, Response } from 'express';
import { getTaxDashboard } from './taxRules.controller';
import { readDb } from '../db';

jest.mock('../db', () => ({
  db: { query: jest.fn(), connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

describe('getTaxDashboard controller', () => {
  it('returns tax dashboard structure and queries efakturs by period', async () => {
    (readDb.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ month: '2026-09', total_dpp_idr: 1000000, total_ppn_idr: 110000, transaction_count: 10 }] })
      .mockResolvedValueOnce({ rows: [{ id: '1', period: '2026-09', status: 'exported' }] })
      .mockResolvedValueOnce({ rows: [{ total_pph_withheld_idr: 50000 }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {} as Request;
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as unknown as Response;

    await getTaxDashboard(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        summary: [{ month: '2026-09', total_dpp_idr: 1000000, total_ppn_idr: 110000, transaction_count: 10 }],
        efakturs: [{ id: '1', period: '2026-09', status: 'exported' }],
        withholdings: [{ total_pph_withheld_idr: 50000 }],
        mismatches: [],
      },
    });

    const efaktursQuery = (readDb.query as jest.Mock).mock.calls[1][0];
    expect(efaktursQuery).toContain('period');
    expect(efaktursQuery).not.toContain('tax_period');
  });
});
