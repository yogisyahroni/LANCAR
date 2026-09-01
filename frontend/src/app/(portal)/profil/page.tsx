'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { api } from '@/lib/api';
import { customerApiRootUrl } from '@/lib/runtimeConfig';
import { clientLog } from '@/lib/clientLogger';
import {
  User,
  ShieldCheck,
  BellRing,
  Gift,
  Camera,
  Copy,
  Share2,
  Key,
  LogOut,
  CheckCircle,
  X,
  Loader2,
  Smartphone,
  Globe,
  Award,
  ToggleLeft,
  ToggleRight,
  Building2,
  Wallet
} from 'lucide-react';
import { SafeImage } from '@/components/a11y/SafeImage';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const LEGACY_PROFILE_PIC_KEY = 'tembus_profile_pic';
const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PROFILE_PHOTO_MIN_DIMENSION = 96;
const PROFILE_PHOTO_MAX_DIMENSION = 4096;
const PROFILE_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const readImageDimensions = (file: File) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Invalid image file'));
    };

    image.src = objectUrl;
  });

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

interface LoginRecord {
  id: string;
  device: string;
  ip: string;
  location: string;
  timestamp: string;
  is_current: boolean;
}

export default function ProfilPage() {
  const { user, setAuth } = useAuthStore();
  const { addNotification } = useNotificationStore();

  // Active Tab: 'akun' | 'rekening' | 'keamanan' | 'notifikasi' | 'referral'
  const [activeTab, setActiveTab] = useState<'akun' | 'rekening' | 'keamanan' | 'notifikasi' | 'referral'>('akun');

  // Tab Akun fields
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState('');
  const [storeName, setStoreName] = useState('');
  const [defaultPickupAddress, setDefaultPickupAddress] = useState('');
  const [awbSenderName, setAwbSenderName] = useState('');
  const [profilePic, setProfilePic] = useState<string | null>(null);

  // Tab Rekening Bank fields
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [isSavingBank, setIsSavingBank] = useState(false);

  // Crop Photo Modal State
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [tempImageFile, setTempImageFile] = useState<File | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Tab Keamanan fields
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Tab Notifikasi toggles
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [waEnabled, setWaEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [waDetailLevel, setWaDetailLevel] = useState<'ringkas' | 'lengkap'>('lengkap');

  const [loginHistory, setLoginHistory] = useState<LoginRecord[]>([]);

  // Tab Referral stats
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [totalReferred] = useState(0);
  const [claimedRewards] = useState(0);
  const [pendingRewards] = useState(0);

  // Load any customized preferences locally
  useEffect(() => {
    if (user?.name) setName(user.name);
    if (user?.email) setEmail(user.email);
    localStorage.removeItem(LEGACY_PROFILE_PIC_KEY);

    api.get('/customer/profile')
      .then((res) => {
        const profile = res.data?.data;
        if (!profile) return;
        setName(profile.name || '');
        setPhone(profile.phone_number || '');
        setProfilePic(profile.profile_image_url || null);
        setReferralCode(profile.referral_code || null);
        setStoreName(profile.store_name || '');
        setDefaultPickupAddress(profile.default_pickup_address || '');
        setAwbSenderName(profile.awb_sender_name || '');
        setBankName(profile.bank_name || '');
        setBankAccountNumber(profile.bank_account_number || '');
        setBankAccountHolder(profile.bank_account_holder || '');
      })
      .catch(() => {
        addNotification({ title: 'Info', message: 'Profil customer belum dapat dimuat dari server.', type: 'info' });
      });

    api.get('/auth/web/sessions')
      .then((res) => setLoginHistory(res.data?.sessions || []))
      .catch(() => setLoginHistory([]));

    if (typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator) {
      if (Notification.permission === 'granted') {
        navigator.serviceWorker.ready.then((reg) => {
          reg.pushManager.getSubscription().then((sub) => {
            if (sub) {
              setPushEnabled(true);
            }
          });
        });
      }
    }
  }, [user, addNotification]);

  // Tab Akun Handlers
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!PROFILE_PHOTO_MIME_TYPES.has(file.type)) {
      addNotification({ title: 'Gagal', message: 'Gunakan foto JPG, PNG, atau WebP.', type: 'error' });
      return;
    }

    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      addNotification({ title: 'Gagal', message: 'Ukuran foto profil maksimal 2MB.', type: 'error' });
      return;
    }

    try {
      const dimensions = await readImageDimensions(file);
      const smallestSide = Math.min(dimensions.width, dimensions.height);
      const largestSide = Math.max(dimensions.width, dimensions.height);
      if (smallestSide < PROFILE_PHOTO_MIN_DIMENSION || largestSide > PROFILE_PHOTO_MAX_DIMENSION) {
        addNotification({
          title: 'Gagal',
          message: 'Dimensi foto harus minimal 96px dan maksimal 4096px.',
          type: 'error'
        });
        return;
      }
    } catch {
      addNotification({ title: 'Gagal', message: 'File gambar tidak valid.', type: 'error' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result as string;
      setTempImage(bstr);
      setTempImageFile(file);
      setIsCropOpen(true);
    };
    reader.onerror = () => {
      addNotification({ title: 'Gagal', message: 'Foto profil tidak dapat dibaca.', type: 'error' });
    };
    reader.readAsDataURL(file);
  };

  const handleCloseCrop = () => {
    if (isUploadingPhoto) return;
    setIsCropOpen(false);
    setTempImage(null);
    setTempImageFile(null);
  };

  const handleConfirmCrop = async () => {
    if (!tempImageFile) {
      addNotification({ title: 'Gagal', message: 'Pilih foto profil terlebih dahulu.', type: 'error' });
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('photo', tempImageFile);

      const response = await api.post('/customer/profile/photo', formData);

      const uploadedUrl = response.data?.data?.profile_image_url;
      if (!uploadedUrl) {
        throw new Error('Profile image URL missing from upload response');
      }

      setProfilePic(uploadedUrl);
      setTempImage(null);
      setTempImageFile(null);
      setIsCropOpen(false);
      addNotification({ title: 'Sukses', message: 'Foto profil berhasil diunggah.', type: 'success' });
    } catch (error) {
      clientLog.error('Profile photo upload failed', { error });
      addNotification({ title: 'Error', message: 'Gagal mengunggah foto profil ke server.', type: 'error' });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !phone) {
      addNotification({ title: 'Error', message: 'Field tidak boleh kosong.', type: 'error' });
      return;
    }

    api.put('/customer/profile', { 
        name, 
        phone_number: phone, 
        store_name: storeName, 
        default_pickup_address: defaultPickupAddress,
        awb_sender_name: awbSenderName
      })
      .then(() => {
        if (user) {
          setAuth(true, { ...user, name, email, store_name: storeName, default_pickup_address: defaultPickupAddress, awb_sender_name: awbSenderName });
        }
        addNotification({ title: 'Sukses', message: 'Pengaturan akun berhasil disimpan.', type: 'success' });
      })
      .catch(() => {
        addNotification({ title: 'Error', message: 'Gagal menyimpan profil ke server.', type: 'error' });
      });
  };

  // Tab Keamanan Handlers
  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPin || !newPin || !confirmPin) {
      addNotification({ title: 'Gagal', message: 'Harap lengkapi semua field PIN.', type: 'error' });
      return;
    }
    if (newPin.length !== 6 || confirmPin.length !== 6) {
      addNotification({ title: 'Gagal', message: 'PIN harus terdiri dari 6 digit angka.', type: 'error' });
      return;
    }
    if (newPin !== confirmPin) {
      addNotification({ title: 'Gagal', message: 'Konfirmasi PIN baru tidak sesuai.', type: 'error' });
      return;
    }

    try {
      await api.post('/customer/security/pin', { current_pin: currentPin, new_pin: newPin });
      addNotification({ title: 'Berhasil', message: 'PIN Keamanan Anda berhasil diubah.', type: 'success' });
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (error: any) {
      addNotification({
        title: 'Gagal',
        message: error?.response?.data?.error || 'PIN tidak dapat diubah di server.',
        type: 'error',
      });
    }
  };

  const handleLogoutAllDevices = async () => {
    try {
      await api.post('/auth/web/sessions/logout-others');
      setLoginHistory((current) => current.filter((item) => item.is_current));
      addNotification({ title: 'Sukses', message: 'Berhasil logout dari semua perangkat lain.', type: 'success' });
    } catch {
      addNotification({ title: 'Gagal', message: 'Sesi perangkat lain belum dapat dikeluarkan.', type: 'error' });
    }
  };

  // Tab Referral Handlers
  const handleCopyCode = () => {
    if (!referralCode) {
      addNotification({ title: 'Info', message: 'Kode referral belum tersedia.', type: 'info' });
      return;
    }
    navigator.clipboard.writeText(referralCode);
    addNotification({ title: 'Tersalin', message: 'Kode referral berhasil disalin ke clipboard.', type: 'success' });
  };

  const handleClaimRewards = () => {
    if (pendingRewards === 0) {
      addNotification({ title: 'Info', message: 'Tidak ada bonus reward yang bisa dicairkan saat ini.', type: 'info' });
      return;
    }
    addNotification({ title: 'Info', message: 'Pencairan reward harus diproses dari data reward server.', type: 'info' });
  };

  const togglePushNotification = async () => {
    if (typeof window === 'undefined') return;

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      addNotification({ title: 'Not Supported', message: 'Browser Anda tidak mendukung push notifications.', type: 'info' });
      return;
    }

    setIsPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!pushEnabled) {
        // Turning on
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          addNotification({ title: 'Akses Ditolak', message: 'Izin notifikasi tidak diberikan.', type: 'error' });
          setIsPushLoading(false);
          return;
        }

        if (!VAPID_PUBLIC_KEY) {
          throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured');
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        const serializedSubscription = sub.toJSON();

        await api.post('/auth/web/notifications/subscribe', {
          endpoint: sub.endpoint,
          keys: serializedSubscription.keys || { p256dh: '', auth: '' }
        });

        setPushEnabled(true);
        addNotification({ title: 'Sukses Aktif', message: 'Browser push notifications berhasil diaktifkan.', type: 'success' });
      } else {
        // Turning off
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await api.delete('/auth/web/notifications/subscribe', {
            data: { endpoint: sub.endpoint }
          });
        }
        setPushEnabled(false);
        addNotification({ title: 'Dinonaktifkan', message: 'Browser push notifications telah dimatikan.', type: 'info' });
      }
    } catch (err: any) {
      clientLog.error('Push notification toggle failed', { error: err });
      addNotification({ title: 'Error', message: 'Gagal mengubah preferensi notifikasi.', type: 'error' });
    } finally {
      setIsPushLoading(false);
    }
  };

  const handleSaveBank = async () => {
    try {
      setIsSavingBank(true);
      await api.patch('/profile/bank', {
        bank_name: bankName,
        bank_account_number: bankAccountNumber,
        bank_account_holder: bankAccountHolder,
      });
      addNotification({
        title: 'Rekening Berhasil Disimpan',
        message: 'Informasi rekening pencairan settlement merchant telah diperbarui.',
        type: 'success',
      });
    } catch (err: any) {
      addNotification({
        title: 'Gagal Menyimpan Rekening',
        message: err?.response?.data?.error || 'Terjadi kesalahan sistem saat memperbarui rekening.',
        type: 'error',
      });
    } finally {
      setIsSavingBank(false);
    }
  };

  return (
    <div className="space-y-6 select-none">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="select-none"
      >
        <h1 className="text-3xl font-bold tracking-tight text-foreground select-none">
          Profil & Pengaturan
        </h1>
        <p className="text-sm text-muted-foreground mt-1 select-none">
          Kelola informasi akun, keamanan akses, preferensi notifikasi, dan program referral.
        </p>
      </motion.div>

      {/* Complete tab header navigation slider */}
      <div className="flex border-b border-border/40 gap-1 select-none overflow-x-auto">
        {[
          { id: 'akun', label: 'Informasi Akun', icon: User },
          { id: 'rekening', label: 'Rekening Bank', icon: Building2 },
          { id: 'keamanan', label: 'Keamanan & Login', icon: ShieldCheck },
          { id: 'notifikasi', label: 'Preferensi Notif', icon: BellRing },
          { id: 'referral', label: 'Referral & Reward', icon: Gift },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`flex items-center gap-2.5 px-4 py-3 border-b-2 text-xs font-bold transition-all whitespace-nowrap select-none cursor-pointer ${
                isActive
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Main Panel views dynamic tabs content */}
      <div className="bg-card/60 border border-border/40 rounded-2xl p-6 backdrop-blur-md shadow-sm min-h-[460px] select-none flex flex-col justify-between">
        <AnimatePresence mode="wait">
          {/* TAB 1: AKUN */}
          {activeTab === 'akun' && (
            <motion.div
              key="akun"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 select-none flex flex-col justify-between h-full"
            >
              <div className="flex flex-col md:flex-row gap-8 items-start select-none">
                {/* Photo profile container with secure backend upload */}
                <div className="relative group flex-shrink-0 select-none">
                  <div className="h-32 w-32 rounded-3xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-3xl font-extrabold text-primary overflow-hidden shadow-sm relative">
                    {profilePic ? (
                      <SafeImage src={profilePic.startsWith('/') ? `${customerApiRootUrl}${profilePic}` : profilePic} alt="Foto profil" className="h-full w-full object-cover select-none" />
                    ) : (
                      name.charAt(0).toUpperCase() || 'C'
                    )}
                  </div>

                  {/* Photo Edit upload button trigger overlay */}
                  <label className="absolute bottom-2 right-2 p-2 bg-card border border-border/40 hover:bg-muted text-foreground rounded-xl shadow-md transition-all cursor-pointer hover:scale-105 active:scale-95 select-none">
                    <Camera className="h-4 w-4" />
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
                  </label>
                </div>

                {/* Information form fields */}
                <form onSubmit={handleSaveAccount} className="flex-1 w-full space-y-4 select-none">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 select-none">
                    <div>
                      <label className="text-xs font-bold text-muted-foreground select-none">Nama Lengkap</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-muted/40 border border-border/40 p-2.5 rounded-xl text-sm focus:outline-none focus:border-primary/60 mt-1 select-none font-semibold text-foreground"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground select-none">Nomor HP</label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-muted/40 border border-border/40 p-2.5 rounded-xl text-sm focus:outline-none focus:border-primary/60 mt-1 select-none font-semibold text-foreground"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-muted-foreground select-none">Alamat Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-muted/40 border border-border/40 p-2.5 rounded-xl text-sm focus:outline-none focus:border-primary/60 mt-1 select-none font-semibold text-foreground"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 select-none">
                    <div>
                      <label className="text-xs font-bold text-muted-foreground select-none">Nama Toko</label>
                      <input
                        type="text"
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        placeholder="Nama Toko Anda"
                        className="w-full bg-muted/40 border border-border/40 p-2.5 rounded-xl text-sm focus:outline-none focus:border-primary/60 mt-1 select-none font-semibold text-foreground"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground select-none">Nama Pengirim (Resi)</label>
                      <input
                        type="text"
                        value={awbSenderName}
                        onChange={(e) => setAwbSenderName(e.target.value)}
                        placeholder="Nama Pengirim di Resi JNE/JNT"
                        className="w-full bg-muted/40 border border-border/40 p-2.5 rounded-xl text-sm focus:outline-none focus:border-primary/60 mt-1 select-none font-semibold text-foreground"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1 select-none">
                        Nama ini akan muncul sebagai nama pengirim di resi JNE/JNT. Harus unik dan tidak boleh sama dengan akun lain.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-muted-foreground select-none">Default Pickup Address</label>
                    <input
                      type="text"
                      value={defaultPickupAddress}
                      onChange={(e) => setDefaultPickupAddress(e.target.value)}
                      placeholder="Alamat penjemputan default"
                      className="w-full bg-muted/40 border border-border/40 p-2.5 rounded-xl text-sm focus:outline-none focus:border-primary/60 mt-1 select-none font-semibold text-foreground"
                    />
                  </div>

                  {/* Loyalty tier info visual element */}
                  <div className="p-4 bg-muted/40 border border-border/40 rounded-xl space-y-2 select-none">
                    <div className="flex justify-between items-center select-none">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1 select-none">
                        <Award className="h-4 w-4 text-primary" /> Loyalty Tier: Standard Member
                      </span>
                      <span className="text-xs text-primary font-bold select-none">Bronze Level</span>
                    </div>
                    <div className="w-full h-2 bg-card border border-border/40 rounded-full overflow-hidden select-none">
                      <div className="bg-primary h-full rounded-full transition-all select-none" style={{ width: '45%' }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground select-none">
                      Lakukan <strong className="text-foreground">6 order lagi</strong> untuk naik ke Silver Tier (Potongan ongkir Rp1.000 per order).
                    </p>
                  </div>

                  <div className="flex justify-end pt-2 select-none">
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none"
                    >
                      <CheckCircle className="h-4 w-4" /> Simpan Perubahan
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

          {/* TAB 2: REKENING BANK SETTLEMENT */}
          {activeTab === 'rekening' && (
            <motion.div
              key="rekening"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 select-none"
            >
              <div className="p-6 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm space-y-6">
                <div>
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-primary" />
                    Rekening Bank Pencairan (Settlement & Escrow)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Rekening tujuan pencairan dana dari pesanan COD/Agregator maupun penahanan Escrow setelah paket sukses terkirim dan terverifikasi POD.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground">Nama Bank</label>
                    <input
                      type="text"
                      placeholder="Contoh: BCA / Mandiri / BRI / BNI"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full bg-muted/40 border border-border/40 p-3 rounded-xl text-sm font-medium focus:outline-none focus:border-primary/60 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground">Nomor Rekening</label>
                    <input
                      type="text"
                      placeholder="Contoh: 1234567890"
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value)}
                      className="w-full bg-muted/40 border border-border/40 p-3 rounded-xl text-sm font-mono font-semibold focus:outline-none focus:border-primary/60 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground">Atas Nama Pemilik Rekening</label>
                    <input
                      type="text"
                      placeholder="Nama sesuai buku rekening"
                      value={bankAccountHolder}
                      onChange={(e) => setBankAccountHolder(e.target.value)}
                      className="w-full bg-muted/40 border border-border/40 p-3 rounded-xl text-sm font-medium focus:outline-none focus:border-primary/60 mt-1"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleSaveBank}
                    disabled={isSavingBank}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingBank ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Simpan Rekening Pencairan
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 3: KEAMANAN */}
          {activeTab === 'keamanan' && (
            <motion.div
              key="keamanan"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 select-none flex flex-col justify-between h-full"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 select-none">
                {/* Form to change current login security PIN */}
                <form onSubmit={handleUpdatePin} className="space-y-4 select-none">
                  <div>
                    <h3 className="text-sm font-bold text-foreground select-none">Ubah PIN Keamanan</h3>
                    <p className="text-xs text-muted-foreground select-none">Amankan akun Anda dengan mengganti PIN 6 digit secara berkala.</p>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-muted-foreground select-none">PIN Lama</label>
                    <input
                      type="password"
                      maxLength={6}
                      placeholder="Masukkan PIN saat ini"
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value)}
                      className="w-full bg-muted/40 border border-border/40 p-2.5 rounded-xl text-sm focus:outline-none focus:border-primary/60 mt-1 select-none font-semibold text-foreground font-mono tracking-widest"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 select-none">
                    <div>
                      <label className="text-xs font-bold text-muted-foreground select-none">PIN Baru</label>
                      <input
                        type="password"
                        maxLength={6}
                        placeholder="6 digit angka"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        className="w-full bg-muted/40 border border-border/40 p-2.5 rounded-xl text-sm focus:outline-none focus:border-primary/60 mt-1 select-none font-semibold text-foreground font-mono tracking-widest"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground select-none">Ulangi PIN Baru</label>
                      <input
                        type="password"
                        maxLength={6}
                        placeholder="Ulangi PIN baru"
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value)}
                        className="w-full bg-muted/40 border border-border/40 p-2.5 rounded-xl text-sm focus:outline-none focus:border-primary/60 mt-1 select-none font-semibold text-foreground font-mono tracking-widest"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end select-none">
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none"
                    >
                      <Key className="h-3.5 w-3.5" /> Simpan PIN
                    </button>
                  </div>
                </form>

                {/* Login session history records */}
                <div className="space-y-4 select-none">
                  <div className="flex justify-between items-center select-none">
                    <div>
                      <h3 className="text-sm font-bold text-foreground select-none">Perangkat yang Terhubung</h3>
                      <p className="text-xs text-muted-foreground select-none">Kelola semua sesi perangkat aktif Anda.</p>
                    </div>
                    {loginHistory.length > 1 && (
                      <button
                        onClick={handleLogoutAllDevices}
                        className="text-xs font-semibold text-destructive hover:underline transition-all cursor-pointer select-none"
                      >
                        Logout semua perangkat lain
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5 select-none">
                    {loginHistory.map((item) => (
                      <div
                        key={item.id}
                        className={`p-3.5 border rounded-xl flex items-center justify-between gap-4 select-none ${
                          item.is_current ? 'border-primary/30 bg-primary/5 ring-1 ring-primary/10' : 'border-border/40 bg-muted/20'
                        }`}
                      >
                        <div className="flex items-center gap-3 select-none">
                          <Smartphone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="select-none">
                            <h4 className="text-xs font-bold text-foreground truncate max-w-[200px] select-none">
                              {item.device}
                            </h4>
                            <span className="text-[10px] text-muted-foreground block select-none">
                              {item.ip} • {item.location}
                            </span>
                          </div>
                        </div>

                        {item.is_current ? (
                          <span className="text-[9px] bg-brand-emerald-500/10 text-brand-emerald-500 border border-brand-emerald-500/20 font-bold px-1.5 py-0.5 rounded-full select-none uppercase">
                            Sesi Aktif
                          </span>
                        ) : (
                          <span className="text-[9px] text-muted-foreground select-none">
                            {item.timestamp}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 3: NOTIFIKASI */}
          {activeTab === 'notifikasi' && (
            <motion.div
              key="notifikasi"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 select-none flex flex-col justify-between h-full"
            >
              <div className="space-y-4 max-w-2xl select-none">
                <div>
                  <h3 className="text-sm font-bold text-foreground select-none">Pengaturan & Preferensi Notifikasi</h3>
                  <p className="text-xs text-muted-foreground select-none">Tentukan media yang ingin Anda terima sebagai update pengiriman paket.</p>
                </div>

                <div className="space-y-3.5 select-none">
                  {/* Push Notifications in Browser */}
                  <div className="p-4 border border-border/40 bg-muted/20 rounded-2xl flex items-center justify-between select-none">
                    <div>
                      <h4 className="text-xs font-bold text-foreground select-none">Notifikasi Native Browser</h4>
                      <p className="text-[11px] text-muted-foreground select-none">Munculkan notifikasi pop-up saat ada update status kiriman di browser Anda.</p>
                    </div>
                    <button
                      onClick={togglePushNotification}
                      disabled={isPushLoading}
                      className="cursor-pointer select-none disabled:opacity-50 flex items-center gap-2"
                    >
                      {isPushLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                      {pushEnabled ? <ToggleRight className="h-7 w-7 text-primary" /> : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
                    </button>
                  </div>

                  {/* WhatsApp Push Notifications */}
                  <div className="p-4 border border-border/40 bg-muted/20 rounded-2xl space-y-4 select-none">
                    <div className="flex items-center justify-between select-none">
                      <div>
                        <h4 className="text-xs font-bold text-foreground select-none">WhatsApp Alerts</h4>
                        <p className="text-[11px] text-muted-foreground select-none">Dapatkan ringkasan update status langsung via pesan WhatsApp.</p>
                      </div>
                      <button
                        onClick={() => setWaEnabled(!waEnabled)}
                        className="cursor-pointer select-none"
                      >
                        {waEnabled ? <ToggleRight className="h-7 w-7 text-primary" /> : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
                      </button>
                    </div>

                    {/* Expand Detail level parameters for WhatsApp updates */}
                    {waEnabled && (
                      <div className="pt-3 border-t border-border/40 flex items-center justify-between select-none">
                        <span className="text-xs text-muted-foreground font-semibold select-none">Tingkat Detail Informasi WA:</span>
                        <div className="flex gap-1.5 select-none">
                          {['ringkas', 'lengkap'].map((lvl) => (
                            <button
                              key={lvl}
                              onClick={() => setWaDetailLevel(lvl as any)}
                              className={`px-3 py-1.5 text-[10px] font-bold rounded-xl capitalize transition-all select-none cursor-pointer ${
                                waDetailLevel === lvl
                                  ? 'bg-primary text-white shadow-sm'
                                  : 'bg-muted/60 text-muted-foreground border border-border/40'
                              }`}
                            >
                              {lvl}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Email Notifications */}
                  <div className="p-4 border border-border/40 bg-muted/20 rounded-2xl flex items-center justify-between select-none">
                    <div>
                      <h4 className="text-xs font-bold text-foreground select-none">Laporan via Email</h4>
                      <p className="text-[11px] text-muted-foreground select-none">Kirimkan rincian bukti manifest dan faktur biaya ke email Anda.</p>
                    </div>
                    <button
                      onClick={() => setEmailEnabled(!emailEnabled)}
                      className="cursor-pointer select-none"
                    >
                      {emailEnabled ? <ToggleRight className="h-7 w-7 text-primary" /> : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2 select-none">
                <button
                  onClick={() => addNotification({ title: 'Sukses', message: 'Preferensi notifikasi berhasil disimpan.', type: 'success' })}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none"
                >
                  <CheckCircle className="h-3.5 w-3.5" /> Simpan Pengaturan
                </button>
              </div>
            </motion.div>
          )}

          {/* TAB 4: REFERRAL */}
          {activeTab === 'referral' && (
            <motion.div
              key="referral"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 select-none flex flex-col justify-between h-full"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 select-none">
                {/* Referral active coupon string display and share functions */}
                <div className="space-y-4 select-none">
                  <div>
                    <h3 className="text-sm font-bold text-foreground select-none">Kode Referral Anda</h3>
                    <p className="text-xs text-muted-foreground select-none">Bagikan kode unik Anda kepada teman atau rekan bisnis lainnya.</p>
                  </div>

                  <div className="p-4 bg-muted/40 border border-border/40 rounded-xl space-y-3 select-none">
                    <span className="text-[10px] font-bold text-muted-foreground select-none block uppercase">Kode Aktif Anda</span>
                    <div className="flex items-center justify-between bg-card border border-border/40 p-3 rounded-xl select-none font-mono tracking-wider font-bold text-primary">
                      {referralCode}
                      <div className="flex items-center gap-1 select-none">
                        <button
                          onClick={handleCopyCode}
                          className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-all cursor-pointer select-none"
                          title="Salin Kode"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => addNotification({ title: 'Tershare', message: 'Kode referral siap dibagikan ke media sosial.', type: 'info' })}
                          className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-all cursor-pointer select-none"
                          title="Share Kode"
                        >
                          <Share2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed select-none">
                      Dapatkan <strong className="text-foreground">saldo Rp5.000</strong> per pengguna baru yang berhasil terverifikasi dan mengirimkan paket pertamanya.
                    </p>
                  </div>
                </div>

                {/* Reward history & statistics converter table */}
                <div className="space-y-4 select-none">
                  <div>
                    <h3 className="text-sm font-bold text-foreground select-none">Reward & Performa Referral</h3>
                    <p className="text-xs text-muted-foreground select-none">Ringkasan penukaran dan bonus yang telah Anda kumpulkan.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 select-none">
                    <div className="p-3.5 bg-muted/40 border border-border/40 rounded-xl space-y-1 select-none">
                      <span className="text-[10px] font-bold text-muted-foreground select-none uppercase block">Jumlah Diundang</span>
                      <p className="text-lg font-bold text-foreground select-none">{totalReferred} User</p>
                      <p className="text-[9px] text-muted-foreground select-none">Status Aktif Terverifikasi</p>
                    </div>

                    <div className="p-3.5 bg-muted/40 border border-border/40 rounded-xl space-y-1 select-none">
                      <span className="text-[10px] font-bold text-muted-foreground select-none uppercase block">Sudah Dicairkan</span>
                      <p className="text-lg font-bold text-brand-emerald-500 select-none">
                        Rp{claimedRewards.toLocaleString('id-ID')}
                      </p>
                      <p className="text-[9px] text-muted-foreground select-none">Telah cair ke dompet</p>
                    </div>
                  </div>

                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-center justify-between select-none">
                    <div className="select-none">
                      <span className="text-[10px] font-bold text-muted-foreground select-none block uppercase">Bonus Belum Dicairkan</span>
                      <p className="text-lg font-bold text-primary select-none">
                        Rp{pendingRewards.toLocaleString('id-ID')}
                      </p>
                    </div>
                    <button
                      onClick={handleClaimRewards}
                      className="px-3.5 py-2 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none"
                    >
                      Cairkan Bonus
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Upload/Crop Photo Modal Animation */}
      <AnimatePresence>
        {isCropOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-card border border-border/40 max-w-sm w-full rounded-2xl p-6 shadow-xl space-y-5 my-auto select-none"
            >
              <div className="flex items-center justify-between select-none">
                <h3 className="text-sm font-bold text-foreground select-none">Sesuaikan Foto Profil</h3>
                <button
                  onClick={handleCloseCrop}
                  disabled={isUploadingPhoto}
                  className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-all cursor-pointer select-none"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Real Crop View Simulator Component Frame */}
              <div className="h-56 w-full bg-muted/40 border border-border/40 rounded-xl overflow-hidden flex items-center justify-center relative select-none">
                {tempImage && (
                  <SafeImage src={tempImage} alt="Pratinjau foto" className="h-full w-full object-contain select-none" />
                )}
                <div className="absolute inset-4 border-2 border-dashed border-primary/40 rounded-full pointer-events-none" />
              </div>

              <div className="flex justify-end gap-3 select-none">
                <button
                  onClick={handleCloseCrop}
                  disabled={isUploadingPhoto}
                  className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl transition-all cursor-pointer select-none"
                >
                  Batal
                </button>
                <button
                  onClick={handleConfirmCrop}
                  disabled={isUploadingPhoto}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none"
                >
                  {isUploadingPhoto ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mengunggah
                    </span>
                  ) : (
                    'Gunakan Foto'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
