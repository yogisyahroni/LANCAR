import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, XCircle, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

const resolveUploadUrl = (fileUrl?: string) => {
  if (!fileUrl) return ''
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl
  try {
    const base = new URL(api.defaults.baseURL || window.location.origin)
    return `${base.origin}${fileUrl}`
  } catch {
    return fileUrl
  }
}

export default function CourierFaceVerifications() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('pending_review')
  const [selected, setSelected] = useState<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['courier-face-verifications', status],
    queryFn: async () => {
      const res = await api.get(`/admin/couriers/face-verifications`, { params: { status } })
      return res.data.data || []
    }
  })

  const reviewVerification = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approve' | 'reject' }) => {
      const res = await api.post(`/admin/couriers/face-verifications/${id}/review`, { action })
      return res.data
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['courier-face-verifications'] })
      setSelected(null)
      toast.success(variables.action === 'approve' ? 'Verifikasi disetujui' : 'Verifikasi ditolak')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || 'Terjadi kesalahan')
    }
  })

  const verifications = data || []
  const active = selected || verifications[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Face Verifications</h1>
          <p className="text-slate-500">Tinjau antrean verifikasi wajah kurir yang tertunda atau gagal otomatis.</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setStatus('pending_review')}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            status === 'pending_review' ? "bg-amber-100 text-amber-700" : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
          )}
        >
          Pending Review
        </button>
        <button
          onClick={() => setStatus('verified')}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            status === 'verified' ? "bg-green-100 text-green-700" : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
          )}
        >
          Verified
        </button>
        <button
          onClick={() => setStatus('failed')}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            status === 'failed' ? "bg-red-100 text-red-700" : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
          )}
        >
          Failed
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 border border-slate-200 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <h2 className="font-semibold text-slate-900">Daftar Antrean</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center text-slate-400">Memuat...</div>
            ) : verifications.length === 0 ? (
              <div className="flex flex-col h-32 items-center justify-center text-slate-400 gap-2">
                <UserCheck className="h-8 w-8 opacity-20" />
                <p>Tidak ada antrean.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {verifications.map((item: any) => (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={cn(
                      "w-full text-left rounded-lg p-3 transition-colors flex items-start gap-3",
                      active?.id === item.id ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50"
                    )}
                  >
                    <div className="mt-0.5 rounded-full bg-slate-100 p-1.5 shrink-0">
                      <UserCheck className="h-4 w-4 text-slate-500" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{item.full_name || 'Tanpa Nama'}</p>
                      <p className="text-xs text-slate-500">NIK: {item.nik}</p>
                      <p className="text-xs text-slate-400 mt-1">Tipe: {item.verification_type}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {active ? (
            <div className="border border-slate-200 bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between bg-slate-50">
                <h2 className="font-semibold text-slate-900">Detail Verifikasi Wajah</h2>
                <span className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                  active.status === 'verified' ? "bg-green-100 text-green-700" :
                    active.status === 'failed' ? "bg-red-100 text-red-700" :
                      "bg-amber-100 text-amber-700"
                )}>
                  {active.status === 'verified' && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {active.status === 'failed' && <XCircle className="h-3.5 w-3.5" />}
                  {active.status === 'pending_review' && <Clock className="h-3.5 w-3.5" />}
                  {active.status}
                </span>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-3">Foto Wajah</h3>
                    <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-100 aspect-[3/4] relative">
                      {active.image_url ? (
                        <img 
                          src={resolveUploadUrl(active.image_url)} 
                          alt="Face" 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                          Tidak ada foto
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-medium text-slate-500">Informasi Kurir</h3>
                      <div className="mt-2 space-y-2">
                        <p className="text-sm"><span className="text-slate-400 inline-block w-20">Nama:</span> <span className="font-medium text-slate-900">{active.full_name}</span></p>
                        <p className="text-sm"><span className="text-slate-400 inline-block w-20">NIK:</span> <span className="text-slate-900">{active.nik}</span></p>
                        <p className="text-sm"><span className="text-slate-400 inline-block w-20">No. HP:</span> <span className="text-slate-900">{active.phone}</span></p>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-slate-500">Data Verifikasi</h3>
                      <div className="mt-2 space-y-2">
                        <p className="text-sm"><span className="text-slate-400 inline-block w-24">Tipe:</span> <span className="text-slate-900 capitalize">{active.verification_type}</span></p>
                        {active.order_id && (
                          <p className="text-sm"><span className="text-slate-400 inline-block w-24">Order ID:</span> <span className="font-mono text-slate-900">{active.order_id}</span></p>
                        )}
                        <p className="text-sm"><span className="text-slate-400 inline-block w-24">Liveness:</span> <span className="text-slate-900">{active.liveness_score || 'N/A'}</span></p>
                        <p className="text-sm"><span className="text-slate-400 inline-block w-24">Waktu:</span> <span className="text-slate-900">{new Date(active.created_at).toLocaleString('id-ID')}</span></p>
                      </div>
                    </div>
                    
                    {active.status === 'pending_review' && (
                      <div className="pt-4 border-t border-slate-100 flex gap-3">
                        <button
                          onClick={() => reviewVerification.mutate({ id: active.id, action: 'approve' })}
                          disabled={reviewVerification.isPending}
                          className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
                        >
                          Approve (Valid)
                        </button>
                        <button
                          onClick={() => reviewVerification.mutate({ id: active.id, action: 'reject' })}
                          disabled={reviewVerification.isPending}
                          className="flex-1 rounded-md bg-white px-4 py-2 text-sm font-semibold text-red-600 shadow-sm ring-1 ring-inset ring-red-300 hover:bg-red-50 disabled:opacity-50"
                        >
                          Reject (Palsu/Bukan Kurir)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-slate-200 border-dashed rounded-xl flex items-center justify-center h-[300px] bg-slate-50 text-slate-400">
              Pilih item di sebelah kiri untuk melihat detail
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
