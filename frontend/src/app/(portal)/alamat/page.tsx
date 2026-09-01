'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { parseCsvText } from '@/lib/csv';
import readXlsxFile from 'read-excel-file/browser';
import { useNotificationStore } from '@/store/useNotificationStore';
import { CustomerPageSkeleton } from '@/components/ui/Skeleton';
import { 
  MapPin, 
  Plus, 
  Edit2, 
  Trash2, 
  Star, 
  Upload, 
  Download, 
  X, 
  FileSpreadsheet, 
  Loader2, 
  Search, 
  CheckCircle,
  HelpCircle 
} from 'lucide-react';

interface Address {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  kind: 'pickup' | 'receiver' | 'both';
}

interface CustomerAddressApi {
  id: string;
  label: string;
  contact_name?: string | null;
  contact_phone_masked?: string | null;
  address: string;
  lat?: number | string | null;
  lng?: number | string | null;
  kind?: 'pickup' | 'receiver' | 'both';
  is_favorite?: boolean;
}

type ImportPreviewRow = {
  rowNumber: number;
  label: string;
  recipientName: string;
  address: string;
  payload?: ReturnType<typeof buildAddressPayload>;
  error?: string;
};

const mapAddressFromApi = (item: CustomerAddressApi): Address => ({
  id: item.id,
  label: item.label,
  recipient_name: item.contact_name || '-',
  phone: item.contact_phone_masked || '-',
  address: item.address,
  latitude: parseCoordinate(item.lat),
  longitude: parseCoordinate(item.lng),
  is_default: Boolean(item.is_favorite),
  kind: item.kind || 'receiver',
});

const parseCoordinate = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasValidCoordinates = (latitude: number | null, longitude: number | null): latitude is number =>
  typeof latitude === 'number' &&
  typeof longitude === 'number' &&
  Number.isFinite(latitude) &&
  Number.isFinite(longitude);

const formatCoordinates = (latitude: number | null, longitude: number | null) => {
  if (latitude === null || longitude === null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return 'Koordinat belum tersedia';
  }
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
};

const buildAddressPayload = (params: {
  label: string;
  recipientName: string;
  phone: string;
  addressText: string;
  latitude: number;
  longitude: number;
  isDefault: boolean;
}) => ({
  label: params.label.trim(),
  contact_name: params.recipientName.trim(),
  contact_phone: params.phone.includes('*') ? undefined : params.phone.trim(),
  address: params.addressText.trim(),
  location: {
    lat: params.latitude,
    lng: params.longitude,
  },
  kind: params.isDefault ? 'both' : 'receiver',
  is_favorite: params.isDefault,
});

