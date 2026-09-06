package com.tembus.customer.ui.screens.food

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.theme.Error
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.Success
import com.tembus.customer.ui.theme.TembusRadius
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.ZoneId
import java.util.Calendar
import java.util.Date
import java.util.Locale
import android.app.TimePickerDialog
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

// FOOD-BIKE-075: checkout — alamat antar + receiver + ringkasan + submit
@Composable
fun FoodCheckoutScreen(
    onBack: () -> Unit,
    onOrderCreated: (String) -> Unit,
    viewModel: FoodViewModel = hiltViewModel()
) {
    val cart by viewModel.cart.collectAsState()
    val cartTotal by viewModel.cartTotal.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val checkoutLat by viewModel.checkoutLat.collectAsState()
    val checkoutLng by viewModel.checkoutLng.collectAsState()
    val checkoutAddressResults by viewModel.checkoutAddressResults.collectAsState()
    val checkoutAddressSearchError by viewModel.checkoutAddressSearchError.collectAsState()
    val checkoutAddressSearching by viewModel.checkoutAddressSearching.collectAsState()
    val foodQuote by viewModel.foodQuote.collectAsState()
    val context = LocalContext.current
    val locationClient = remember { LocationServices.getFusedLocationProviderClient(context) }
    var locating by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    var submitError by remember { mutableStateOf<String?>(null) }
    var hasRequestedQuote by remember { mutableStateOf(false) }
    var destinationNeedsRequote by remember { mutableStateOf(false) }

    fun readCurrentDestination() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            submitError = "Izin lokasi diperlukan untuk menetapkan titik pengantaran."
            return
        }
        locating = true
        locationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnSuccessListener { location ->
                locating = false
                if (location == null) {
                    submitError = "Lokasi belum tersedia. Aktifkan GPS lalu coba lagi."
                } else {
                    if (hasRequestedQuote) destinationNeedsRequote = true
                    viewModel.setCheckoutLocation(location.latitude, location.longitude)
                    submitError = null
                }
            }
            .addOnFailureListener {
                locating = false
                submitError = "Lokasi tidak dapat dibaca. Aktifkan GPS lalu coba lagi."
            }
    }
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) readCurrentDestination()
        else submitError = "Izin lokasi ditolak. Pilih alamat tersimpan yang memiliki pin lokasi."
    }

    var address by remember { mutableStateOf("") }
    var receiverName by remember { mutableStateOf("") }
    var receiverPhone by remember { mutableStateOf("") }
    var orderNotes by remember { mutableStateOf("") } // FB-121: catatan level order
    var contactless by remember { mutableStateOf(false) } // FB-089
    var voucherInput by remember { mutableStateOf("") }
    val voucherState by viewModel.voucherState.collectAsState()
    // FB-123: pesanan terjadwal — toggle Pesan Sekarang / Jadwalkan.
    var scheduleNow by remember { mutableStateOf(true) }
    var scheduledAtMs by remember { mutableStateOf<Long?>(null) }

    val merchantId = cart.firstOrNull()?.menuItem?.merchantId ?: ""
    val formatRupiah = { v: Long -> v.toString().replace(Regex("\\B(?=(\\d{3})+(?!\\d))"), ".") }

    fun scheduledAtIso(): String? = scheduledAtMs?.let {
        Instant.ofEpochMilli(it)
            .atZone(ZoneId.systemDefault())
            .toOffsetDateTime()
            .withSecond(0).withNano(0)
            .toString()
    }

    fun requestFoodQuote(lat: Double, lng: Double) {
        submitError = null
        viewModel.quote(
            merchantId = merchantId,
            dropoffAddress = address,
            dropoffLat = lat,
            dropoffLng = lng,
            voucherCode = (voucherState as? VoucherState.Applied)?.code ?: voucherInput,
            isScheduled = !scheduleNow,
            scheduledAt = scheduledAtIso(),
            onResult = { result ->
                result.onFailure { submitError = it.message ?: "Gagal menghitung harga terbaru" }
            }
        )
    }

    // FOOD-2026-001: once the user has requested an authoritative quote, a
    // newly resolved destination is a material pricing input. Raw text edits
    // only invalidate the pin/quote; requote runs after a valid saved/pinned/GPS
    // coordinate exists so we never price against stale coordinates.
    LaunchedEffect(
        checkoutLat,
        checkoutLng,
        destinationNeedsRequote,
        address,
        scheduleNow,
        scheduledAtMs
    ) {
        if (!hasRequestedQuote || !destinationNeedsRequote) return@LaunchedEffect
        val lat = checkoutLat ?: return@LaunchedEffect
        val lng = checkoutLng ?: return@LaunchedEffect
        if (address.isBlank() || merchantId.isBlank()) return@LaunchedEffect
        if (!scheduleNow && scheduledAtMs == null) return@LaunchedEffect
        destinationNeedsRequote = false
        requestFoodQuote(lat, lng)
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(horizontal = 4.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"), tint = Primary)
                }
                Text(
                    "Checkout",
                    modifier = Modifier.weight(1f),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Primary
                )
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            // Ringkasan pesanan
            Text("Ringkasan Pesanan", fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(10.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(TembusRadius.Card))
                    .padding(14.dp)
            ) {
                cart.forEach { item ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            "${item.quantity}x ${item.menuItem.name}",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1
                        )
                        Text(
                            "Rp ${formatRupiah(item.subtotal)}",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
                Spacer(Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Total", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurface)
                    Text(
                        "Rp ${formatRupiah(cartTotal)}",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Primary
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            // ── FB-123: pesanan terjadwal ──
            Text("Waktu Pesanan", fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(TembusRadius.Button))
                    .padding(6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                listOf(true to "Pesan Sekarang", false to "Jadwalkan").forEach { (isNow, label) ->
                    val selected = scheduleNow == isNow
                    Surface(
                        onClick = {
                            scheduleNow = isNow
                            if (isNow) scheduledAtMs = null
                            viewModel.clearFoodQuote()
                            submitError = null
                        },
                        shape = RoundedCornerShape(TembusRadius.Button),
                        color = if (selected) Primary else Color.Transparent,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(
                            label,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
                            color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 13.sp,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium
                        )
                    }
                }
            }
            if (!scheduleNow) {
                Spacer(Modifier.height(10.dp))
                val context = LocalContext.current
                val timeFmt = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
                var scheduleError by remember { mutableStateOf<String?>(null) }
                // Min lead time: 30 menit dari sekarang (sesuai backend FB-123).
                // AUDIT-FIX: dihitung FRESH setiap buka picker — minMs yang
                // di-remember sekali akan stale kalau layar kebuka >30 menit
                // (waktu terkirim < 30 menit dari now aktual → ditolak backend).
                OutlinedButton(
                    onClick = {
                        val minMs = System.currentTimeMillis() + 30 * 60 * 1000L
                        val cal = Calendar.getInstance().apply {
                            timeInMillis = (scheduledAtMs ?: minMs).coerceAtLeast(minMs)
                        }
                        TimePickerDialog(
                            context,
                            { _, hour, minute ->
                                val picked = Calendar.getInstance().apply {
                                    set(Calendar.HOUR_OF_DAY, hour)
                                    set(Calendar.MINUTE, minute)
                                    set(Calendar.SECOND, 0)
                                    set(Calendar.MILLISECOND, 0)
                                }.timeInMillis
                                val freshMin = System.currentTimeMillis() + 30 * 60 * 1000L
                                if (picked < freshMin) {
                                    // AUDIT-FIX: feedback eksplisit, bukan clamp siluman
                                    // (user pilih 13:00 tapi dikirim 13:45 diam-diam).
                                    scheduleError = "Pilih minimal 30 menit dari sekarang — jam dipilih terlalu dekat"
                                    scheduledAtMs = null
                                } else {
                                    scheduleError = null
                                    scheduledAtMs = picked
                                }
                            },
                            cal.get(Calendar.HOUR_OF_DAY),
                            cal.get(Calendar.MINUTE),
                            true
                        ).show()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(TembusRadius.Button)
                ) {
                    Text(
                        if (scheduledAtMs != null) "🕐 Diantar ~${timeFmt.format(Date(scheduledAtMs!!))}"
                        else "Pilih waktu jadwal (min 30 menit lagi)",
                        fontSize = 14.sp,
                        color = if (scheduledAtMs != null) Primary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                scheduleError?.let {
                    Spacer(Modifier.height(4.dp))
                    Text(it, color = Error, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    "Pesanan akan mulai diproses merchant mendekati waktu pilihan. Minimal 30 menit dari sekarang, hanya untuk hari ini.",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (scheduledAtMs == null) {
                    Spacer(Modifier.height(6.dp))
                    Text("Pilih waktu jadwal dulu sebelum membuat pesanan", color = Error, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
            }

            Spacer(Modifier.height(16.dp))

            // FB-078: voucher diskon
            Text("Kode Voucher", fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(10.dp))
            when (val vs = voucherState) {
                is VoucherState.Applied -> {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Success.copy(alpha = 0.12f), RoundedCornerShape(TembusRadius.Button))
                            .padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                "${vs.name} (${vs.code})",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Success
                            )
                            Text(
                                "Diskon Rp ${formatRupiah(vs.discountIdr)}",
                                fontSize = 12.sp,
                                color = Success
                            )
                        }
                        TextButton(onClick = { viewModel.clearVoucher(); voucherInput = ""; viewModel.clearFoodQuote() }) {
                            Text("Hapus", color = Error, fontSize = 13.sp)
                        }
                    }
                }
                else -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = voucherInput,
                            onValueChange = {
                                voucherInput = it
                                viewModel.clearFoodQuote()
                                if (it.isBlank()) viewModel.clearVoucher()
                            },
                            modifier = Modifier.weight(1f),
                            placeholder = { Text("Masukkan kode (mis. HEMAT10)", fontSize = 14.sp) },
                            singleLine = true,
                            shape = RoundedCornerShape(TembusRadius.Input)
                        )
                        Spacer(Modifier.width(8.dp))
                        Button(
                            onClick = {
                                submitError = null
                                viewModel.validateVoucher(voucherInput, cartTotal)
                            },
                            enabled = voucherInput.isNotBlank() && voucherState !is VoucherState.Loading,
                            shape = RoundedCornerShape(TembusRadius.Button)
                        ) {
                            if (voucherState is VoucherState.Loading) {
                                CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.height(18.dp).width(18.dp))
                            } else {
                                Text("Pakai", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                    (voucherState as? VoucherState.Error)?.let { err ->
                        Spacer(Modifier.height(6.dp))
                        Text(err.message, color = Color(0xFFEF4444), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // Alamat pengantaran
            Text("Alamat Pengantaran", fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(10.dp))
            // FB-090: saved addresses — reuse alamat favorit (receiver)
            val savedAddresses by viewModel.addressBook.collectAsState()
            LaunchedEffect(Unit) { viewModel.loadSavedAddresses() }
            if (savedAddresses.isNotEmpty()) {
                LazyRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(vertical = 4.dp)
                ) {
                    items(savedAddresses, key = { it.id }) { saved ->
                        Surface(
                            onClick = {
                                address = saved.address
                                if (hasRequestedQuote) destinationNeedsRequote = true
                                viewModel.setCheckoutLocation(saved.lat, saved.lng)
                                if (saved.contactName != null) receiverName = saved.contactName
                            },
                            shape = RoundedCornerShape(TembusRadius.Chip),
                            color = if (address == saved.address) Primary.copy(alpha = 0.12f)
                            else MaterialTheme.colorScheme.surface,
                            border = BorderStroke(
                                1.dp,
                                if (address == saved.address) Primary else MaterialTheme.colorScheme.outline
                            )
                        ) {
                            Text(
                                text = "${saved.label} • ${saved.address}",
                                fontSize = 12.sp,
                                fontWeight = if (address == saved.address) FontWeight.Bold else FontWeight.Medium,
                                color = if (address == saved.address) Primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                            )
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
            }
            OutlinedTextField(
                value = address,
                onValueChange = {
                    address = it
                    // A changed address is a new destination until its pin is
                    // explicitly selected; stale discovery/saved coordinates
                    // must never be sent with the new text.
                    viewModel.clearCheckoutLocation()
                    viewModel.clearCheckoutAddressSearch()
                },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Contoh: Jl. Sudirman No. 12, Jakarta", fontSize = 14.sp) },
                minLines = 2,
                shape = RoundedCornerShape(TembusRadius.Input)
            )
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = { viewModel.searchCheckoutAddress(address) },
                enabled = address.trim().length >= 3 && !checkoutAddressSearching,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(TembusRadius.Button)
            ) {
                if (checkoutAddressSearching) {
                    CircularProgressIndicator(modifier = Modifier.height(18.dp).width(18.dp), strokeWidth = 2.dp)
                } else {
                    Text("Cari dan pilih pin alamat", fontSize = 13.sp)
                }
            }
            checkoutAddressResults.forEach { result ->
                Surface(
                    onClick = {
                        address = result.label
                        if (hasRequestedQuote) destinationNeedsRequote = true
                        viewModel.selectCheckoutAddress(result)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(TembusRadius.Input)
                ) {
                    Text(
                        text = result.label,
                        modifier = Modifier.padding(12.dp),
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(Modifier.height(4.dp))
            }
            checkoutAddressSearchError?.let {
                Text(it, color = Error, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = {
                    if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                        readCurrentDestination()
                    } else {
                        locationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                    }
                },
                enabled = !locating,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(TembusRadius.Button)
            ) {
                if (locating) CircularProgressIndicator(modifier = Modifier.height(18.dp).width(18.dp), strokeWidth = 2.dp)
                else Text("Gunakan lokasi perangkat sebagai titik antar", fontSize = 13.sp)
            }
            Text(
                if (checkoutLat != null && checkoutLng != null) "Pin pengantaran terpilih — harga akan dihitung dari titik ini."
                else "Pilih alamat tersimpan atau tetapkan pin perangkat sebelum checkout.",
                color = if (checkoutLat != null && checkoutLng != null) Success else Error,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(Modifier.height(10.dp))
            OutlinedButton(
                onClick = {
                    submitError = null
                    val lat = checkoutLat
                    val lng = checkoutLng
                    if (lat == null || lng == null) {
                        submitError = "Titik pengantaran belum dipilih."
                        return@OutlinedButton
                    }
                    hasRequestedQuote = true
                    destinationNeedsRequote = false
                    requestFoodQuote(lat, lng)
                },
                enabled = address.isNotBlank() && checkoutLat != null && checkoutLng != null && cart.isNotEmpty() && !loading,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(TembusRadius.Button)
            ) {
                Text(if (foodQuote == null) "Hitung harga dan ETA" else "Perbarui harga dan ETA", fontSize = 13.sp)
            }
            foodQuote?.let { quote ->
                Text(
                    "Subtotal Rp ${formatRupiah(quote.subtotalIdr)} • Antar Rp ${formatRupiah(quote.deliveryFeeIdr)} • ETA ${quote.etaMinutes} menit",
                    color = Success,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    "Persiapan ${quote.prepMinutes} mnt + perjalanan pickup ${quote.pickupTravelMinutes} mnt • sumber: ${quote.etaSource}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 11.sp
                )
                Text(
                    "Supply: ${quote.supplyStatus.ifBlank { "belum dinilai saat quote" }}${if (quote.trafficMinutes == null) " • lalu lintas live belum tersedia" else ""}${if (quote.batchingMinutes == null) " • batching belum ditetapkan" else ""}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 11.sp
                )
                Text(
                    "Total server: Rp ${formatRupiah(quote.totalPriceIdr)}",
                    color = Primary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            }
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = receiverName,
                onValueChange = { receiverName = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Nama penerima (opsional)", fontSize = 14.sp) },
                singleLine = true,
                shape = RoundedCornerShape(TembusRadius.Input)
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = receiverPhone,
                onValueChange = { receiverPhone = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("No. HP penerima (opsional)", fontSize = 14.sp) },
                singleLine = true,
                shape = RoundedCornerShape(TembusRadius.Input)
            )
            Spacer(Modifier.height(10.dp))
            // FB-121: catatan untuk seluruh order (mis. "pisahin sambal semua")
            OutlinedTextField(
                value = orderNotes,
                onValueChange = { orderNotes = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Catatan untuk merchant (mis. pisahin sambal semua)", fontSize = 14.sp) },
                minLines = 2,
                shape = RoundedCornerShape(TembusRadius.Input)
            )

            Spacer(Modifier.height(10.dp))
            // FB-089: pilihan terstruktur untuk drop-off tanpa kontak.
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(TembusRadius.Input),
                color = if (contactless) Primary.copy(alpha = 0.10f) else MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, if (contactless) Primary else MaterialTheme.colorScheme.outline)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = contactless,
                        onCheckedChange = { contactless = it }
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Antar tanpa kontak",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            "Kurir meletakkan pesanan di titik antar. Foto bukti tetap wajib.",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            submitError?.let {
                Spacer(Modifier.height(10.dp))
                Text(it, color = Error, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }

            Spacer(Modifier.height(20.dp))

            Button(
                onClick = {
                    submitError = null
                    if (address.isBlank()) {
                        submitError = "Alamat pengantaran wajib diisi"
                        return@Button
                    }
                    if (checkoutLat == null || checkoutLng == null) {
                        submitError = "Titik pengantaran belum dipilih. Pilih alamat tersimpan atau gunakan lokasi perangkat."
                        return@Button
                    }
                    if (foodQuote == null) {
                        submitError = "Hitung harga dan ETA terbaru sebelum membuat pesanan."
                        return@Button
                    }
                    if (cart.isEmpty()) {
                        submitError = "Keranjang kosong"
                        return@Button
                    }
                    // FB-123: kalau jadwalkan, waktu wajib dipilih dulu.
                    if (!scheduleNow && scheduledAtMs == null) {
                        submitError = "Pilih waktu jadwal dulu (minimal 30 menit lagi)"
                        return@Button
                    }
                    scope.launch {
                        val safeLat = checkoutLat
                        val safeLng = checkoutLng
                        if (safeLat == null || safeLng == null) return@launch
                        viewModel.checkout(
                            merchantId = merchantId,
                            dropoffAddress = address,
                            dropoffLat = safeLat,
                            dropoffLng = safeLng,
                            receiverName = receiverName.ifBlank { null },
                            receiverPhone = receiverPhone.ifBlank { null },
                            voucherCode = (voucherState as? VoucherState.Applied)?.code ?: voucherInput,
                            orderNotes = orderNotes, // FB-121
                            contactless = contactless, // FB-089
                            isScheduled = !scheduleNow, // FB-123
                            scheduledAt = scheduledAtIso(),
                            onResult = { result ->
                                result.onSuccess { order ->
                                    viewModel.clearCart()
                                    onOrderCreated(order.id)
                                }.onFailure { e ->
                                    submitError = e.message ?: "Gagal membuat order"
                                }
                            }
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = RoundedCornerShape(TembusRadius.Button),
                enabled = !loading
            ) {
                if (loading) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.height(22.dp).width(22.dp))
                } else {
                    Text("Buat Pesanan • Rp ${formatRupiah(foodQuote?.totalPriceIdr ?: cartTotal)}", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(Modifier.height(8.dp))
            Text(
                "Harga dihitung ulang oleh server — biaya antar dihitung otomatis.",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}