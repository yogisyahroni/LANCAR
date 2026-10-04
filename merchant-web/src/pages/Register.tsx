import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import {
  ArrowLeft, ArrowRight, Building2, Check, FileUp, Loader2, ShieldCheck, Store,
} from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { clearAccessToken, deviceId, getStoredUser, isLoggedIn, markWebSessionEstablished } from '../lib/auth'
import { toast } from 'sonner'
import LocationPicker from '../components/LocationPicker'

// ─── Types ────────────────────────────────────────────────
type FormData = {
  // jenis usaha
  businessType: 'perusahaan'
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
  businessType: 'perusahaan',
  fullName: '', email: '', phoneNumber: '', password: '',
  storeName: '', address: '', openHour: '08:00', closeHour: '22:00', latitude: null, longitude: null,
  ktpPemilikUrl: '', fotoTempatUsahaUrl: '', rekeningBankUrl: '', nibUrl: '',
}

const STEPS = ['Akun', 'Data Bisnis', 'Dokumen', 'Review'] as const

const DOC_FIELDS = [
  { key: 'ktpPemilikUrl', label: 'KTP Pemilik', required: true, hint: 'Foto KTP asli (JPG/PNG/PDF, maks 10MB)' },
  { key: 'fotoTempatUsahaUrl', label: 'Foto Tempat Usaha', required: true, hint: 'Foto tampak depan toko / dapur' },
  { key: 'rekeningBankUrl', label: 'Rekening Bank', required: true, hint: 'Buku tabungan / screenshot rekening' },
  { key: 'nibUrl', label: 'NIB / Izin Usaha', required: true, hint: 'Dokumen legal badan usaha (JPG/PNG/PDF, maks 10MB)' },
] as const