export default function AddressBookPage() {
  const { addNotification } = useNotificationStore();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Search & Filters
  const [search, setSearch] = useState('');

  // Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [currentAddressId, setCurrentAddressId] = useState<string | null>(null);

  // Delete modal state
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form Field State
  const [label, setLabel] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressText, setAddressText] = useState('');
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);
  const [isDefault, setIsDefault] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[] | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const loadAddresses = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await api.get('/customer/addresses');
      const items = (response.data?.data || []) as CustomerAddressApi[];
      setAddresses(items.map(mapAddressFromApi));
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Buku alamat belum bisa dimuat dari database.';
      setLoadError(message);
      addNotification({
        title: 'Gagal memuat alamat',
        message,
        type: 'error',
      });
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAddresses();
  }, []);

  const filteredAddresses = addresses.filter((item) =>
    item.label.toLowerCase().includes(search.toLowerCase()) ||
    item.recipient_name.toLowerCase().includes(search.toLowerCase()) ||
    item.address.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setLabel('');
    setRecipientName('');
    setPhone('');
    setAddressText('');
    setLatitude(0);
    setLongitude(0);
    setIsDefault(false);
    setCurrentAddressId(null);
  };

  const openAddModal = () => {
    resetForm();
    setFormMode('add');
    setIsFormOpen(true);
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(Number(position.coords.latitude.toFixed(6)));
          setLongitude(Number(position.coords.longitude.toFixed(6)));
        },
        () => undefined,
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    }
  };

  const openEditModal = (addr: Address) => {
    setLabel(addr.label);
    setRecipientName(addr.recipient_name);
    setPhone(addr.phone);
    setAddressText(addr.address);
    setLatitude(addr.latitude ?? 0);
    setLongitude(addr.longitude ?? 0);
    setIsDefault(addr.is_default);
    setCurrentAddressId(addr.id);
    setFormMode('edit');
    setIsFormOpen(true);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label || !recipientName || !phone || !addressText) {
      addNotification({ title: 'Gagal', message: 'Semua field wajib diisi.', type: 'error' });
      return;
    }
    if (!latitude || !longitude) {
      addNotification({ title: 'Gagal', message: 'Koordinat alamat wajib diisi dari peta atau GPS.', type: 'error' });
      return;
    }

    const payload = buildAddressPayload({
      label,
      recipientName,
      phone,
      addressText,
      latitude,
      longitude,
      isDefault: addresses.length === 0 ? true : isDefault,
    });

    try {
      if (formMode === 'add') {
        await api.post('/customer/addresses', payload);
        addNotification({ title: 'Berhasil', message: 'Alamat baru berhasil ditambahkan.', type: 'success' });
      } else if (formMode === 'edit' && currentAddressId) {
        await api.patch(`/customer/addresses/${currentAddressId}`, payload);
        addNotification({ title: 'Berhasil', message: 'Alamat berhasil diperbarui.', type: 'success' });
      }

      await loadAddresses();
      setIsFormOpen(false);
      resetForm();
    } catch (error: any) {
      addNotification({
        title: 'Gagal menyimpan',
        message: error?.response?.data?.message || 'Alamat belum bisa disimpan.',
        type: 'error',
      });
    }
  };

  const openDeleteModal = (id: string) => {
    setDeleteId(id);
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/customer/addresses/${deleteId}`);
      await loadAddresses();
      setIsDeleteOpen(false);
      setDeleteId(null);
      addNotification({ title: 'Berhasil', message: 'Alamat berhasil dihapus dari daftar.', type: 'success' });
    } catch (error: any) {
      addNotification({
        title: 'Gagal menghapus',
        message: error?.response?.data?.message || 'Alamat belum bisa dihapus.',
        type: 'error',
      });
    }
  };

  const setDefaultPickup = async (id: string) => {
    const selectedAddress = addresses.find((item) => item.id === id);
    if (!selectedAddress) return;
    const selectedLat = selectedAddress.latitude;
    const selectedLng = selectedAddress.longitude;
    if (selectedLat === null || selectedLng === null || !hasValidCoordinates(selectedLat, selectedLng)) {
      addNotification({
        title: 'Koordinat belum lengkap',
        message: 'Alamat ini belum memiliki koordinat valid dari database.',
        type: 'error',
      });
      return;
    }

    try {
      await api.patch(`/customer/addresses/${id}`, {
        label: selectedAddress.label,
        contact_name: selectedAddress.recipient_name,
        address: selectedAddress.address,
        location: {
          lat: selectedLat,
          lng: selectedLng,
        },
        kind: 'both',
        is_favorite: true,
        mark_used: true,
      });
      await loadAddresses();
      addNotification({ title: 'Berhasil', message: 'Alamat default pickup telah diubah.', type: 'success' });
    } catch (error: any) {
      addNotification({
        title: 'Gagal mengubah default',
        message: error?.response?.data?.message || 'Default pickup belum bisa diperbarui.',
        type: 'error',
      });
    }
  };

  const handleAddressImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const isSpreadsheet = /\.xlsx$/i.test(file.name);
        const data = isSpreadsheet
          ? (() => {
              const rows = (evt.target?.result || []) as unknown[][];
              const headers = (rows[0] || []).map((header) => String(header ?? '').trim());
              return rows.slice(1).map((cells) => Object.fromEntries(
                headers.map((header, columnIndex) => [header, cells[columnIndex] ?? ''])
              ));
            })()
          : parseCsvText(String(evt.target?.result || ''));

        if (!data || data.length === 0) {
              addNotification({ title: 'Gagal', message: 'File XLSX/CSV kosong atau format tidak sesuai.', type: 'error' });
          return;
        }

        const preview = data.map((row, index) => {
            const lbl = row.Label || row.label;
            const recName = row['Nama Penerima'] || row.recipient_name || row.nama;
            const ph = row.Telepon || row.phone || row.hp;
            const addrStr = row.Alamat || row.address || row.alamat;
            const lat = parseCoordinate(row.Latitude || row.latitude || row.lat);
            const lng = parseCoordinate(row.Longitude || row.longitude || row.lng);

            if (!lbl || !recName || !ph || !addrStr || lat === null || lng === null) {
              return {
                rowNumber: index + 2,
                label: String(lbl || ''),
                recipientName: String(recName || ''),
                address: String(addrStr || ''),
                error: 'Label, penerima, telepon, alamat, latitude, dan longitude wajib diisi.',
              };
            }

            return buildAddressPayload({
              label: String(lbl),
              recipientName: String(recName),
              phone: String(ph),
              addressText: String(addrStr),
              latitude: lat,
              longitude: lng,
              isDefault: false,
            });
          }).map((row, index) => 'error' in row
            ? row
            : { rowNumber: index + 2, label: String(row.label), recipientName: String(row.contact_name), address: String(row.address), payload: row });

        setImportFileName(file.name);
        setImportPreview(preview);
      } catch (err) {
        addNotification({ title: 'Gagal', message: 'Tidak dapat membaca file XLSX/CSV.', type: 'error' });
      }
    };
    if (/\.xlsx$/i.test(file.name)) {
      readXlsxFile(file).then((rows) => {
        reader.onload?.({ target: { result: rows } } as unknown as ProgressEvent<FileReader>);
      }).catch(() => {
        addNotification({ title: 'Gagal', message: 'Tidak dapat membaca file Excel.', type: 'error' });
      });
    } else reader.readAsText(file);
    e.target.value = '';
  };

  const confirmAddressImport = async () => {
    if (!importPreview) return;
    const validRows = importPreview.filter((row): row is ImportPreviewRow & { payload: ReturnType<typeof buildAddressPayload> } => Boolean(row.payload));
    if (validRows.length === 0) {
      addNotification({ title: 'Gagal', message: 'Tidak ada baris alamat valid untuk diimport.', type: 'error' });
      return;
    }
    setIsImporting(true);
    let imported = 0;
    let failed = 0;
    for (const row of validRows) {
      try {
        await api.post('/customer/addresses', row.payload);
        imported += 1;
      } catch {
        failed += 1;
      }
    }
    setIsImporting(false);
    setImportPreview(null);
    await loadAddresses();
    addNotification({ title: failed ? 'Import selesai sebagian' : 'Sukses Import', message: `${imported} alamat tersimpan${failed ? `, ${failed} gagal` : ''}.`, type: failed ? 'error' : 'success' });
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Label': 'Kantor Cabang Jakarta',
        'Nama Penerima': 'Ibu Ani Lestari',
        'Telepon': '081234567891',
        'Alamat': 'Jl. Karet Belakang No. 45, Kuningan, Jakarta Selatan',
        'Latitude': -6.223412,
        'Longitude': 106.801234
      }
    ];

    const headers = Object.keys(templateData[0]);
    const csv = [headers, ...templateData.map((row) => headers.map((header) => row[header as keyof typeof row]))]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'Template_Alamat_TEMBUS.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <CustomerPageSkeleton />;
  }

  return (
    <div className="space-y-6 select-none">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6 select-none"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground select-none">
            Buku Alamat
          </h1>
          <p className="text-sm text-muted-foreground mt-1 select-none">
            Kelola data alamat penerima dan default pickup pengiriman secara lengkap.
          </p>
        </div>

        {/* Action button: add address & import Excel/CSV */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border/40 hover:bg-muted text-foreground font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-sm select-none">
            <Upload className="h-3.5 w-3.5" /> Import Excel/CSV
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden select-none"
              onChange={handleAddressImport}
            />
          </label>
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border/40 hover:bg-muted text-foreground font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-sm select-none"
            title="Unduh Template CSV untuk Alamat"
          >
            <Download className="h-3.5 w-3.5" /> Template
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none"
          >
            <Plus className="h-4 w-4" /> Tambah Alamat
          </button>
        </div>
      </motion.div>

      {importPreview && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-4" role="dialog" aria-label="Preview import alamat">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-sm font-bold text-foreground">Preview {importFileName}</p><p className="text-xs text-muted-foreground mt-1">{importPreview.filter(row => row.payload).length} valid · {importPreview.filter(row => row.error).length} perlu diperbaiki</p></div>
            <button type="button" onClick={() => setImportPreview(null)} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Tutup preview"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-64 overflow-auto rounded-xl border border-border/40 bg-card/60">
            <table className="w-full text-xs"><thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="p-3 text-left">Baris</th><th className="p-3 text-left">Label</th><th className="p-3 text-left">Penerima</th><th className="p-3 text-left">Status</th></tr></thead><tbody>{importPreview.map(row => <tr key={row.rowNumber} className="border-t border-border/30"><td className="p-3">{row.rowNumber}</td><td className="p-3">{row.label || '-'}</td><td className="p-3">{row.recipientName || '-'}</td><td className={`p-3 ${row.error ? 'text-destructive' : 'text-success'}`}>{row.error || 'Valid'}</td></tr>)}</tbody></table>
          </div>
          <div className="flex justify-end gap-3"><button type="button" onClick={() => setImportPreview(null)} className="px-4 py-2 text-xs font-semibold text-muted-foreground">Batal</button><button type="button" disabled={isImporting || !importPreview.some(row => row.payload)} onClick={confirmAddressImport} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle className="h-3.5 w-3.5" />{isImporting ? 'Menyimpan...' : 'Import baris valid'}</button></div>
        </div>
      )}

      {/* Filter search Bar */}
      <div className="relative select-none">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground select-none" />
        <input
          type="text"
          placeholder="Cari label, penerima, atau rincian alamat..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-card/60 backdrop-blur-md border border-border/40 pl-10 pr-4 py-2.5 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/60 transition-all select-none"
        />
      </div>

      {loadError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <HelpCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="text-sm font-bold text-foreground">Alamat gagal dimuat dari database</p>
              <p className="text-xs text-muted-foreground mt-1">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadAddresses}
            className="px-4 py-2 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 text-xs font-bold hover:bg-destructive/20 transition-all"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Grid address cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 select-none">
        {filteredAddresses.map((addr) => (
          <motion.div
            key={addr.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`p-5 border bg-card/40 backdrop-blur-xl rounded-2xl flex flex-col justify-between gap-4 h-56 transition-all shadow-sm hover:shadow-md hover:border-primary/30 relative select-none ${
              addr.is_default ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20' : 'border-border/40'
            }`}
          >
            {/* Upper label and default pickup check */}
            <div className="flex items-start justify-between select-none">
              <div className="flex-1">
                <div className="flex items-center gap-2 select-none">
                  <h3 className="text-sm font-bold text-foreground truncate select-none">
                    {addr.label}
                  </h3>
                  {addr.is_default && (
                    <span className="flex items-center gap-1 text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full select-none uppercase">
                      <Star className="h-2.5 w-2.5 fill-primary text-primary" /> Default
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-muted-foreground mt-1 select-none">
                  {addr.recipient_name} • {addr.phone}
                </p>
              </div>

              {/* Edit and Delete actions on single card */}
              <div className="flex items-center gap-1 select-none">
                <button
                  onClick={() => openEditModal(addr)}
                  className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-all cursor-pointer select-none"
                  title="Edit Alamat"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => openDeleteModal(addr.id)}
                  className="p-1.5 hover:bg-muted text-destructive hover:text-destructive/80 rounded-lg transition-all cursor-pointer select-none"
                  title="Hapus Alamat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Address text string details */}
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 flex-1 select-none font-medium">
              {addr.address}
            </p>

            {/* Set as Default Pickup Action */}
            {!addr.is_default && (
              <div className="border-t border-border/40 pt-3 flex items-center justify-between select-none">
                <button
                  onClick={() => setDefaultPickup(addr.id)}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer select-none"
                >
                  Set as Default Pickup
                </button>
                <span className="text-[10px] text-muted-foreground font-mono select-none">
                  {formatCoordinates(addr.latitude, addr.longitude)}
                </span>
              </div>
            )}
            {addr.is_default && (
              <div className="border-t border-border/40 pt-3 flex items-center justify-between select-none">
                <span className="text-xs text-success font-bold select-none">Selected for pickup</span>
                <span className="text-[10px] text-muted-foreground font-mono select-none">
                  {formatCoordinates(addr.latitude, addr.longitude)}
                </span>
              </div>
            )}
          </motion.div>
        ))}

        {filteredAddresses.length === 0 && !loadError && (
          <div className="col-span-1 md:col-span-3 text-center py-12 select-none border border-dashed border-border/60 rounded-2xl text-muted-foreground text-sm">
            Tidak ada alamat ditemukan.
          </div>
        )}
      </div>

      {/* Dialog Modal Add/Edit address */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto select-none"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-card border border-border/40 max-w-lg w-full rounded-2xl p-6 shadow-xl space-y-4 my-auto select-none"
            >
              <div className="flex items-center justify-between select-none">
                <h3 className="text-base font-bold text-foreground">
                  {formMode === 'add' ? 'Tambah Alamat Baru' : 'Edit Alamat'}
                </h3>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-all cursor-pointer select-none"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Address input fields */}
              <form onSubmit={handleSaveAddress} className="space-y-3.5 select-none">
                <div>
                  <label className="text-xs font-bold text-muted-foreground select-none">Label Alamat (e.g. Rumah, Kantor)</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Contoh: Kantor Utama"
                    className="w-full bg-muted/40 border border-border/40 p-2.5 rounded-xl text-sm focus:outline-none focus:border-primary/60 mt-1 transition-all select-none font-semibold text-foreground"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5 select-none">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground select-none">Nama Penerima</label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Nama Penerima"
                      className="w-full bg-muted/40 border border-border/40 p-2.5 rounded-xl text-sm focus:outline-none focus:border-primary/60 mt-1 transition-all select-none font-semibold text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground select-none">Nomor Telepon / HP</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Contoh: 081234567891"
                      className="w-full bg-muted/40 border border-border/40 p-2.5 rounded-xl text-sm focus:outline-none focus:border-primary/60 mt-1 transition-all select-none font-semibold text-foreground"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-muted-foreground select-none">Rincian Lengkap Alamat</label>
                  <textarea
                    value={addressText}
                    onChange={(e) => setAddressText(e.target.value)}
                    placeholder="Masukkan jalan, nomor, RT/RW, kecamatan, kota..."
                    rows={3}
                    className="w-full bg-muted/40 border border-border/40 p-2.5 rounded-xl text-sm focus:outline-none focus:border-primary/60 mt-1 transition-all select-none font-semibold text-foreground leading-relaxed"
                  />
                </div>

                {/* Simulated drag pin map verification section */}
                <div className="p-3 bg-muted/40 border border-border/40 rounded-xl space-y-2 select-none">
                  <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 select-none">
                    <MapPin className="h-3.5 w-3.5 text-primary" /> Koordinat Lokasi Peta (Geo Position)
                  </span>
                  <div className="grid grid-cols-2 gap-3.5 select-none">
                    <div>
                      <label className="text-[10px] text-muted-foreground select-none">Latitude</label>
                      <input
                        type="number"
                        step="any"
                        value={latitude}
                        onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                        className="w-full bg-card border border-border/40 p-2 rounded-xl text-sm focus:outline-none focus:border-primary mt-0.5 select-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground select-none">Longitude</label>
                      <input
                        type="number"
                        step="any"
                        value={longitude}
                        onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                        className="w-full bg-card border border-border/40 p-2 rounded-xl text-sm focus:outline-none focus:border-primary mt-0.5 select-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 py-1 select-none">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    id="isDefaultCheck"
                    className="rounded border-border h-4 w-4 cursor-pointer select-none"
                  />
                  <label htmlFor="isDefaultCheck" className="text-xs text-muted-foreground cursor-pointer select-none font-semibold">
                    Set sebagai default pickup point
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4 select-none">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl transition-all cursor-pointer select-none"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none"
                  >
                    <CheckCircle className="h-3.5 w-3.5" /> Simpan Alamat
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Alert Modal */}
      <AnimatePresence>
        {isDeleteOpen && (
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
              className="bg-card border border-border/40 max-w-md w-full rounded-2xl p-6 shadow-xl space-y-4 my-auto select-none"
            >
              <h3 className="text-base font-bold text-foreground select-none">Hapus Alamat</h3>
              <p className="text-xs text-muted-foreground select-none leading-relaxed">
                Apakah Anda yakin ingin menghapus alamat ini dari daftar buku alamat? Tindakan ini tidak dapat dibatalkan.
              </p>

              <div className="flex justify-end gap-3 pt-2 select-none">
                <button
                  onClick={() => setIsDeleteOpen(false)}
                  className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl transition-all cursor-pointer select-none"
                >
                  Batal
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-destructive hover:bg-destructive/90 text-white font-bold text-xs rounded-xl shadow-md shadow-destructive/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none"
                >
                  Hapus
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
