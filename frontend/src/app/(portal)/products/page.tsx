'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { useNotificationStore } from '@/store/useNotificationStore';
import { 
  Package, 
  Plus, 
  Edit2, 
  Trash2, 
  Upload, 
  Download, 
  X, 
  FileSpreadsheet, 
  Loader2, 
  Search,
  Image as ImageIcon
} from 'lucide-react';

interface Product {
  id: string;
  item_name: string;
  sku: string;
  item_value: number;
  weight_kg: number;
  image_url: string;
}

export default function ProductsPage() {
  const { addNotification } = useNotificationStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Search & Filters
  const [search, setSearch] = useState('');

  // Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  
  // Bulk Modal
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Delete Modal
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form Field State
  const [itemName, setItemName] = useState('');
  const [sku, setSku] = useState('');
  const [itemValue, setItemValue] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await api.get('/products');
      const rawList = response.data?.items || response.data?.data || [];
      const normalizedList = Array.isArray(rawList) ? rawList.map((item: any) => ({
        ...item,
        item_name: item.item_name || item.name || '',
        item_value: Number(item.item_value ?? item.price ?? 0),
        image_url: item.image_url || item.item_image || '',
        weight_kg: Number(item.weight_kg ?? 1),
      })) : [];
      setProducts(normalizedList);
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Katalog produk belum bisa dimuat.';
      setLoadError(message);
      addNotification({
        title: 'Gagal memuat produk',
        message,
        type: 'error',
      });
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const resetForm = () => {
    setItemName('');
    setSku('');
    setItemValue('');
    setWeightKg('');
    setImageUrl('');
    setFormMode('add');
    setCurrentProductId(null);
  };

  const openAddForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditForm = (prod: Product) => {
    setFormMode('edit');
    setCurrentProductId(prod.id);
    setItemName(prod.item_name);
    setSku(prod.sku);
    setItemValue(prod.item_value.toString());
    setWeightKg(prod.weight_kg.toString());
    setImageUrl(prod.image_url);
    setIsFormOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const payload = {
      item_name: itemName.trim(),
      sku: sku.trim(),
      item_value: Number(itemValue),
      weight_kg: Number(weightKg),
      image_url: imageUrl.trim(),
    };

    try {
      if (formMode === 'add') {
        await api.post('/products', payload);
        addNotification({ title: 'Produk ditambahkan', message: 'Produk baru berhasil disimpan', type: 'success' });
      } else {
        await api.put(`/products/${currentProductId}`, payload);
        addNotification({ title: 'Produk diubah', message: 'Perubahan produk berhasil disimpan', type: 'success' });
      }
      setIsFormOpen(false);
      loadProducts();
    } catch (error: any) {
      addNotification({
        title: 'Gagal menyimpan',
        message: error?.response?.data?.error || 'Terjadi kesalahan sistem.',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await api.delete(`/products/${deleteId}`);
      addNotification({ title: 'Produk dihapus', message: 'Produk berhasil dihapus dari katalog', type: 'success' });
      setIsDeleteOpen(false);
      loadProducts();
    } catch (error: any) {
      addNotification({
        title: 'Gagal menghapus',
        message: error?.response?.data?.error || 'Gagal menghapus produk.',
        type: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) return;
    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', bulkFile);

    try {
      const res = await api.post('/products/bulk', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      addNotification({ 
        title: 'Upload Sukses', 
        message: `Berhasil import ${res.data.data?.imported_count || 0} produk`, 
        type: 'success' 
      });
      setIsBulkOpen(false);
      setBulkFile(null);
      loadProducts();
    } catch (error: any) {
      addNotification({
        title: 'Gagal Upload',
        message: error?.response?.data?.error || 'Gagal import produk dari CSV.',
        type: 'error',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = "item_name,sku,item_value,weight_kg,image_url\nKemeja Pria,KMJ-001,150000,0.5,https://example.com/img.jpg\nCelana Jeans,CLN-002,250000,1.2,\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "template_katalog_produk.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredProducts = products.filter(p => 
    p.item_name.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Katalog Produk</h1>
          <p className="text-muted-foreground mt-1">
            Kelola daftar produk Anda untuk pembuatan resi dan payment link yang lebih cepat.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsBulkOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors font-medium text-sm"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={openAddForm}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Tambah Produk
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/20 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari berdasarkan nama atau SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p>Memuat katalog produk...</p>
          </div>
        ) : loadError ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-4">
              <X className="w-6 h-6" />
            </div>
            <p className="text-destructive font-medium mb-2">Gagal Memuat Data</p>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">{loadError}</p>
            <button
              onClick={loadProducts}
              className="mt-4 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-sm font-medium"
            >
              Coba Lagi
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Belum ada produk</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {search ? 'Tidak ada produk yang cocok dengan pencarian Anda.' : 'Tambahkan produk ke katalog Anda untuk mempercepat pembuatan resi dan transaksi.'}
            </p>
            {!search && (
              <button
                onClick={openAddForm}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                Tambah Produk Pertama
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Gambar</th>
                  <th className="px-6 py-4 font-medium">Produk</th>
                  <th className="px-6 py-4 font-medium">SKU</th>
                  <th className="px-6 py-4 font-medium">Harga (Rp)</th>
                  <th className="px-6 py-4 font-medium">Berat (Kg)</th>
                  <th className="px-6 py-4 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProducts.map((prod) => (
                  <motion.tr 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={prod.id} 
                    className="bg-card hover:bg-muted/30 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      {prod.image_url ? (
                        <img src={prod.image_url} alt={prod.item_name} className="w-10 h-10 object-cover rounded-md border border-border" />
                      ) : (
                        <div className="w-10 h-10 bg-muted flex items-center justify-center rounded-md border border-border text-muted-foreground">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium">{prod.item_name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{prod.sku || '-'}</td>
                    <td className="px-6 py-4">{prod.item_value.toLocaleString('id-ID')}</td>
                    <td className="px-6 py-4">{prod.weight_kg} kg</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditForm(prod)}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setDeleteId(prod.id);
                            setIsDeleteOpen(true);
                          }}
                          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card w-full max-w-lg rounded-xl shadow-lg border border-border overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold">
                  {formMode === 'add' ? 'Tambah Produk' : 'Edit Produk'}
                </h2>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto">
                <form id="productForm" onSubmit={handleSaveProduct} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nama Produk <span className="text-destructive">*</span></label>
                    <input
                      required
                      type="text"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="Contoh: Kemeja Pria Lengan Panjang"
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">SKU</label>
                      <input
                        type="text"
                        value={sku}
                        onChange={(e) => setSku(e.target.value)}
                        placeholder="Contoh: KMJ-001"
                        className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Berat (Kg) <span className="text-destructive">*</span></label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        min="0"
                        value={weightKg}
                        onChange={(e) => setWeightKg(e.target.value)}
                        placeholder="0.5"
                        className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Harga Barang (Rp) <span className="text-destructive">*</span></label>
                    <input
                      required
                      type="number"
                      min="0"
                      value={itemValue}
                      onChange={(e) => setItemValue(e.target.value)}
                      placeholder="150000"
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">URL Gambar (Opsional)</label>
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://example.com/image.jpg"
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                    />
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-border bg-muted/20 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 bg-background border border-input hover:bg-muted text-foreground rounded-lg transition-colors text-sm font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  form="productForm"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors text-sm font-medium inline-flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Produk'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Upload Modal */}
      <AnimatePresence>
        {isBulkOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card w-full max-w-md rounded-xl shadow-lg border border-border overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                  Import CSV
                </h2>
                <button
                  onClick={() => setIsBulkOpen(false)}
                  className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-medium mb-2">1. Siapkan File CSV</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Download template CSV ini lalu isi dengan data produk Anda. Jangan ubah baris pertama (header).
                  </p>
                  <button
                    onClick={downloadTemplate}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg transition-colors text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    Download Template
                  </button>
                </div>

                <div className="h-px bg-border my-4" />

                <div>
                  <h3 className="text-sm font-medium mb-2">2. Upload File</h3>
                  <div className="mt-2 flex justify-center rounded-lg border border-dashed border-border px-6 py-10 hover:bg-muted/50 transition-colors">
                    <div className="text-center">
                      <Upload className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden="true" />
                      <div className="mt-4 flex text-sm leading-6 text-muted-foreground">
                        <label
                          htmlFor="file-upload"
                          className="relative cursor-pointer rounded-md font-semibold text-primary focus-within:outline-none hover:text-primary/80"
                        >
                          <span>Pilih file</span>
                          <input
                            id="file-upload"
                            name="file-upload"
                            type="file"
                            accept=".csv"
                            className="sr-only"
                            onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                          />
                        </label>
                        <p className="pl-1">atau drag and drop</p>
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground mt-1">
                        CSV up to 10MB
                      </p>
                    </div>
                  </div>
                  {bulkFile && (
                    <div className="mt-3 flex items-center justify-between p-3 bg-muted rounded-lg border border-border">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileSpreadsheet className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm font-medium truncate">{bulkFile.name}</span>
                      </div>
                      <button
                        onClick={() => setBulkFile(null)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-border bg-muted/20 flex justify-end gap-3">
                <button
                  onClick={() => setIsBulkOpen(false)}
                  className="px-4 py-2 bg-background border border-input hover:bg-muted text-foreground rounded-lg transition-colors text-sm font-medium"
                >
                  Batal
                </button>
                <button
                  onClick={handleBulkUpload}
                  disabled={!bulkFile || isUploading}
                  className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Mengupload...
                    </>
                  ) : (
                    'Upload & Proses'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Modal */}
      <AnimatePresence>
        {isDeleteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card w-full max-w-sm rounded-xl shadow-lg border border-border overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Hapus Produk?</h3>
                <p className="text-muted-foreground text-sm">
                  Tindakan ini tidak dapat dibatalkan. Produk yang dihapus tidak akan muncul lagi di pencarian saat membuat resi.
                </p>
              </div>
              <div className="p-4 border-t border-border bg-muted/20 flex gap-3">
                <button
                  onClick={() => setIsDeleteOpen(false)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-background border border-input hover:bg-muted text-foreground rounded-lg transition-colors text-sm font-medium"
                >
                  Batal
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg transition-colors text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ya, Hapus'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