const requiredDocsFor = (businessType: string) =>
  DOC_FIELDS.filter((d) => d.required || businessType === 'perusahaan')

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
  const location = useLocation()
  const navigate = useNavigate()
  const isResubmit = new URLSearchParams(location.search).get('mode') === 'resubmit'
  const [step, setStep] = useState(isResubmit ? 1 : 0)
  const [form, setForm] = useState<FormData>(() => {
    const storedUser = getStoredUser()
    return {
      ...emptyForm,
      fullName: storedUser?.name || '',
      email: storedUser?.email || '',
    }
  })
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadingNames, setUploadingNames] = useState<Record<string, string>>({})
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [otpRequired, setOtpRequired] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpSubmitting, setOtpSubmitting] = useState(false)

  const update = (key: keyof FormData) => (v: string) => setForm((f) => ({ ...f, [key]: v }))

  const validateStep = (): string => {
    if (step === 0) {
      if (form.fullName.trim().length < 2) return 'Nama lengkap minimal 2 karakter.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Email tidak valid.'
      if (form.phoneNumber.replace(/\D/g, '').length < 9) return 'Nomor HP tidak valid (minimal 9 digit).'
      if (form.password.length < 8) return 'Password minimal 8 karakter.'
      return ''
    }
    if (step === 1) {
      if (form.storeName.trim().length < 3) return 'Nama toko minimal 3 karakter.'
      if (form.address.trim().length < 10) return 'Alamat terlalu pendek.'
      if (form.latitude === null || form.longitude === null) return 'Tandai lokasi toko di peta (wajib).'
      return ''
    }
    if (step === 2) {
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
      // Preview via objectURL lokal. Upload server bersifat private dan memakai auth.
      setPreviewUrls((p) => {
        const prev = p[key]
        if (prev) URL.revokeObjectURL(prev)
        return { ...p, [key]: URL.createObjectURL(file) }
      })
      toast.success(`${file.name} berhasil diupload`)
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Upload gagal. Coba lagi.'))
      toast.error('Upload dokumen gagal')
    } finally {
      setUploading(null)
    }
  }

  const submitMerchant = async (token: string | null, user?: { id?: string; name?: string; full_name?: string; email?: string }) => {
    if (token) {
      await api.post('/auth/web/session/exchange', { access_token: token })
      clearAccessToken()
      markWebSessionEstablished({
        id: user?.id,
        name: user?.name || user?.full_name || form.fullName.trim(),
        email: user?.email || form.email.trim(),
      })
    } else if (!isLoggedIn()) {
      throw new Error('Masuk terlebih dahulu untuk memperbaiki pengajuan sebelumnya.')
    }

    // Merchant registration is now authorized by the server-backed web
    // session; the temporary bearer token is not retained in browser storage.
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

    await api.post('/merchant/register', payload)

    toast.success('Pendaftaran berhasil dikirim!')
    navigate('/sukses', { state: { email: form.email.trim() || getStoredUser()?.email || '' } })
  }

  const submit = async () => {
    setSubmitting(true)
    setError('')
    try {
      if (isResubmit) {
        await submitMerchant(null)
        return
      }
      const regRes = await api.post('/auth/customer/register/start', {
        full_name: form.fullName.trim(),
        email: form.email.trim(),
        phone_number: form.phoneNumber.trim(),
        password: form.password,
        device_id: deviceId(),
        device_info: { platform: 'web', app: 'merchant-web' },
      })
      if (regRes.data?.require_otp) {
        setOtpCode('')
        setOtpRequired(true)
        toast.success('Kode verifikasi sudah dikirim')
        return
      }
      const token = regRes.data?.access_token
      if (!token) throw new Error('Registrasi akun belum selesai. Coba lagi atau hubungi bantuan TEMBUS.')
      await submitMerchant(token, regRes.data?.user)
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Pendaftaran gagal. Coba lagi.'))
      toast.error('Pendaftaran gagal')
    } finally {
      setSubmitting(false)
    }
  }

  const verifyRegistrationOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(otpCode)) {
      setError('Masukkan 6 digit kode verifikasi.')
      return
    }
    setOtpSubmitting(true)
    setError('')
    try {
      const res = await api.post('/auth/otp/verify', {
        phone_number: form.email.trim(),
        code: otpCode,
        device_id: deviceId(),
        device_info: { platform: 'web', app: 'merchant-web' },
      })
      if (res.data?.require_2fa) throw new Error('Akun memerlukan verifikasi keamanan tambahan. Hubungi bantuan TEMBUS.')
      const token = res.data?.access_token
      if (!token) throw new Error('Kode verifikasi belum dapat menyelesaikan pendaftaran.')
      await submitMerchant(token, res.data?.user)
      setOtpRequired(false)
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Kode verifikasi salah atau sudah kedaluwarsa.'))
    } finally {
      setOtpSubmitting(false)
    }
  }

  const resendRegistrationOtp = async () => {
    setOtpSubmitting(true)
    setError('')
    try {
      await api.post('/auth/otp/send', { phone_number: form.email.trim() })
      toast.success('Kode verifikasi baru sudah dikirim')
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Kode belum dapat dikirim ulang. Coba beberapa saat lagi.'))
    } finally {
      setOtpSubmitting(false)
    }
  }

  if (otpRequired) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <header className="border-b border-zinc-100 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
            <Link to="/" className="flex items-center gap-2">
              <img src="/tembus-login-logo.webp" alt="TEMBUS" className="merchant-brand-image merchant-brand-image--auth" />
              <span className="font-black text-emerald-900">Mitra</span>
            </Link>
            <span className="text-xs font-bold text-zinc-400">Verifikasi akun</span>
          </div>
        </header>
        <main className="mx-auto max-w-xl px-5 py-14">
          <div className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm md:p-8">
            <h1 className="text-2xl font-black tracking-tight text-zinc-900">Verifikasi pendaftaran</h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">Masukkan 6 digit kode yang dikirim ke {form.email}. Kode berlaku selama 5 menit.</p>
            <form onSubmit={verifyRegistrationOtp} className="mt-8 space-y-4">
              <label className="block">
                <span className="text-sm font-bold text-zinc-700">Kode verifikasi</span>
                <input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 px-4 py-3 text-center text-xl font-black tracking-[0.35em] outline-none transition focus:border-emerald-900 focus:ring-2 focus:ring-emerald-900/10"
                />
              </label>
              {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
              <button type="submit" disabled={otpSubmitting} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#003A20] px-7 py-3.5 font-bold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-950 disabled:opacity-60">
                {otpSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {otpSubmitting ? 'Memverifikasi…' : 'Verifikasi dan kirim pendaftaran'}
              </button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setOtpRequired(false); setError('') }} className="font-semibold text-zinc-500 hover:text-zinc-900">Kembali</button>
                <button type="button" onClick={resendRegistrationOtp} disabled={otpSubmitting} className="font-bold text-emerald-900 hover:underline disabled:opacity-50">Kirim ulang kode</button>
              </div>
            </form>
          </div>
        </main>
      </div>
    )
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
            <img src="/tembus-login-logo.webp" alt="TEMBUS" className="merchant-brand-image merchant-brand-image--auth" />
            <span className="font-black text-emerald-900">Mitra</span>
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
          {isResubmit && (
            <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4">
              <p className="font-bold text-orange-950">Perbaiki pengajuan sebelumnya</p>
              <p className="mt-1 text-sm leading-relaxed text-orange-900/80">
                Lengkapi kembali data toko dan dokumen yang diminta, lalu kirim ulang untuk diperiksa tim TEMBUS.
              </p>
              {!isLoggedIn() && (
                <p className="mt-2 text-sm font-semibold text-orange-950">
                  Masuk terlebih dahulu agar perbaikan tersimpan pada pengajuan yang sama.{' '}
                  <Link to="/masuk?returnTo=%2Fdaftar%3Fmode%3Dresubmit" className="underline">Masuk ke Portal Mitra</Link>
                </p>
              )}
            </div>
          )}
          {/* Step 0: Akun */}
          {step === 0 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">Buat akun bisnis</h1>
              <div className="flex items-start gap-3 rounded-2xl bg-emerald-900/5 p-4">
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-900" />
                <p className="text-sm leading-relaxed text-zinc-600">Pendaftaran web ini khusus untuk PT atau badan usaha. Usaha perorangan dapat mendaftar melalui aplikasi TEMBUS Merchant.</p>
              </div>
              <Field label="Nama lengkap penanggung jawab" required value={form.fullName} onChange={update('fullName')} placeholder="Nama sesuai dokumen resmi" />
              <Field label="Email bisnis" required type="email" value={form.email} onChange={update('email')} placeholder="nama@perusahaan.com" />
              <Field label="Nomor HP penanggung jawab" required type="tel" value={form.phoneNumber} onChange={update('phoneNumber')} placeholder="08xxxxxxxxxx" />
              <Field label="Password" required type="password" value={form.password} onChange={update('password')} placeholder="Minimal 8 karakter" />
            </div>
          )}

          {/* Step 1: Data bisnis */}
          {step === 1 && (
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

          {/* Step 2: Dokumen */}
          {step === 2 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">Upload dokumen</h1>
              <p className="text-sm text-zinc-500">Dokumen akan diperiksa setelah pengajuan dikirim. Data diproses melalui alur verifikasi merchant.</p>
              {requiredDocsFor(form.businessType).map(docUrlInput)}
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">Periksa kembali</h1>
              <p className="mt-1 text-sm text-zinc-500">Pastikan semua data benar sebelum dikirim.</p>
              <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-100">
                {[
                  ['Jenis usaha', 'PT atau badan usaha'],
                  ['Penanggung jawab', form.fullName],
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
                  Pengajuan akan masuk ke alur verifikasi merchant setelah dikirim. Pastikan data dan dokumen yang diunggah sudah benar.
                </p>
              </div>
            </div>
          )}

          {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

          {/* Nav buttons */}
          <div className="mt-8 flex items-center justify-between gap-4">
            {step > (isResubmit ? 1 : 0) ? (
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
                {submitting ? 'Mengirim...' : isResubmit ? 'Kirim ulang pengajuan' : 'Kirim Pendaftaran'}
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
