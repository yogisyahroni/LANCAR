package com.tembus.merchant.ui.localization

import androidx.compose.material3.Text as MaterialText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import java.util.Locale

/**
 * Central text boundary for merchant Compose screens.
 *
 * Existing resource-backed strings continue to work unchanged. The catalog
 * covers legacy hardcoded UI copy while those call sites are migrated to
 * Android resources, so switching the app language also updates ZIP screens,
 * dialogs, labels, and error states consistently.
 */
object MerchantTextCatalog {
    private val englishTranslations = mapOf(
        "Buat Promo" to "Create Promo",
        "Konfirmasi Promo" to "Confirm Promo",
        "Tipe Promo" to "Promotion Type",
        "Diskon Menu" to "Menu Discount",
        "Diskon Total" to "Total Discount",
        "Menu Pilihan" to "Selected Menu",
        "Cari menu..." to "Search menu...",
        "Kalkulasi Diskon" to "Discount Calculation",
        "Pengaturan Tambahan" to "Additional Settings",
        "Harga Awal" to "Original Price",
        "Simpan" to "Save",
        "Simpan Perubahan" to "Save Changes",
        "Tambah" to "Add",
        "Tambah Menu" to "Add Menu",
        "Tambah Grup" to "Add Group",
        "Tambah opsi" to "Add option",
        "Hapus grup" to "Delete group",
        "Hapus menu" to "Delete menu",
        "Hapus opsi" to "Delete option",
        "Kelola varian menu" to "Manage menu variants",
        "Atur Varian Menu" to "Configure Menu Variants",
        "Nama menu*" to "Menu name*",
        "Deskripsi menu" to "Menu description",
        "Foto menu" to "Menu photo",
        "Ganti foto" to "Change photo",
        "Tambah foto menu" to "Add menu photo",
        "Kategori" to "Category",
        "Harga" to "Price",
        "Belum ada menu" to "No menu yet",
        "Belum ada varian" to "No variants yet",
        "Pesanan" to "Orders",
        "Status pesanan" to "Order status",
        "Riwayat Pesanan" to "Order History",
        "Belum ada pesanan pada filter ini." to "No orders for this filter.",
        "Belum ada riwayat pesanan." to "No order history yet.",
        "Detail" to "Details",
        "Lihat detail" to "View details",
        "Edit Pesanan" to "Edit Order",
        "Lanjutkan pesanan" to "Continue order",
        "Waktu siap" to "Ready time",
        "Batal" to "Cancel",
        "Tolak" to "Reject",
        "Terima Undangan" to "Accept Invitation",
        "Terima Undangan Staff" to "Accept Staff Invitation",
        "Undang Staff" to "Invite Staff",
        "Kirim Undangan" to "Send Invitation",
        "Manajemen Staff" to "Staff Management",
        "Belum ada staff" to "No staff yet",
        "Ubah Peran" to "Change Role",
        "Peran" to "Role",
        "Kasir" to "Cashier",
        "Staff Dapur" to "Kitchen Staff",
        "Manager" to "Manager",
        "Wawasan" to "Insights",
        "Business Insights" to "Business Insights",
        "Performa Operasional" to "Operational Performance",
        "Total Pesanan" to "Total Orders",
        "TOTAL PENDAPATAN" to "TOTAL REVENUE",
        "Rating Toko" to "Store Rating",
        "Ulasan Pelanggan" to "Customer Reviews",
        "Dibatalkan" to "Cancelled",
        "Dihitung dari pesanan delivered" to "Calculated from delivered orders",
        "Dari semua order food periode ini" to "From all food orders in this period",
        "Payout history" to "Payout history",
        "REQUEST PAYOUT" to "REQUEST PAYOUT",
        "Payment settings saved." to "Payment settings saved.",
        "Payout request submitted." to "Payout request submitted.",
        "Pengaturan Pembayaran" to "Payment Settings",
        "Rekening bank dan pencairan" to "Bank accounts and payouts",
        "Jam Operasional" to "Operating Hours",
        "Jam Buka" to "Opening time",
        "Jam Tutup" to "Closing time",
        "Add Holiday" to "Add Holiday",
        "Special Closures" to "Special Closures",
        "Informasi Toko" to "Store Information",
        "Nama Toko*" to "Store name*",
        "Alamat Toko*" to "Store address*",
        "Contact Information" to "Contact Information",
        "Nomor WA" to "WhatsApp number",
        "Telepon" to "Phone",
        "Tax Information" to "Tax Information",
        "Penjualan kena pajak" to "Taxable sales",
        "Bersertifikat" to "Certified",
        "Perubahan Tersimpan" to "Changes Saved",
        "Perhatian" to "Attention",
        "Coba Lagi" to "Try Again",
        "Gagal" to "Failed",
        "Gagal Mendaftar" to "Registration Failed",
        "Tidak dapat memuat pesanan" to "Unable to load orders",
        "Item tidak tersedia" to "Item unavailable",
        "Item tidak ada" to "Item not found",
        "Item pesanan tidak tersedia dari backend" to "Order item is unavailable from the backend",
        "Belum ditentukan" to "Not specified",
        "Kembali" to "Back",
        "Tutup" to "Close",
        "Kirim" to "Send",
        "Masuk" to "Sign in",
        "Lanjut" to "Continue",
        "Lanjut ke App" to "Continue to App",
        "Selesai" to "Done",
        "Nanti saja" to "Not now",
        "Notifications" to "Notifications",
        "Notifikasi" to "Notifications",
        "Tulis pesan ke customer…" to "Write a message to the customer…",
        "Buka Maps" to "Open Maps",
        "Go back" to "Go back",
        "Public profile saved." to "Public profile saved.",
        "Preferences updated." to "Preferences updated.",
        "Update Preferences" to "Update Preferences",
        "SAVE PROFILE" to "SAVE PROFILE",
        "SAVE SETTINGS" to "SAVE SETTINGS",
        "UPDATE INFORMATION" to "UPDATE INFORMATION",
        "Store Name" to "Store Name",
        "Account Holder" to "Account Holder",
        "Account Number" to "Account Number",
        "Bank Name" to "Bank Name",
        "Linked Bank Account" to "Linked Bank Account",
        "Withdrawal request" to "Withdrawal request",
        "Open" to "Open",
        "QR Handover Token" to "QR Handover Token",
        "Struk Pembelian" to "Purchase Receipt",
        "Cetak Struk (PDF / Printer Biasa)" to "Print Receipt (PDF / Standard Printer)",
        "Pilih Printer Bluetooth" to "Choose Bluetooth Printer",
        "Preview impor menu" to "Menu import preview",
        "Impor CSV" to "Import CSV",
        "Impor ke server" to "Import to server",
        "Daftar Menu" to "Menu List",
        "Daftar Merchant" to "Merchant List",
        "Daftar" to "Register",
        "Email" to "Email",
        "Password" to "Password",
        "Alasan" to "Reason",
        "Detail alasan" to "Reason details",
        "Pilih alasan agar customer menerima informasi yang jelas." to "Choose a reason so the customer receives clear information.",
        "Wajib pilih" to "Selection required",
        "Tanggapan Anda" to "Your response",
        "Token Undangan" to "Invitation Token",
        "Belum ada transaksi payout dari backend." to "No payout transactions from the backend yet.",
        "No special closures have been added." to "No special closures have been added.",
        "The store will remain closed for this local date." to "The store will remain closed for this local date.",
        "Boost Your Sales" to "Boost Your Sales",
        "Run a promotion this weekend to increase orders." to "Run a promotion this weekend to increase orders.",
        "Business Details" to "Business Details",
        "Location Details" to "Location Details",
        "Best Selling Items" to "Best Selling Items",
        "Track your performance and growth." to "Track your performance and growth."
        ,"Terima & Tolak Pesanan" to "Accept & Reject Orders"
        ,"Kelola Menu" to "Manage Menu"
        ,"Cetak Struk & QR" to "Print Receipts & QR"
        ,"Buka / Tutup Toko" to "Open / Close Store"
        ,"Order masuk muncul di tab Pesanan. Kamu punya waktu untuk menerima atau menolak. Jika menerima, status otomatis jadi \"Menyiapkan\"." to "Incoming orders appear in the Orders tab. You have time to accept or reject them. Once accepted, the status automatically becomes \"Preparing\"."
        ,"Tambah, ubah, atau nonaktifkan menu di tab Menu. Aktifkan \"Tersedia\" hanya untuk makanan yang sedang bisa dipesan." to "Add, edit, or disable menu items in the Menu tab. Enable \"Available\" only for food that can currently be ordered."
        ,"Setiap pesanan punya struk dengan QR handover token. QR ini di-scan kurir saat pickup — wajib dicocokkan." to "Every order has a receipt with a QR handover token. The courier scans this QR at pickup — it must match."
        ,"Geser toggle Buka/Tutup di halaman utama. Saat tutup, customer tidak bisa memesan dari tokomu." to "Toggle Open/Closed on the home page. When closed, customers cannot order from your store."
        ,"Masuk untuk mengelola bisnis Anda" to "Sign in to manage your business"
        ,"Belum ada ulasan" to "No reviews yet"
        ,"Nama toko belum tersedia" to "Store name unavailable"
        ,"Profil toko belum tersedia" to "Store profile unavailable"
        ,"Informasi toko belum tersedia dari backend." to "Store information is not available from the backend."
        ,"Pengaturan pembayaran belum tersedia dari backend." to "Payment settings are not available from the backend."
        ,"Menu tidak ditemukan dari katalog backend." to "Menu was not found in the backend catalog."
        ,"Izin Bluetooth ditolak" to "Bluetooth permission denied"
        ,"Undangan diterima! Sekarang kamu staff toko ini." to "Invitation accepted! You are now staff for this store."
        ,"Peran: " to "Role: "
        ,"Nama menu belum tersedia" to "Menu name unavailable"
        ,"Nama grup (cth: Level Pedas)*" to "Group name (e.g. Spice Level)*"
        ,"Masa Berlaku BPOM (YYYY-MM-DD)" to "BPOM Expiry (YYYY-MM-DD)"
        ,"Masa Berlaku Halal (YYYY-MM-DD)" to "Halal Expiry (YYYY-MM-DD)"
        ,"Masa Berlaku SPP-IRT (YYYY-MM-DD)" to "SPP-IRT Expiry (YYYY-MM-DD)"
        ,"Nomor Izin Edar BPOM (awalan MD/ML)" to "BPOM Registration Number (MD/ML prefix)"
        ,"Nomor Sertifikat Halal" to "Halal Certificate Number"
        ,"Nomor SPP-IRT (awalan P-IRT)" to "SPP-IRT Number (P-IRT prefix)"
        ,"NPWP (Taxpayer Identification Number)" to "NPWP (Taxpayer Identification Number)"
        ,"Pilih kategori" to "Choose category"
        ,"Pilih menu" to "Choose menu"
        ,"Catatan (opsional)" to "Notes (optional)"
        ,"JPG/PNG/WebP maks 2MB — dari galeri" to "JPG/PNG/WebP max 2MB — from gallery"
        ,"Kirim Undangan" to "Send Invitation"
        ,"Nomor WA" to "WhatsApp number"
        ,"Toko akan otomatis buka & tutup sesuai jam ini." to "The store will open and close automatically according to these hours."
        ,"Jeda pesanan" to "Pause orders"
        ,"Pesanan baru akan dijeda selama:" to "New orders will be paused for:"
        ,"Pilih jenis promosi yang ingin Anda tawarkan." to "Choose the type of promotion you want to offer."
        ,"Harga promo dihitung saat customer checkout; breakdown nominal belum disediakan API." to "Promotion price is calculated at customer checkout; the API does not provide a nominal breakdown."
        ,"Kalkulasi nominal menunggu data harga saat checkout." to "The amount calculation is waiting for price data at checkout."
        ,"Biaya layanan platform belum dikirim oleh API promo." to "The promotion API has not provided the platform service fee."
        ,"Menu tidak tersedia dari backend." to "Menu is unavailable from the backend."
        ,"Mengunggah foto..." to "Uploading photo..."
        ,"Tidak dapat memuat pesanan" to "Unable to load orders"
        ,"Snapshot dari order food delivered" to "Snapshot of delivered food orders"
        ,"Belum ada transaksi payout dari backend." to "No payout transactions from the backend yet."
        ,"Detail item belum tersedia" to "Item details are unavailable"
        ,"Detail alasan" to "Reason details"
        ,"Pilih alasan agar customer menerima informasi yang jelas." to "Choose a reason so the customer receives clear information."
        ,"Terima Undangan Staff" to "Accept Staff Invitation"
        ,"Staff Dapur" to "Kitchen Staff"
        ,"Perusahaan" to "Company"
        ,"Perorangan" to "Individual"
        ,"Penjualan kena pajak" to "Taxable sales"
        ,"Invoice wajib / terbit" to "Invoice required / issued"
        ,"Non-Halal" to "Non-Halal"
        ,"Halal" to "Halal"
        ,"Tanggapan Anda" to "Your response"
        ,"Update tersedia" to "Update available"
        ,"Mengunduh..." to "Downloading..."
        ,"Update sekarang" to "Update now"
        ,"Varian berhasil disimpan" to "Variants saved successfully"
        ,"Kembali untuk melihat daftar menu" to "Go back to view the menu list"
        ,"Belum ada varian" to "No variants yet"
        ,"Contoh: Ukuran (Kecil/Besar), Level Pedas, Tambahan Topping.\nKetuk \"Tambah Grup\" untuk mulai." to "Example: Size (Small/Large), Spice Level, Extra Toppings.\nTap \"Add Group\" to begin."
        ,"Grup " to "Group "
        ,"Max pilih" to "Max selections"
        ,"Opsi" to "Option"
        ,"OK" to "OK"
        ,"Gagal memuat promo" to "Unable to load promotions"
        ,"Gagal buat promo" to "Unable to create promotion"
        ,"Gagal ubah status promo" to "Unable to update promotion status"
        ,"Gagal hapus promo" to "Unable to delete promotion"
        ,"Gagal memuat laporan" to "Unable to load report"
        ,"Gagal memuat dashboard" to "Unable to load dashboard"
        ,"Gagal memuat struk" to "Unable to load receipt"
        ,"Email dan password wajib diisi" to "Email and password are required"
        ,"Login gagal" to "Sign-in failed"
        ,"Anda" to "You"
        ,"Pesan belum terkirim: " to "Message not sent: "
        ,"Merchant" to "Merchant"
    )

