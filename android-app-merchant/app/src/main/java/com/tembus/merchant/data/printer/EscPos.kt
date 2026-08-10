package com.tembus.merchant.data.printer

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import com.tembus.merchant.data.model.StrukData
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * FB-096 — cetak struk ke printer thermal 58mm/80mm via Bluetooth (ESC/POS).
 *
 * Desain: ZERO-DEPENDENCY — byte ESC/POS dikirim langsung lewat
 * BluetoothSocket SPP (UUID standar). Tidak ada library pihak ketiga
 * (JitPack dll) → tidak ada supply-chain risk, kontrol penuh format.
 *
 * Printer target: kebanyakan printer thermal 58mm/80mm yang dijual umum
 * (Xprinter, Deli, dsb) — kompatibel dengan set perintah Epson ESC/POS.
 */
object EscPos {

    // UUID SPP standar Bluetooth — dipakai semua printer thermal BT.
    const val SPP_UUID = "00001101-0000-1000-8000-00805F9B34FB"

    /** Lebar baris konten 58mm: 32 kolom huruf normal. */
    private const val WIDTH = 32

    // ─── Daftar printer paired ──────────────────────────────────────────
    /** Semua perangkat Bluetooth yang sudah di-pairing (filter printer ringan). */
    fun pairedPrinters(): List<BluetoothDevice> {
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return emptyList()
        val bonded = adapter.bondedDevices ?: return emptyList()
        return bonded.filter { looksLikePrinter(it) }
            .sortedBy { it.name ?: "" }
    }

    /** Heuristik: major class printer/imager ATAU nama mengandung kata printer. */
    private fun looksLikePrinter(d: BluetoothDevice): Boolean {
        val major = (d.bluetoothClass?.majorDeviceClass ?: 0)
        val isPrinterClass = major == BluetoothClassMajor.PRINTER || major == BluetoothClassMajor.IMAGING
        if (isPrinterClass) return true
        val name = (d.name ?: "").lowercase()
        return name.contains("printer") || name.contains("thermal") ||
            name.contains("struk") || name.contains("pos") || name.contains("58") || name.contains("80")
    }

    private object BluetoothClassMajor {
        const val IMAGING = 0x600
        const val PRINTER = 0x700
    }

    // ─── Kirim byte ke printer ──────────────────────────────────────────
    /**
     * Cetak struk. Blocking (I/O) — panggil dari coroutine/Dispatchers.IO.
     * @return error message kalau gagal, null kalau sukses.
     */
    suspend fun print(device: BluetoothDevice, struk: StrukData): String? = withContext(Dispatchers.IO) {
        var socket: BluetoothSocket? = null
        try {
            socket = device.createRfcommSocketToServiceRecord(
                java.util.UUID.fromString(SPP_UUID)
            )
            socket.connect()
            val bytes = buildReceipt(struk)
            socket.outputStream.write(bytes)
            socket.outputStream.flush()
            null
        } catch (e: IOException) {
            e.message ?: "Gagal terhubung ke printer"
        } catch (e: SecurityException) {
            "Izin Bluetooth tidak tersedia"
        } finally {
            try {
                socket?.close()
            } catch (_: IOException) {
            }
        }
    }

