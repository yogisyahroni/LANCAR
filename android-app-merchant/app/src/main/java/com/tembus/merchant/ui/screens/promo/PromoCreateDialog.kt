package com.tembus.merchant.ui.screens.promo

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MerchantPromoRequest
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * PromoCreateDialog — form buat promo merchant (FB-100).
 * discount_type: percent | fixed | buy1get1. Window waktu default:
 * hari ini 00:00 UTC → +7 hari 23:59 UTC.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PromoCreateDialog(
    onDismiss: () -> Unit,
    onSave: (MerchantPromoRequest) -> Unit
) {
    var discountType by remember { mutableStateOf("percent") }
    var discountValue by remember { mutableStateOf("") }
    var maxDiscount by remember { mutableStateOf("") }
    var startsAt by remember { mutableStateOf(defaultStart()) }
    var endsAt by remember { mutableStateOf(defaultEnd()) }
    var error by remember { mutableStateOf<String?>(null) }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 36.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Buat Promo",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Filled.Close, contentDescription = "Tutup")
                }
            }

            Text(
                "Dibiayai toko sendiri — langsung aktif tanpa persetujuan admin. " +
                    "Potongan mengurangi pendapatan bersih toko, bukan komisi platform.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Text("Jenis diskon", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("percent" to "Percent %", "fixed" to "Fixed Rp", "buy1get1" to "Beli 1 Gratis 1")
                    .forEach { (value, label) ->
                        FilterChip(
                            selected = discountType == value,
                            onClick = { discountType = value },
                            label = { Text(label) }
                        )
                    }
            }

            if (discountType != "buy1get1") {
                OutlinedTextField(
                    value = discountValue,
                    onValueChange = { discountValue = it.filter { c -> c.isDigit() } },
                    label = { Text(if (discountType == "percent") "Diskon (%)" else "Diskon (Rp)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
            }

            if (discountType == "percent") {
                OutlinedTextField(
                    value = maxDiscount,
                    onValueChange = { maxDiscount = it.filter { c -> c.isDigit() } },
                    label = { Text("Maks diskon (Rp, opsional)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
            }

            OutlinedTextField(
                value = startsAt,
                onValueChange = { startsAt = it },
                label = { Text("Mulai (YYYY-MM-DDTHH:MM:SSZ)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = endsAt,
                onValueChange = { endsAt = it },
                label = { Text("Selesai (YYYY-MM-DDTHH:MM:SSZ)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            error?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }

            Button(
                onClick = {
                    val req = buildRequest(discountType, discountValue, maxDiscount, startsAt, endsAt)
                    if (req == null) {
                        error = "Cek kembali isian: diskon wajib > 0, tanggal format benar, " +
                            "dan selesai setelah mulai."
                    } else {
                        onSave(req)
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
            ) {
                Text("Simpan Promo", style = MaterialTheme.typography.titleMedium)
            }
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                Text("Batal")
            }
        }
    }
}

private fun buildRequest(
    discountType: String,
    discountValue: String,
    maxDiscount: String,
    startsAt: String,
    endsAt: String
): MerchantPromoRequest? {
    val value = discountValue.toLongOrNull() ?: 0
    if (discountType != "buy1get1" && value <= 0) return null
    if (discountType == "percent" && value > 100) return null
    val max = maxDiscount.toLongOrNull()

    val start = parseUtc(startsAt) ?: return null
    val end = parseUtc(endsAt) ?: return null
    if (!end.after(start)) return null

    return MerchantPromoRequest(
        menuItemId = null,
        discountType = discountType,
        discountValue = value,
        maxDiscountIdr = max,
        startsAt = startsAt,
        endsAt = endsAt
    )
}

private fun parseUtc(value: String): Date? = try {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
        isLenient = false
    }.parse(value)
} catch (e: Exception) {
    null
}

private fun defaultStart(): String {
    val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
    cal.set(Calendar.HOUR_OF_DAY, 0)
    cal.set(Calendar.MINUTE, 0)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    return fmtUtc(cal.time)
}

private fun defaultEnd(): String {
    val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
    cal.add(Calendar.DAY_OF_YEAR, 7)
    cal.set(Calendar.HOUR_OF_DAY, 23)
    cal.set(Calendar.MINUTE, 59)
    cal.set(Calendar.SECOND, 59)
    cal.set(Calendar.MILLISECOND, 0)
    return fmtUtc(cal.time)
}

private fun fmtUtc(date: Date): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }.format(date)
