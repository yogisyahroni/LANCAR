import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  ArrowLeft, ArrowRight, Building2, Check, FileUp, Loader2, ShieldCheck, Store, User,
} from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'sonner'
import LocationPicker from '../components/LocationPicker'

// ─── Types ────────────────────────────────────────────────
type FormData = {
  // jenis usaha
  businessType: 'perorangan' | 'perusahaan'
  // akun
  fullName: string
  email: string
  phoneNumber: string
  password: string
  // toko
  storeName: string
  address: string
  openHour: string
  closeHour: string
  latitude: number | null
  longitude: number | null
  // dokumen (file_url dari upload)
  ktpPemilikUrl: string
  fotoTempatUsahaUrl: string
  rekeningBankUrl: string
  nibUrl: string
}

const emptyForm: FormData = {
  businessType: 'perorangan',
  fullName: '', email: '', phoneNumber: '', password: '',
  storeName: '', address: '', openHour: '08:00', closeHour: '22:00', latitude: null, longitude: null,
  ktpPemilikUrl: '', fotoTempatUsahaUrl: '', rekeningBankUrl: '', nibUrl: '',
}

const STEPS = ['Jenis Usaha', 'Akun', 'Data Toko', 'Dokumen', 'Review'] as const

const DOC_FIELDS = [
  { key: 'ktpPemilikUrl', label: 'KTP Pemilik', required: true, hint: 'Foto KTP asli (JPG/PNG/PDF, maks 10MB)' },
  { key: 'fotoTempatUsahaUrl', label: 'Foto Tempat Usaha', required: true, hint: 'Foto tampak depan toko / dapur' },
  { key: 'rekeningBankUrl', label: 'Rekening Bank', required: true, hint: 'Buku tabungan / screenshot rekening' },
  { key: 'nibUrl', label: 'NIB / Izin Usaha', required: false, hint: 'Opsional untuk perorangan, wajib untuk perusahaan' },
] as const

const requiredDocsFor = (businessType: string) =>
  DOC_FIELDS.filter((d) => d.required || businessType === 'perusahaan')

// ─── Helpers ──────────────────────────────────────────────
const deviceId = () => {
  let id = localStorage.getItem('merchant_web_device_id')
  if (!id) {
    id = `web-${crypto.randomUUID()}`
    localStorage.setItem('merchant_web_device_id', id)
  }
  return id
}

// Map field form (camelCase) → doc_type backend (snake_case).
const DOC_TYPE_MAP: Record<string, string> = {
  ktpPemilikUrl: 'ktp_pemilik',
  fotoTempatUsahaUrl: 'foto_tempat_usaha',
  rekeningBankUrl: 'rekening_bank',
  nibUrl: 'nib',
}

// ─── UI components ────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; required?: boolean
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-zinc-700">{label} {required && <span className="text-[#F97316]">*</span>}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-emerald-900 focus:ring-2 focus:ring-emerald-900/10"
      />
    </label>
  )
}