    fun translate(text: String): String {
        if (Locale.getDefault().language != "en") return text
        englishTranslations[text]?.let { return it }
        return when {
            text.startsWith("Peran: ") -> "Role: ${text.removePrefix("Peran: ")}"
            text.startsWith("Grup ") -> "Group ${text.removePrefix("Grup ")}"
            text.startsWith("Pesan belum terkirim: ") -> "Message not sent: ${text.removePrefix("Pesan belum terkirim: ")}"
            text.endsWith(" menit") -> "${text.removeSuffix(" menit")} minutes"
            text.startsWith("Berdasarkan ") && text.endsWith(" ulasan") -> "Based on ${text.removePrefix("Berdasarkan ").removeSuffix(" ulasan")} reviews"
            else -> text
        }
    }
}

@Composable
fun MerchantText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    fontSize: TextUnit = TextUnit.Unspecified,
    fontStyle: FontStyle? = null,
    fontWeight: FontWeight? = null,
    fontFamily: FontFamily? = null,
    letterSpacing: TextUnit = TextUnit.Unspecified,
    textDecoration: TextDecoration? = null,
    textAlign: TextAlign? = null,
    lineHeight: TextUnit = TextUnit.Unspecified,
    overflow: TextOverflow = TextOverflow.Clip,
    softWrap: Boolean = true,
    maxLines: Int = Int.MAX_VALUE,
    minLines: Int = 1,
    onTextLayout: (TextLayoutResult) -> Unit = {},
    style: TextStyle = androidx.compose.material3.LocalTextStyle.current,
) {
    MaterialText(
        text = MerchantTextCatalog.translate(text),
        modifier = modifier,
        color = color,
        fontSize = fontSize,
        fontStyle = fontStyle,
        fontWeight = fontWeight,
        fontFamily = fontFamily,
        letterSpacing = letterSpacing,
        textDecoration = textDecoration,
        textAlign = textAlign,
        lineHeight = lineHeight,
        overflow = overflow,
        softWrap = softWrap,
        maxLines = maxLines,
        minLines = minLines,
        onTextLayout = onTextLayout,
        style = style,
    )
}
