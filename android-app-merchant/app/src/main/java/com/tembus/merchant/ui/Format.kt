package com.tembus.merchant.ui

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import com.tembus.merchant.data.localization.LocaleFormatters

/** Format util bersama — dipakai di semua screen. */
object Format {
    fun rupiah(value: Long): String {
        return LocaleFormatters.currency(value, "IDR", Locale.getDefault().toLanguageTag())
    }

    /** Format ISO timestamp (UTC) ke HH:mm waktu lokal. */
    fun time(iso: String?): String {
        if (iso.isNullOrBlank()) return "--:--"
        return try {
            Instant.parse(iso)
                .atZone(ZoneId.systemDefault())
                .format(DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault()))
        } catch (e: Exception) {
            "--:--"
        }
    }

    /** Format ISO timestamp ke "d MMM HH:mm" (contoh: 9 Agu 12:30). */
    fun dateTime(iso: String?): String {
        if (iso.isNullOrBlank()) return ""
        return try {
            Instant.parse(iso)
                .atZone(ZoneId.systemDefault())
                .format(DateTimeFormatter.ofPattern("d MMM HH:mm", Locale.getDefault()))
        } catch (e: Exception) {
            ""
        }
    }
}