export default function Register() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadingNames, setUploadingNames] = useState<Record<string, string>>({})
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const update = (key: keyof FormData) => (v: string) => setForm((f) => ({ ...f, [key]: v }))

  const validateStep = (): string => {
    if (step === 0) return ''
    if (step === 1) {
      if (form.fullName.trim().length < 2) return 'Nama lengkap minimal 2 karakter.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Email tidak valid.'
      if (form.phoneNumber.replace(/\D/g, '').length < 9) return 'Nomor HP tidak valid (minimal 9 digit).'
      if (form.password.length < 8) return 'Password minimal 8 karakter.'
      return ''
    }
    if (step === 2) {
      if (form.storeName.trim().length < 3) return 'Nama toko minimal 3 karakter.'
      if (form.address.trim().length < 10) return 'Alamat terlalu pendek.'
      if (form.latitude === null || form.longitude === null) return 'Tandai lokasi toko di peta (wajib).'
      return ''
    }
    if (step === 3) {
      const missing = requiredDocsFor(form.businessType).filter((d) => !form[d.key])
      if (missing.length > 0) return `Lengkapi dokumen: ${missing.map((d) => d.label).join(', ')}.`
      return ''
    }
    return ''
  }

  const next = () => {
    const err = validateStep()
    if (err) { setError(err); return }
    setError('')
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const uploadDocument = async (key: string, file?: File) => {
    if (!file) return
    setUploading(key)
    setError('')
    try {
      const payload = new FormData()
      payload.append('doc_type', DOC_TYPE_MAP[key] || key)
      payload.append('file', file)
      const res = await api.post('/auth/merchant/documents/upload', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setForm((f) => ({ ...f, [key]: res.data.data.file_url }))
      setUploadingNames((n) => ({ ...n, [key]: file.name }))
      // Preview via objectURL lokal — /uploads private (auth), jangan fetch server.
      setPreviewUrls((p) => {
        const prev = p[key]
        if (prev) URL.revokeObjectURL(prev)
        return { ...p, [key]: URL.createObjectURL(file) }
      })
      toast.success(`${file.name} berhasil diupload`)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Upload gagal. Coba lagi.')
      toast.error('Upload dokumen gagal')
    } finally {
      setUploading(null)
    }
  }

  const submit = async () => {
    setSubmitting(true)
    setError('')
    try {
      // 1. Buat akun user (public register/start → langsung dapat JWT, OTP off di staging)
      const regRes = await api.post('/auth/customer/register/start', {
        full_name: form.fullName.trim(),
        email: form.email.trim(),
        phone_number: form.phoneNumber.trim(),
        password: form.password,
        device_id: deviceId(),
      })
      const token = regRes.data.access_token
      if (!token) {
        throw new Error('Registrasi akun belum selesai (membutuhkan verifikasi OTP). Hubungi support.')
      }

      // 2. Daftar merchant dengan JWT
      const payload: Record<string, any> = {
        nama_toko: form.storeName.trim(),
        alamat: form.address.trim(),
        jam_buka: form.openHour,
        jam_tutup: form.closeHour,
        ktp_pemilik_url: form.ktpPemilikUrl,
        foto_tempat_usaha_url: form.fotoTempatUsahaUrl,
        rekening_bank_url: form.rekeningBankUrl,
        business_type: form.businessType,
      }
      if (form.latitude !== null && form.longitude !== null) {
        payload.lokasi_lat = form.latitude
        payload.lokasi_lng = form.longitude
      }
      if (form.nibUrl) payload.nib_url = form.nibUrl

      await api.post('/merchant/register', payload, {
        headers: { Authorization: `Bearer ${token}` },
      })

      toast.success('Pendaftaran berhasil dikirim!')
      navigate('/sukses', { state: { email: form.email.trim() } })
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Pendaftaran gagal. Coba lagi.')
      toast.error('Pendaftaran gagal')
    } finally {
      setSubmitting(false)
    }
  }

  const docUrlInput = (d: (typeof DOC_FIELDS)[number]) => (
    <div key={d.key} className="rounded-2xl border border-zinc-100 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-zinc-900">{d.label} {d.required && <span className="text-[#F97316]">*</span>}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{d.hint}</p>
        </div>
        {form[d.key] ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
            <Check className="h-3.5 w-3.5" /> {uploadingNames[d.key] || 'Terupload'}
          </span>
        ) : uploading === d.key ? (
          <Loader2 className="h-5 w-5 animate-spin text-emerald-900" />
        ) : null}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-bold text-zinc-700 transition hover:border-emerald-900/30 hover:text-emerald-900">
          <FileUp className="h-4 w-4" /> Pilih File
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => uploadDocument(d.key, e.target.files?.[0])}
          />
        </label>
        {form[d.key] && (
          <a href={previewUrls[d.key] || form[d.key]} target="_blank" rel="noreferrer" className="text-sm font-semibold text-emerald-900 hover:underline">
            Lihat file
          </a>
        )}
      </div>
    </div>
  )

  const isLastStep = step === STEPS.length - 1

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-100 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/favicon.svg" alt="TEMBUS" className="h-8 w-8" />
            <span className="font-black text-zinc-900">TEMBUS Mitra</span>
          </Link>
          <span className="rounded-full bg-emerald-900/5 px-4 py-1.5 text-xs font-bold text-emerald-900">
            Langkah {step + 1} dari {STEPS.length}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        {/* Stepper */}
        <ol className="flex items-center gap-1.5 overflow-x-auto pb-2">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-1.5">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${i <= step ? 'bg-[#003A20] text-white' : 'bg-zinc-200 text-zinc-500'}`}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`whitespace-nowrap text-xs font-bold ${i <= step ? 'text-emerald-900' : 'text-zinc-400'}`}>{label}</span>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-zinc-200" />}
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm md:p-8">
          {/* Step 0: Jenis Usaha */}
          {step === 0 && (
            <div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">Daftar sebagai apa?</h1>
              <p className="mt-1 text-sm text-zinc-500">Pilih jenis badan usaha tokomu. Mayoritas UMKM kuliner memilih perorangan.</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {([
                  { type: 'perorangan', icon: User, title: 'Perorangan', desc: 'Untuk usaha pribadi / UMKM. Cukup KTP & foto toko.', badge: 'Paling umum' },
                  { type: 'perusahaan', icon: Building2, title: 'Perusahaan', desc: 'Untuk PT / CV. Perlu NIB & dokumen perusahaan.', badge: 'Badan usaha' },
                ] as const).map(({ type, icon: Icon, title, desc, badge }) => (
                  <button
                    key={type}
                    onClick={() => { setForm((f) => ({ ...f, businessType: type })); setError('') }}
                    className={`rounded-2xl border-2 p-5 text-left transition ${form.businessType === type ? 'border-[#003A20] bg-emerald-900/5' : 'border-zinc-100 hover:border-zinc-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-900/10">
                        <Icon className="h-5 w-5 text-emerald-900" />
                      </div>
                      <span className="rounded-full bg-[#F97316]/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#F97316]">{badge}</span>
                    </div>
                    <p className="mt-3 font-bold text-zinc-900">{title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Akun */}
          {step === 1 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">Buat akun merchant</h1>
              <p className="text-sm text-zinc-500">Email & password ini dipakai untuk login di aplikasi TEMBUS Merchant nantinya.</p>
              <Field label="Nama lengkap pemilik" required value={form.fullName} onChange={update('fullName')} placeholder="Nama sesuai KTP" />
              <Field label="Email" required type="email" value={form.email} onChange={update('email')} placeholder="nama@email.com" />
              <Field label="Nomor HP" required type="tel" value={form.phoneNumber} onChange={update('phoneNumber')} placeholder="08xxxxxxxxxx" />
              <Field label="Password" required type="password" value={form.password} onChange={update('password')} placeholder="Minimal 8 karakter" />
            </div>
          )}

          {/* Step 2: Toko */}
          {step === 2 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">Data tokomu</h1>
              <p className="text-sm text-zinc-500">Info ini yang tampil ke pelanggan & dipakai driver untuk antar order.</p>
              <Field label="Nama toko" required value={form.storeName} onChange={update('storeName')} placeholder="Nama toko / warung" />
              <label className="block">
                <span className="text-sm font-bold text-zinc-700">Alamat lengkap <span className="text-[#F97316]">*</span></span>
                <textarea
                  value={form.address}
                  onChange={(e) => update('address')(e.target.value)}
                  placeholder="Jalan, RT/RW, kelurahan, kecamatan, kota"
                  rows={3}
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-emerald-900 focus:ring-2 focus:ring-emerald-900/10"
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Jam buka" required value={form.openHour} onChange={update('openHour')} type="time" />
                <Field label="Jam tutup" required value={form.closeHour} onChange={update('closeHour')} type="time" />
              </div>
              <LocationPicker
                lat={form.latitude}
                lng={form.longitude}
                onChange={(lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }))}
              />
            </div>
          )}

          {/* Step 3: Dokumen */}
          {step === 3 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">Upload dokumen</h1>
              <p className="text-sm text-zinc-500">Dokumen diverifikasi admin dalam 1×24 jam kerja. Data kamu aman & terenkripsi.</p>
              {requiredDocsFor(form.businessType).map(docUrlInput)}
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">Periksa kembali</h1>
              <p className="mt-1 text-sm text-zinc-500">Pastikan semua data benar sebelum dikirim.</p>
              <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-100">
                {[
                  ['Jenis usaha', form.businessType === 'perorangan' ? 'Perorangan' : 'Perusahaan'],
                  ['Nama pemilik', form.fullName],
                  ['Email', form.email],
                  ['Nomor HP', form.phoneNumber],
                  ['Nama toko', form.storeName],
                  ['Alamat', form.address],
                  ['Jam operasional', `${form.openHour} – ${form.closeHour}`],
                  ['Lokasi toko', form.latitude !== null && form.longitude !== null
                    ? `${form.latitude.toFixed(6)}, ${form.longitude.toFixed(6)}`
                    : 'Belum ditandai di peta'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-6 border-b border-zinc-100 px-5 py-3.5 last:border-0">
                    <span className="text-sm text-zinc-500">{label}</span>
                    <span className="text-right text-sm font-bold text-zinc-900">{value}</span>
                  </div>
                ))}
                <div className="flex items-start justify-between gap-6 bg-zinc-50 px-5 py-3.5">
                  <span className="text-sm text-zinc-500">Dokumen</span>
                  <span className="text-right text-sm font-bold text-emerald-900">
                    {requiredDocsFor(form.businessType).filter((d) => form[d.key]).length}/{requiredDocsFor(form.businessType).length} terupload
                  </span>
                </div>
              </div>
              <div className="mt-5 flex items-start gap-3 rounded-2xl bg-emerald-900/5 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-900" />
                <p className="text-xs leading-relaxed text-zinc-600">
                  Dengan mengirim, kamu setuju data & dokumen diperiksa admin TEMBUS untuk verifikasi.
                  Pendaftaran gratis tanpa komitmen apa pun.
                </p>
              </div>
            </div>
          )}

          {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

          {/* Nav buttons */}
          <div className="mt-8 flex items-center justify-between gap-4">
            {step > 0 ? (
              <button onClick={() => { setStep((s) => s - 1); setError('') }} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-5 py-3 font-bold text-zinc-700 transition hover:border-zinc-300">
                <ArrowLeft className="h-4 w-4" /> Kembali
              </button>
            ) : (
              <span />
            )}
            {isLastStep ? (
              <button
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-[#F97316] px-7 py-3.5 font-bold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Store className="h-5 w-5" />}
                {submitting ? 'Mengirim...' : 'Kirim Pendaftaran'}
              </button>
            ) : (
              <button onClick={next} className="inline-flex items-center gap-2 rounded-xl bg-[#003A20] px-7 py-3.5 font-bold text-white transition hover:bg-emerald-950">
                Lanjut <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
