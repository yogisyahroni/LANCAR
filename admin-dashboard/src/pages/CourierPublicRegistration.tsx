import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { useParams } from 'react-router'
import { CheckCircle2, FileUp, Loader2, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

const documentLabels: Record<string, string> = {
  ktp: 'e-KTP Asli',
  sim: 'SIM C / D Asli',
  stnk: 'STNK Asli',
  skpd: 'SKPD Pajak 5 Tahunan',
  vehicle_photo: 'Foto Kendaraan',
  skck: 'SKCK Asli / Legalisir',
  bank_account: 'Bukti Rekening Bank',
}

const channelLabels: Record<string, string> = {
  regular: 'Regular',
  on_demand: 'On-Demand',
}

type LinkInfo = {
  application_channel: string
  title: string
  notes?: string
}

export default function CourierPublicRegistration() {
  const { token = '' } = useParams()
  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null)
  const [isLoadingLink, setIsLoadingLink] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [documents, setDocuments] = useState<Record<string, string>>({})
  const [documentNames, setDocumentNames] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    partnership_type: 'regular', // regular or towing
    full_name: '',
    phone_number: '',
    email: '',
    password: '',
    vehicle_plate: '',
    vehicle_brand: '',
    vehicle_model: '',
    vehicle_year: '',
    vehicle_cc: '',
    vehicle_category: 'matic',
    engine_type: '4_tak',
    sim_active: true,
    skpd_tax_active: true,
    bank_code: '',
    bank_account_number: '',
    bank_account_name: '',
  })

  const channelName = useMemo(
    () => channelLabels[linkInfo?.application_channel || ''] || 'Courier',
    [linkInfo?.application_channel]
  )

  useEffect(() => {
    const loadLink = async () => {
      try {
        const res = await api.get(`/auth/courier/registration-links/${token}`)
        setLinkInfo(res.data.data)
      } catch (err: any) {
        setError(err.response?.data?.error || 'Link pendaftaran tidak valid')
      } finally {
        setIsLoadingLink(false)
      }
    }
    loadLink()
  }, [token])

  const updateForm = (key: string, value: any) => {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  const uploadDocument = async (docType: string, file?: File) => {
    if (!file) return
    setUploadingDoc(docType)
    setError('')
    try {
      const payload = new FormData()
      payload.append('doc_type', docType)
      payload.append('file', file)
      const res = await api.post('/auth/courier/documents/upload', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setDocuments((current) => ({ ...current, [docType]: res.data.data.file_url }))
      setDocumentNames((current) => ({ ...current, [docType]: file.name }))
    } catch (err: any) {
      setError(err.response?.data?.error || 'Upload dokumen gagal')
    } finally {
      setUploadingDoc(null)
    }
  }

  const submit = async () => {
    const requiredDocumentsMissing = Object.keys(documentLabels).some((key) => !documents[key])
    const requiredFieldsMissing = [
      form.full_name,
      form.phone_number,
      form.password,
      form.vehicle_plate,
      form.vehicle_year,
      form.vehicle_cc,
      form.bank_code,
      form.bank_account_number,
      form.bank_account_name,
    ].some((value) => !String(value).trim())

    if (requiredFieldsMissing || requiredDocumentsMissing) {
      setError('Lengkapi data diri, kendaraan, rekening, dan semua dokumen wajib.')
      return
    }

    setIsSubmitting(true)
    setError('')
    try {
      const payloadVehicleType = form.partnership_type === 'towing' ? 'towing_truck' : 'matic';
      await api.post(`/auth/courier/register/${token}`, {
        ...form,
        vehicle_type: payloadVehicleType,
        vehicle_year: Number(form.vehicle_year),
        vehicle_cc: Number(form.vehicle_cc),
        documents,
      })
      setSubmitted(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Pendaftaran gagal dikirim')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoadingLink) {
    return <CenteredState icon={<Loader2 className="h-8 w-8 animate-spin text-primary-light" />} title="Membuka link pendaftaran" />
  }

  if (error && !linkInfo) {
    return <CenteredState title={error} />
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-5 py-8 text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-primary-light">TEMBUS Courier Registration</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">{linkInfo?.title || `Daftar Kurir ${channelName}`}</h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                Jalur pendaftaran ini untuk kurir {channelName}. Data dan dokumen akan masuk ke admin TEMBUS untuk proses review.
              </p>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-bold text-primary-light">
              {channelName}
            </div>
          </div>
          {linkInfo?.notes && <p className="mt-5 rounded-2xl bg-zinc-900 p-4 text-sm text-zinc-400">{linkInfo.notes}</p>}
        </div>

        {submitted ? (
          <div className="rounded-[32px] border border-emerald-500/20 bg-emerald-500/10 p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
            <h2 className="mt-4 text-2xl font-black">Pendaftaran terkirim</h2>
            <p className="mt-2 text-zinc-400">Tim admin akan memeriksa dokumen dan mengaktifkan akun bila semua syarat terpenuhi.</p>
          </div>
        ) : (
          <>
            <FormSection title="Data Diri">
              <Field label="Nama lengkap" value={form.full_name} onChange={(value) => updateForm('full_name', value)} />
              <Field label="Nomor HP" value={form.phone_number} onChange={(value) => updateForm('phone_number', value)} />
              <Field label="Email" value={form.email} onChange={(value) => updateForm('email', value)} />
              <Field label="Password login setelah disetujui" type="password" value={form.password} onChange={(value) => updateForm('password', value)} />
            </FormSection>
            <FormSection title="Jenis Kemitraan">
              <SelectField 
                label="Daftar Sebagai" 
                value={form.partnership_type} 
                onChange={(value) => {
                  setForm((current) => ({
                    ...current,
                    partnership_type: value,
                    vehicle_category: value === 'towing' ? 'flatbed' : 'matic'
                  }))
                }} 
                options={['regular', 'towing']} 
              />
            </FormSection>

            <FormSection title="Kendaraan">
              <Field label="Plat nomor" value={form.vehicle_plate} onChange={(value) => updateForm('vehicle_plate', value.toUpperCase())} />
              <Field label="Merek" value={form.vehicle_brand} onChange={(value) => updateForm('vehicle_brand', value)} />
              <Field label="Model" value={form.vehicle_model} onChange={(value) => updateForm('vehicle_model', value)} />
              <Field label="Tahun" type="number" value={form.vehicle_year} onChange={(value) => updateForm('vehicle_year', value)} />
              <Field label="CC" type="number" value={form.vehicle_cc} onChange={(value) => updateForm('vehicle_cc', value)} />
              <SelectField 
                label="Kategori" 
                value={form.vehicle_category} 
                onChange={(value) => updateForm('vehicle_category', value)} 
                options={form.partnership_type === 'towing' ? ['flatbed', 'towing_derek'] : ['matic', 'bebek', 'cargo_box']} 
              />
              <CheckField label="Mesin 4 tak" checked={form.engine_type === '4_tak'} onChange={(checked) => updateForm('engine_type', checked ? '4_tak' : '2_tak')} />
              <CheckField label="SIM masih berlaku" checked={form.sim_active} onChange={(checked) => updateForm('sim_active', checked)} />
              <CheckField label="SKPD/pajak masih berlaku" checked={form.skpd_tax_active} onChange={(checked) => updateForm('skpd_tax_active', checked)} />
            </FormSection>

            <FormSection title="Rekening Payout">
              <Field label="Kode bank" value={form.bank_code} onChange={(value) => updateForm('bank_code', value.toUpperCase())} />
              <Field label="Nomor rekening" value={form.bank_account_number} onChange={(value) => updateForm('bank_account_number', value)} />
              <Field label="Nama pemilik rekening" value={form.bank_account_name} onChange={(value) => updateForm('bank_account_name', value)} />
            </FormSection>

            <FormSection title="Dokumen Wajib">
              {Object.entries(documentLabels).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-100">{label}</p>
                    <p className="truncate text-xs text-zinc-500">{documentNames[key] || 'JPG, PNG, WEBP, atau PDF. Maksimal 10 MB.'}</p>
                  </div>
                  <span className={cn('inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold', documents[key] ? 'bg-emerald-500/10 text-emerald-300' : 'bg-primary text-white')}>
                    {uploadingDoc === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                    {documents[key] ? 'Ganti' : 'Upload'}
                  </span>
                  <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => uploadDocument(key, event.target.files?.[0])} />
                </label>
              ))}
            </FormSection>

            {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-bold text-red-300">{error}</div>}

            <button
              type="button"
              onClick={submit}
              disabled={isSubmitting || uploadingDoc !== null}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-6 py-4 font-black text-white shadow-lg shadow-primary/20 transition hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
              Kirim Pendaftaran
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function CenteredState({ icon, title }: { icon?: React.ReactNode; title: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-8 text-center text-zinc-100">
      <div>
        {icon && <div className="mb-4 flex justify-center">{icon}</div>}
        <p className="text-lg font-black">{title}</p>
      </div>
    </div>
  )
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6">
      <h2 className="mb-5 text-lg font-black">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-primary/60"
      />
    </label>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3">
      <span className="text-sm font-bold text-zinc-200">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-primary" />
    </label>
  )
}
