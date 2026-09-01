package com.tembus.courier.ui.localization

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

/** Central boundary for legacy courier Compose copy during resource migration. */
object CourierTextCatalog {
    private val englishTranslations = mapOf(
        "Beranda" to "Home",
        "Order" to "Orders",
        "Pesanan" to "Orders",
        "Riwayat" to "History",
        "Riwayat Pesanan" to "Order History",
        "Profil" to "Profile",
        "Notifikasi" to "Notifications",
        "Peta" to "Map",
        "Dompet" to "Wallet",
        "Pendapatan" to "Earnings",
        "Performa Saya" to "My Performance",
        "Kesiapan Operasional" to "Operational Readiness",
        "Pekerjaan aktif" to "Active work",
        "Tawaran Masuk" to "Incoming Offers",
        "Tawaran akan muncul otomatis." to "Offers will appear automatically.",
        "Menunggu pesanan terdekat" to "Waiting for nearby orders",
        "Area permintaan" to "Demand area",
        "Rute" to "Route",
        "Rute & Layanan Terpilih" to "Route & Selected Service",
        "Layanan" to "Services",
        "Layanan aktif" to "Active service",
        "Layanan & Kemampuan" to "Services & Capabilities",
        "Tambal Ban" to "Tire Repair",
        "Towing" to "Towing",
        "Bahasa" to "Language",
        "Kembali" to "Back",
        "Tutup" to "Close",
        "Batal" to "Cancel",
        "Simpan" to "Save",
        "Kirim" to "Send",
        "Lanjut" to "Continue",
        "Selesai" to "Done",
        "Coba Lagi" to "Try Again",
        "Terima" to "Accept",
        "Tolak" to "Decline",
        "Keluar" to "Sign out",
        "Muat ulang" to "Refresh",
        "Memuat..." to "Loading...",
        "Tidak ada data" to "No data",
        "Pesanan aktif" to "Active orders",
        "Order aktif" to "Active order",
        "Tugas sekarang" to "Current tasks",
        "Lanjutkan pekerjaan" to "Continue work",
        "Route plan aktif" to "Active route plan",
        "Lihat semua order" to "View all orders",
        "Buka" to "Open",
        "Buka Maps" to "Open Maps",
        "Akhiri" to "End",
        "Selesaikan Layanan" to "Complete Service",
        "Selesaikan layanan?" to "Complete service?",
        "Aksi berikutnya" to "Next action",
        "Koreksi Tahap Pengiriman" to "Correct Delivery Step",
        "Laporkan Kendala" to "Report an Issue",
        "Laporkan kendala pekerjaan" to "Report a work issue",
        "Kirim laporan" to "Submit Report",
        "Kirim Laporan & Selesai" to "Submit Report & Finish",
        "Ambil Foto Hasil" to "Take Result Photo",
        "Ambil Foto Inspeksi" to "Take Inspection Photo",
        "Ambil Ulang" to "Retake",
        "Batal & Foto Ulang" to "Cancel & Retake",
        "Buka Navigasi Peta" to "Open Map Navigation",
        "Keluar mode navigasi" to "Exit navigation mode",
        "Alamat" to "Address",
        "Tujuan" to "Destination",
        "Pickup" to "Pickup",
        "Verifikasi Wajah" to "Face Verification",
        "Foto Paket" to "Package Photo",
        "Foto Barang Saat Pickup" to "Item Photo at Pickup",
        "Pelanggan" to "Customer",
        "Waktu Pemesanan" to "Order Time",
        "Biaya Perjalanan" to "Travel Fee",
        "Total Pendapatan" to "Total Earnings",
        "Saldo Dompet" to "Wallet Balance",
        "Tarik Dana" to "Withdraw Funds",
        "Ajukan Pencairan" to "Request Payout",
        "Riwayat pencairan" to "Payout History",
        "Kesehatan Aplikasi" to "App Health",
        "Pengaturan Aplikasi" to "App Settings",
        "Konfirmasi Keluar" to "Confirm Sign out",
        "Terima undangan" to "Accept invitation",
        "Lokasi" to "Location",
        "Aktif" to "Active",
        "Online" to "Online",
        "Offline" to "Offline",
        "Panggilan masuk" to "Incoming call",
        "Panggilan tersambung" to "Call connected",
        "Menghubungkan panggilan" to "Connecting call",
        "Buka Chat" to "Open Chat",
        "Telepon dalam aplikasi" to "In-app call",
        "Izinkan Kamera" to "Allow Camera",
        "Izinkan lokasi" to "Allow location",
        "Berikan Izin Sekarang" to "Grant Permission Now",
        "Gunakan biometrik" to "Use biometrics",
        "Verifikasi" to "Verify",
        "Atur PIN perangkat" to "Set device PIN",
        "Simpan PIN" to "Save PIN",
        "Lupa Password?" to "Forgot Password?",
        "Mikrofon" to "Microphone",
        "Telepon" to "Call",
        "Tiba" to "Arrived",
        "Kamera" to "Camera",
        "Warning" to "Warning",
        "Success" to "Success",
        "Empty" to "Empty",
        "Expand" to "Expand",
        "Minimize" to "Minimize",
        "Lokasi saya" to "My location",
        "Tutup pesan" to "Close message",
        "Ambil foto bukti" to "Take proof photo",
        "Pratinjau foto bukti" to "Preview proof photo",
        "Foto hasil layanan" to "Service result photo",
        "Telepon pelanggan" to "Call customer",
        "Sinkronkan order" to "Sync orders",
        "Refresh pencairan" to "Refresh payout",
        "Mulai ulang" to "Restart",
        "Foto wajah" to "Face photo",
        "Terverifikasi" to "Verified",
        "Foto Profil" to "Profile photo",
        "Pilih radius" to "Choose radius"
    )

    fun translate(text: String): String {
        if (Locale.getDefault().language != "en") return text
        englishTranslations[text]?.let { return it }
        return when {
            text.startsWith("Halo, ") -> "Hello, ${text.removePrefix("Halo, ")}"
            text.startsWith("Foto ") -> "Photo ${text.removePrefix("Foto ")}"
            text.endsWith(" pending") -> text.removeSuffix(" pending") + " pending"
            text.endsWith(" menit") -> "${text.removeSuffix(" menit")} minutes"
            else -> text
        }
    }
}

@Composable
fun CourierText(
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
        text = CourierTextCatalog.translate(text),
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
fun CourierText(
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
