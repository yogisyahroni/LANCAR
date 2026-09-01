package com.tembus.customer.ui.localization

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text as MaterialText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.AnnotatedString
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
 * Temporary central boundary for legacy hardcoded customer copy.
 * API/server values are deliberately passed through unchanged.
 */
object CustomerTextCatalog {
    private val englishTranslations = mapOf(
        "Beranda" to "Home",
        "Pesanan" to "Orders",
        "Riwayat" to "History",
        "Riwayat Pesanan" to "Order History",
        "Profil" to "Profile",
        "Notifikasi" to "Notifications",
        "Alamat" to "Addresses",
        "Alamat tersimpan" to "Saved addresses",
        "Favorit" to "Favorites",
        "Keranjang" to "Cart",
        "Mau apa hari ini?" to "What would you like today?",
        "Layanan" to "Services",
        "Food Delivery" to "Food Delivery",
        "Tambal Ban" to "Tire Repair",
        "Towing" to "Towing",
        "Merchant terdekat" to "Nearby merchants",
        "Pilih layanan" to "Choose a service",
        "Pilih tujuan" to "Choose a destination",
        "Mulai Order Baru" to "Start a New Order",
        "Rute & estimasi" to "Route & estimate",
        "Lacak Posisi Kurir" to "Track Courier",
        "Rute sedang dihitung" to "Calculating route",
        "Rute sedang dimuat" to "Loading route",
        "Pesanan tertunda sedang disinkronkan." to "Pending orders are syncing.",
        "Tidak ada petugas tersedia di sekitar Anda" to "No providers are available nearby",
        "Belum ada merchant di sekitarmu" to "No merchants nearby",
        "Belum ada merchant favorit" to "No favorite merchants",
        "Belum ada kurir tersedia" to "No couriers available",
        "Belum ada menu" to "No menu items",
        "Bahasa" to "Language",
        "Kembali" to "Back",
        "Tutup" to "Close",
        "Batal" to "Cancel",
        "Simpan" to "Save",
        "Kirim" to "Send",
        "Lanjut" to "Continue",
        "Selesai" to "Done",
        "Coba Lagi" to "Try Again",
        "Hapus" to "Delete",
        "Edit" to "Edit",
        "Detail" to "Details",
        "Lihat Detail" to "View Details",
        "Pesan Lagi" to "Order Again",
        "Pilih" to "Choose",
        "Cari" to "Search",
        "Muat ulang" to "Refresh",
        "Memuat..." to "Loading...",
        "Tidak ada data" to "No data",
        "Belum ada pesanan" to "No orders yet",
        "Belum ada notifikasi" to "No notifications yet",
        "Belum ada alamat" to "No addresses yet",
        "Email" to "Email",
        "Password" to "Password",
        "Masuk" to "Sign in",
        "Daftar" to "Register",
        "Keluar" to "Sign out",
        "Simpan Perubahan" to "Save Changes",
        "Tambah Alamat" to "Add Address",
        "Alamat Pengiriman" to "Delivery Address",
        "Alamat Pickup" to "Pickup Address",
        "Catatan" to "Notes",
        "Catatan (opsional)" to "Notes (optional)",
        "Nama penerima" to "Recipient name",
        "Nomor handphone penerima" to "Recipient phone number",
        "Alamat Pengantaran" to "Delivery Address",
        "Harga final dihitung dari jarak, berat, dan fitur tambahan." to "Final price is calculated from distance, weight, and add-ons.",
        "Harga Barang (Rp)" to "Item Value (IDR)",
        "Harga Jasa (Rp)" to "Service Price (IDR)",
        "Harga" to "Price",
        "Total" to "Total",
        "Pembayaran" to "Payment",
        "Bayar Sekarang" to "Pay Now",
        "Metode Pembayaran" to "Payment Method",
        "Status Pesanan" to "Order Status",
        "Lacak Pesanan" to "Track Order",
        "Rincian Pesanan" to "Order Details",
        "Ringkasan Pesanan" to "Order Summary",
        "Rincian Pembayaran" to "Payment Details",
        "Pesanan Diproses" to "Order is being processed",
        "Pesanan Selesai" to "Order completed",
        "Pesanan Dibatalkan" to "Order cancelled",
        "Panggilan dalam aplikasi" to "In-app call",
        "Menghubungkan panggilan" to "Connecting call",
        "Panggilan masuk" to "Incoming call",
        "Panggilan tersambung" to "Call connected",
        "Akhiri" to "End",
        "Terima" to "Accept",
        "Tolak" to "Decline",
        "Konfirmasi" to "Confirm",
        "Konfirmasi Keluar" to "Confirm Sign out",
        "Pilih hasil pencarian" to "Choose a search result",
        "Bersihkan" to "Clear",
        "Kurangi" to "Decrease",
        "Tambah" to "Add",
        "Error" to "Error",
        "Foto Barang" to "Item Photo",
        "Foto kurir" to "Courier photo",
        "Kurir" to "Courier",
        "Telepon kurir" to "Call courier",
        "Opsi lainnya" to "More options",
        "Tambah lampiran" to "Add attachment",
        "Foto makanan" to "Food photo",
        "Salin nomor pesanan" to "Copy order number",
        "Foto Profil Kurir" to "Courier profile photo",
        "Panggil" to "Call",
        "Pesan" to "Message",
        "Arsipkan" to "Archive",
        "Ingatkan nanti" to "Remind me later",
        "Sukses" to "Success",
        "Hapus dari favorit" to "Remove from favorites",
        "Tutup pembayaran" to "Close payment",
        "Mikrofon" to "Microphone",
        "Panggilan dalam aplikasi" to "In-app call",
        "Dipilih" to "Selected",
        "Layar Aman" to "Secure screen",
        "Salin" to "Copy",
        "Keranjang masih kosong" to "Your cart is empty",
        "Belum Ada Riwayat" to "No History Yet",
        "Buka Chat" to "Open Chat",
        "Buka Maps" to "Open Maps",
        "Izinkan Kamera" to "Allow Camera",
        "Izinkan Lokasi" to "Allow Location",
        "Coba lagi" to "Try again",
        "Terjadi kesalahan" to "Something went wrong"
    )

    fun translate(text: String): String {
        if (Locale.getDefault().language != "en") return text
        englishTranslations[text]?.let { return it }
        return when {
            text.startsWith("Pesanan #") -> text.replaceFirst("Pesanan #", "Order #")
            text.startsWith("Foto ") -> "Photo ${text.removePrefix("Foto ")}"
            text.endsWith(" bintang") -> "${text.removeSuffix(" bintang")} stars"
            text.endsWith(" menit") -> "${text.removeSuffix(" menit")} minutes"
            else -> text
        }
    }
}

@Composable
fun CustomerText(
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
    style: TextStyle = LocalTextStyle.current,
) {
    MaterialText(
        text = CustomerTextCatalog.translate(text),
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

@Composable
fun CustomerText(
    text: AnnotatedString,
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
    style: TextStyle = LocalTextStyle.current,
) {
    MaterialText(
        text = text,
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
