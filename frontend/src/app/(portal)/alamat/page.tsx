'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useNotificationStore } from '@/store/useNotificationStore';
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
import * as XLSX from 'xlsx';

interface Address {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  is_default: boolean;
}

export default function AddressBookPage() {
  const { addNotification } = useNotificationStore();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);

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
  const [latitude, setLatitude] = useState(-6.200000);
  const [longitude, setLongitude] = useState(106.816666);
  const [isDefault, setIsDefault] = useState(false);

  // Load from local storage with starting premium sample data
  useEffect(() => {
    const stored = localStorage.getItem('lancar_addresses');
    if (stored) {
      try {
        setAddresses(JSON.parse(stored));
      } catch (err) {
        console.error('Failed to parse stored addresses', err);
      }
    } else {
      // Starter mock premium addresses
      const sampleAddresses: Address[] = [
        {
          id: 'addr-1',
          label: 'Gudang Utama (Pusat)',
          recipient_name: 'Pak Ahmad Sunarto',
          phone: '081122334455',
          address: 'Jl. Jend. Sudirman Kav 21, Senayan, Jakarta Selatan',
          latitude: -6.223412,
          longitude: 106.801234,
          is_default: true,
        },
        {
          id: 'addr-2',
          label: 'Kantor Cabang Bandung',
          recipient_name: 'Siska Wahyuni',
          phone: '085566778899',
          address: 'Jl. Pasir Kaliki No. 120, Bandung',
          latitude: -6.912345,
          longitude: 107.601234,
          is_default: false,
        }
      ];
      setAddresses(sampleAddresses);
      localStorage.setItem('lancar_addresses', JSON.stringify(sampleAddresses));
    }
    setLoading(false);
  }, []);

  const saveToLocalStorage = (list: Address[]) => {
    localStorage.setItem('lancar_addresses', JSON.stringify(list));
    setAddresses(list);
  };

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
    setLatitude(-6.200000);
    setLongitude(106.816666);
    setIsDefault(false);
    setCurrentAddressId(null);
  };

  const openAddModal = () => {
    resetForm();
    setFormMode('add');
    setIsFormOpen(true);
  };

  const openEditModal = (addr: Address) => {
    setLabel(addr.label);
    setRecipientName(addr.recipient_name);
    setPhone(addr.phone);
    setAddressText(addr.address);
    setLatitude(addr.latitude);
    setLongitude(addr.longitude);
    setIsDefault(addr.is_default);
    setCurrentAddressId(addr.id);
    setFormMode('edit');
    setIsFormOpen(true);
  };

  const handleSaveAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label || !recipientName || !phone || !addressText) {
      addNotification({ title: 'Gagal', message: 'Semua field wajib diisi.', type: 'error' });
      return;
    }

    let updatedList = [...addresses];

    // If marked as default, unset previous default addresses
    if (isDefault) {
      updatedList = updatedList.map((item) => ({ ...item, is_default: false }));
    }

    if (formMode === 'add') {
      const newAddr: Address = {
        id: `addr-${Date.now()}`,
        label,
        recipient_name: recipientName,
        phone,
        address: addressText,
        latitude,
        longitude,
        is_default: updatedList.length === 0 ? true : isDefault,
      };
      updatedList.push(newAddr);
      addNotification({ title: 'Berhasil', message: 'Alamat baru berhasil ditambahkan.', type: 'success' });
    } else if (formMode === 'edit' && currentAddressId) {
      updatedList = updatedList.map((item) =>
        item.id === currentAddressId
          ? {
              ...item,
              label,
              recipient_name: recipientName,
              phone,
              address: addressText,
              latitude,
              longitude,
              is_default: isDefault,
            }
          : item
      );
      addNotification({ title: 'Berhasil', message: 'Alamat berhasil diperbarui.', type: 'success' });
    }

    saveToLocalStorage(updatedList);
    setIsFormOpen(false);
    resetForm();
  };

  const openDeleteModal = (id: string) => {
    setDeleteId(id);
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!deleteId) return;
    const itemToDelete = addresses.find((a) => a.id === deleteId);
    let updatedList = addresses.filter((item) => item.id !== deleteId);

    // If deleting the default, make the first item new default if any
    if (itemToDelete?.is_default && updatedList.length > 0) {
      updatedList[0].is_default = true;
    }

    saveToLocalStorage(updatedList);
    setIsDeleteOpen(false);
    setDeleteId(null);
    addNotification({ title: 'Berhasil', message: 'Alamat berhasil dihapus dari daftar.', type: 'success' });
  };

  const setDefaultPickup = (id: string) => {
    const updatedList = addresses.map((item) => ({
      ...item,
      is_default: item.id === id,
    }));
    saveToLocalStorage(updatedList);
    addNotification({ title: 'Berhasil', message: 'Alamat default pickup telah diubah.', type: 'success' });
  };

  // Import from Excel logic using `xlsx` library
  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (!data || data.length === 0) {
          addNotification({ title: 'Gagal', message: 'File Excel kosong atau format tidak sesuai.', type: 'error' });
          return;
        }

        let updatedList = [...addresses];

        data.forEach((row, i) => {
          const lbl = row.Label || row.label;
          const recName = row['Nama Penerima'] || row.recipient_name || row.nama;
          const ph = row.Telepon || row.phone || row.hp;
          const addrStr = row.Alamat || row.address || row.alamat;
          const lat = parseFloat(row.Latitude || row.latitude || row.lat || '-6.2');
          const lng = parseFloat(row.Longitude || row.longitude || row.lng || '106.81');

          if (lbl && recName && ph && addrStr) {
            updatedList.push({
              id: `addr-excel-${Date.now()}-${i}`,
              label: lbl,
              recipient_name: recName,
              phone: String(ph),
              address: addrStr,
              latitude: isNaN(lat) ? -6.200 : lat,
              longitude: isNaN(lng) ? 106.816 : lng,
              is_default: false,
            });
          }
        });

        saveToLocalStorage(updatedList);
        addNotification({ title: 'Sukses Import', message: `Berhasil menambahkan ${data.length} alamat baru dari Excel.`, type: 'success' });
      } catch (err) {
        console.error('Import excel failed:', err);
        addNotification({ title: 'Gagal', message: 'Tidak dapat membaca file Excel.', type: 'error' });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // Download template Excel file
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

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Addresses');
    XLSX.writeFile(wb, `Template_Alamat_LANCAR.xlsx`);
  };

  if (loading) {
    return (
      <div className="space-y-6 select-none animate-pulse">
        <div className="h-10 bg-muted/60 rounded-xl w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="h-12 bg-muted/40 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-44 bg-muted/40 border border-border/40 rounded-2xl" />
          ))}
        </div>
      </div>
    );
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

        {/* Action button: add address & import Excel */}
        <div className="flex flex-wrap items-center gap-3">
          {/* File Excel Input */}
          <label className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border/40 hover:bg-muted text-foreground font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-sm select-none">
            <Upload className="h-3.5 w-3.5" /> Import Excel
            <input
              type="file"
              accept=".xlsx, .xls"
              className="hidden select-none"
              onChange={handleExcelImport}
            />
          </label>
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border/40 hover:bg-muted text-foreground font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-sm select-none"
            title="Unduh Template Excel untuk Alamat"
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
                  {addr.latitude.toFixed(4)}, {addr.longitude.toFixed(4)}
                </span>
              </div>
            )}
            {addr.is_default && (
              <div className="border-t border-border/40 pt-3 flex items-center justify-between select-none">
                <span className="text-xs text-emerald-500 font-bold select-none">Selected for pickup</span>
                <span className="text-[10px] text-muted-foreground font-mono select-none">
                  {addr.latitude.toFixed(4)}, {addr.longitude.toFixed(4)}
                </span>
              </div>
            )}
          </motion.div>
        ))}

        {filteredAddresses.length === 0 && (
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
