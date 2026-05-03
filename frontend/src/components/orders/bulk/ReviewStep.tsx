'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table';
import { AlertCircle, CheckCircle2, Edit2, Loader2, Save, X } from 'lucide-react';

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

  const startEdit = (row: any) => {
    setEditingRowId(row.id);
    setEditForm({
      recipient_name: row.recipient_name,
      recipient_phone: row.recipient_phone,
      dropoff_address: row.dropoff_address,
      weight_kg: row.weight_kg
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

  const columns = [
    columnHelper.accessor('status', {
      header: 'Status',
      cell: info => {
        const status = info.getValue();
        const errors = info.row.original.errors;
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
          <button onClick={() => startEdit(info.row.original)} className="text-primary hover:text-primary/80">
            <Edit2 className="w-4 h-4" />
          </button>
        );
      }
    })
  ];

  const table = useReactTable({
    data: data.rows || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const validCount = data.rows?.filter((r: any) => r.status === 'valid').length || 0;
  const errorCount = (data.rows?.length || 0) - validCount;
  const canProceed = errorCount === 0 && validCount > 0;

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
          {data.rows?.length === 0 && (
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