    // ─── Builder byte ESC/POS ───────────────────────────────────────────
    /** Bangun byte struk lengkap: header → item → total → QR → potong kertas. */
    fun buildReceipt(struk: StrukData): ByteArray {
        val out = java.io.ByteArrayOutputStream()

        fun raw(vararg b: Int) {
        val bytes = ByteArray(b.size) { b[it].toByte() }
        out.write(bytes)
    }
        fun line(text: String, align: Int = 0, bold: Boolean = false, size: Int = 0) {
            raw(0x1B, 0x61, align)                       // ESC a (align 0=left 1=center 2=right)
            raw(0x1B, 0x45, if (bold) 1 else 0)          // ESC E (bold)
            if (size > 0) raw(0x1D, 0x21, size)          // GS ! (size: 0=1x1, 0x11=2x2)
            out.write(ascii(text))
            out.write('\n'.code)
            raw(0x1B, 0x45, 0)                           // bold off
            if (size > 0) raw(0x1D, 0x21, 0)
        }
        fun divider() = line("-".repeat(WIDTH))

        raw(0x1B, 0x40)                                  // INIT
        raw(0x1B, 0x74, 0x00)                            // ESC t 0 (charset CP437)
        line("TEMBUS", align = 1, bold = true, size = 0x11)
        line(struk.merchantName, align = 1, bold = true)
        struk.merchantAddress?.takeIf { it.isNotBlank() }?.let {
            line(it, align = 1)
        }
        divider()

        line("No. Order : ${struk.orderNumber}")
        struk.customerName?.takeIf { it.isNotBlank() }?.let {
            line("Customer  : $it")
        }
        struk.createdAt?.takeIf { it.isNotBlank() }?.let {
            line("Waktu     : $it")
        }
        divider()

        // Item — format kiri nama, kanan harga (baris terpisah biar aman 58mm)
        struk.items.forEach { item ->
            line("${item.quantity} x ${item.itemName}")
            line("  ${rupiah(item.subtotal)}", align = 2)
            item.notes?.takeIf { it.isNotBlank() }?.let {
                line("  - $it")
            }
            // FB-108-FIX: varian/opsi terpilih ikut tercetak (mis. Level: Level 3 Pedas)
            // AUDIT-FIX: truncate ke lebar kertas 58mm (nama opsi panjang
            // tidak boleh bikin printer wrap berantakan).
            item.variants?.takeIf { it.isNotEmpty() }?.forEach { v ->
                line("  - ${truncate("${v.variantName}: ${v.optionName}", WIDTH - 4)}")
            }
        }
        divider()

        line("Subtotal        ${rupiah(struk.subtotalIdr)}", align = 2)
        line("Ongkir          ${rupiah(struk.deliveryFeeIdr)}", align = 2)
        line("", align = 1)
        line("TOTAL  ${rupiah(struk.totalPriceIdr)}", align = 1, bold = true, size = 0x11)
        divider()

        // QR handover token — scan kurir saat pickup
        line("Scan QR saat pickup:", align = 1)
        writeQr(out, struk.handoverToken.takeIf { it.isNotBlank() } ?: struk.orderId)
        line("", align = 1)

        raw(0x1B, 0x64, 3)                               // ESC d 3 (feed 3 baris)
        raw(0x1D, 0x56, 0x01)                            // GS V 1 (potong kertas penuh)
        return out.toByteArray()
    }

    /** QR native printer via GS ( k — model 2, module 6, EC level Q. */
    private fun writeQr(out: java.io.ByteArrayOutputStream, data: String) {
        val payload = ascii(data)
        fun cmd(vararg b: Int) {
            val bytes = ByteArray(b.size) { b[it].toByte() }
            out.write(bytes)
        }
        // 1. Pilih model 2
        cmd(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00)
        // 2. Module size 6
        cmd(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06)
        // 3. Error correction level Q
        cmd(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30)
        // 4. Store data: pL = (len + 5) & 0xFF, pH = (len + 5) >> 8
        val len = payload.size + 5
        cmd(0x1D, 0x28, 0x6B, len and 0xFF, (len shr 8) and 0xFF, 0x31, 0x50, 0x30)
        out.write(payload, 0, payload.size)
        // 5. Print
        cmd(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30)
    }

    /** Encode teks 1-byte/char (charset printer CP437). Non-ASCII → '?'. */
    private fun ascii(text: String): ByteArray {
        val sb = StringBuilder(text.length)
        for (ch in text) {
            sb.append(if (ch.code in 0x20..0x7E || ch == '\n') ch else '?')
        }
        val bytes = ByteArray(sb.length)
        for (i in sb.indices) bytes[i] = sb[i].code.toByte()
        return bytes
    }

    /** AUDIT-FIX: potong teks ke maxLen karakter dengan ellipsis (58mm aman). */
    private fun truncate(text: String, maxLen: Int): String {
        if (text.length <= maxLen) return text
        if (maxLen <= 1) return text.take(maxLen)
        return text.take(maxLen - 1) + "…"
    }

    private fun rupiah(value: Long): String {
        val s = value.toString()
        val sb = StringBuilder()
        for ((i, c) in s.reversed().withIndex()) {
            if (i > 0 && i % 3 == 0) sb.append('.')
            sb.append(c)
        }
        return "Rp ${sb.reverse()}"
    }
}
