'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table';
import { AlertCircle, CheckCircle2, Edit2, Loader2, Save, Search, Trash2, X } from 'lucide-react';

interface ReviewStepProps {
  jobId: string;
  initialData: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

const columnHelper = createColumnHelper<any>();

export function ReviewStep({ jobId, initialData, onNext, onBack }: ReviewStepProps) {
  const [data, setData] = useState(initialData);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'error'>('all');

  const startEdit = (row: any) => {
    setEditingRowId(row.id);
    setEditForm({
      recipient_name: row.recipient_name,
      recipient_phone: row.recipient_phone,
      dropoff_address: row.dropoff_address,
      category: row.category,
      weight_kg: row.weight_kg,
      dimensions: row.dimensions || { length: 0, width: 0, height: 0 },
      has_insurance: row.has_insurance,
      item_value: row.item_value,
      customer_notes: row.customer_notes || ''
    });
  };

  const cancelEdit = () => {
    setEditingRowId(null);
    setEditForm({});
  };

  const saveEdit = async () => {
    setIsSaving(true);
    try {
      const payload = {
        rows: [
          {
            id: editingRowId,
            ...editForm
          }
        ]
      };
      const res = await api.put(`/auth/web/orders/bulk/row/${jobId}`, payload);
      setData(res.data);
      setEditingRowId(null);
      setEditForm({});
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan perubahan');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRows = async (payload: { row_ids?: string[]; delete_errors?: boolean }) => {
    setIsSaving(true);
    try {
      const res = await api.delete(`/auth/web/orders/bulk/rows/${jobId}`, { data: payload });
      setData(res.data);
    } catch {
      alert('Gagal menghapus baris');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredRows = useMemo(() => {
    const rows = data.rows || [];
    return rows.filter((row: any) => {
      const matchStatus = statusFilter === 'all' || row.status === statusFilter;
      const q = search.toLowerCase();
      const matchSearch = !q || [row.recipient_name, row.recipient_phone, row.dropoff_address, row.category]
        .some((value) => String(value || '').toLowerCase().includes(q));
      return matchStatus && matchSearch;
    });
  }, [data.rows, search, statusFilter]);

  const columns = [
    columnHelper.accessor('status', {
      header: 'Status',
      cell: info => {
        const status = info.getValue();
        const errors = info.row.original.error_messages || info.row.original.errors;
        return (
          <div className="flex items-center gap-2">
            {status === 'valid' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <div className="group relative flex items-center">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <div className="absolute left-full ml-2 hidden w-48 rounded bg-destructive p-2 text-xs text-destructive-foreground group-hover:block z-10">
                  {errors?.join(', ')}
                </div>
              </div>
            )}
          </div>
        );
      }
    }),
    columnHelper.accessor('recipient_name', {
      header: 'Penerima',
      cell: info => {
        if (editingRowId === info.row.original.id) {
          return (
            <input
              value={editForm.recipient_name}
              onChange={e => setEditForm({...editForm, recipient_name: e.target.value})}
              className="w-full rounded border border-white/10 bg-background/50 px-2 py-1 text-sm"
            />
          );
        }
        return info.getValue();
      }
    }),
    columnHelper.accessor('recipient_phone', {
      header: 'No. HP',
      cell: info => {
        if (editingRowId === info.row.original.id) {
          return (
            <input
              value={editForm.recipient_phone}
              onChange={e => setEditForm({...editForm, recipient_phone: e.target.value})}
              className="w-full rounded border border-white/10 bg-background/50 px-2 py-1 text-sm"
            />
          );
        }
        return info.getValue();
      }
    }),
    columnHelper.accessor('dropoff_address', {
      header: 'Alamat Tujuan',
      cell: info => {
        if (editingRowId === info.row.original.id) {
          return (
            <input
              value={editForm.dropoff_address}
              onChange={e => setEditForm({...editForm, dropoff_address: e.target.value})}
              className="w-full rounded border border-white/10 bg-background/50 px-2 py-1 text-sm"
            />
          );
        }
        return <div className="max-w-[200px] truncate" title={info.getValue()}>{info.getValue()}</div>;
      }
    }),
    columnHelper.accessor('category', {
      header: 'Kategori',
      cell: info => {
        if (editingRowId === info.row.original.id) {
          return (
            <select
              value={editForm.category}
              onChange={e => setEditForm({...editForm, category: e.target.value})}
              className="w-32 rounded border border-white/10 bg-background/50 px-2 py-1 text-sm"
            >
              <option value="document">document</option>
              <option value="food">food</option>
              <option value="electronics">electronics</option>
              <option value="clothes">clothes</option>
              <option value="fashion">fashion</option>
              <option value="other">other</option>
            </select>
          );
        }
        return info.getValue() || 'other';
      }
    }),
    columnHelper.accessor('weight_kg', {
      header: 'Berat (kg)',
      cell: info => {
        if (editingRowId === info.row.original.id) {
          return (
            <input
              type="number"
              step="0.1"
              value={editForm.weight_kg}
              onChange={e => setEditForm({...editForm, weight_kg: e.target.value})}
              className="w-20 rounded border border-white/10 bg-background/50 px-2 py-1 text-sm"
            />
          );
        }
        return info.getValue();
      }
    }),
    columnHelper.display({
      id: 'dimensions',
      header: 'Dimensi',
      cell: info => {
        const dims = info.row.original.dimensions || {};
        if (editingRowId === info.row.original.id) {
          return (
            <div className="flex gap-1">
              {(['length', 'width', 'height'] as const).map((key) => (
                <input
                  key={key}
                  type="number"
                  value={editForm.dimensions?.[key] || 0}
                  onChange={e => setEditForm({
                    ...editForm,
                    dimensions: { ...editForm.dimensions, [key]: Number(e.target.value) }
                  })}
                  className="w-14 rounded border border-white/10 bg-background/50 px-1 py-1 text-xs"
                />
              ))}
            </div>
          );
        }
        return `${dims.length || 0}x${dims.width || 0}x${dims.height || 0}`;
      }
    }),
    columnHelper.display({
      id: 'price',
      header: 'Harga',
      cell: info => `Rp ${(info.row.original.price_breakdown?.total_price_idr || 0).toLocaleString('id-ID')}`
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Aksi',
      cell: info => {
        const rowId = info.row.original.id;
        if (editingRowId === rowId) {
          return (
            <div className="flex gap-2">
              <button onClick={saveEdit} disabled={isSaving} className="text-emerald-500 hover:text-emerald-400">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              </button>
              <button onClick={cancelEdit} disabled={isSaving} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        }
        return (
          <div className="flex gap-2">
            <button onClick={() => startEdit(info.row.original)} className="text-primary hover:text-primary/80" title="Edit">
              <Edit2 className="w-4 h-4" />
            </button>
            <button onClick={() => deleteRows({ row_ids: [rowId] })} className="text-destructive hover:text-destructive/80" title="Hapus">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      }
    })
  ];

  const table = useReactTable({
    data: filteredRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const validCount = data.rows?.filter((r: any) => r.status === 'valid').length || 0;
  const errorCount = (data.rows?.length || 0) - validCount;
  const canProceed = errorCount === 0 && validCount > 0;
  const totalPrice = data.rows?.filter((r: any) => r.status === 'valid').reduce((sum: number, row: any) => sum + (row.price_breakdown?.total_price_idr || 0), 0) || 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Langkah 2: Review Data</h2>
          <p className="text-sm text-muted-foreground mt-1">Periksa kembali data Anda. Perbaiki baris yang merah.</p>
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col items-center bg-emerald-500/10 text-emerald-500 px-4 py-2 rounded-lg border border-emerald-500/20">
            <span className="text-xl font-bold">{validCount}</span>
            <span className="text-xs uppercase tracking-wider">Valid</span>
          </div>
          <div className={`flex flex-col items-center px-4 py-2 rounded-lg border ${errorCount > 0 ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-muted/50 text-muted-foreground border-transparent'}`}>
            <span className="text-xl font-bold">{errorCount}</span>
            <span className="text-xs uppercase tracking-wider">Error</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari penerima, HP, alamat, kategori..."
            className="w-full rounded-lg border border-white/10 bg-background/50 py-2.5 pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as any)}
          className="rounded-lg border border-white/10 bg-background/50 px-3 py-2.5 text-sm"
        >
          <option value="all">Semua</option>
          <option value="valid">Valid</option>
          <option value="error">Error</option>
        </select>
        <button
          type="button"
          onClick={() => deleteRows({ delete_errors: true })}
          disabled={errorCount === 0 || isSaving}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
          Hapus Semua Error
        </button>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        Total valid: <b>{validCount} order</b> dengan estimasi pembayaran <b>Rp {totalPrice.toLocaleString('id-ID')}</b>.
      </div>

      <div className="rounded-xl border border-white/10 bg-background/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground border-b border-white/10">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id} className="px-4 py-3 font-medium whitespace-nowrap">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-white/5">
              {table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  className={`${row.original.status === 'error' ? 'bg-destructive/5' : 'hover:bg-white/5'} transition-colors`}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              Tidak ada data ditemukan.
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t border-border">
        <button
          onClick={onBack}
          className="px-6 py-2 rounded-lg font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
        >
          Kembali
        </button>
        <button
          onClick={() => onNext(data)}
          disabled={!canProceed}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            !canProceed
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20'
          }`}
        >
          Lanjut Pembayaran
        </button>
      </div>
    </div>
  );
}
