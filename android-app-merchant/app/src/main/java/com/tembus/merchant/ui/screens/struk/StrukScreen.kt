package com.tembus.merchant.ui.screens.struk

import android.Manifest
import android.bluetooth.BluetoothDevice
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.pdf.PdfDocument
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.Print
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.tembus.merchant.data.model.StrukData
import com.tembus.merchant.data.printer.EscPos
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary
import java.io.FileOutputStream
import kotlinx.coroutines.launch

/**
 * StrukScreen — tampilkan struk pembelian + QR handover token, cetak via
 * PrintManager native (FOOD-BIKE-034/035/036). QR di-scan kurir saat pickup.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StrukScreen(
    orderId: String,
    onBack: () -> Unit,
    viewModel: StrukViewModel = appViewModel { StrukViewModel(it.merchantRepository, orderId) }
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // FB-096: cetak thermal bluetooth (ESC/POS)
    val snackbarHostState = remember { SnackbarHostState() }
    var showPrinterPicker by remember { mutableStateOf(false) }
    var printingThermal by remember { mutableStateOf(false) }
    val bluetoothPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) showPrinterPicker = true
        else scope.launch { snackbarHostState.showSnackbar("Izin Bluetooth ditolak") }
    }
    val openPrinterPicker = {
        val perm = Manifest.permission.BLUETOOTH_CONNECT
        val granted = Build.VERSION.SDK_INT < 31 ||
            ContextCompat.checkSelfPermission(context, perm) == PackageManager.PERMISSION_GRANTED
        if (granted) showPrinterPicker = true
        else bluetoothPermissionLauncher.launch(perm)
    }
    val onPrintThermal: (BluetoothDevice) -> Unit = { device ->
        scope.launch {
            val struk = state.struk ?: return@launch
            if (printingThermal) return@launch
            printingThermal = true
            val err = EscPos.print(device, struk)
            printingThermal = false
            snackbarHostState.showSnackbar(
                if (err == null) "Struk terkirim ke ${device.name}"
                else "Gagal cetak: $err"
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Struk Pembelian") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Kembali")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        when {
            state.isLoading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
            state.errorMessage != null -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = state.errorMessage.orEmpty(),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 32.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = viewModel::load) { Text("Coba Lagi") }
                }
            }
            state.struk != null -> {
                StrukContent(
                    struk = state.struk!!,
                    qrBitmap = state.qrBitmap,
                    onPrint = {
                        state.qrBitmap?.let { bitmap ->
                            printBitmap(context, bitmap, "Struk-${state.struk!!.orderNumber}")
                        }
                    },
                    onPrintThermal = openPrinterPicker,
                    printingThermal = printingThermal,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                )
            }
        }
    }

    // FB-096: dialog pilih printer Bluetooth paired
    if (showPrinterPicker) {
        PrinterPickerDialog(
            onDismiss = { showPrinterPicker = false },
            onPick = { device ->
                showPrinterPicker = false
                onPrintThermal(device)
            }
        )
    }
}

@Composable
private fun PrinterPickerDialog(onDismiss: () -> Unit, onPick: (BluetoothDevice) -> Unit) {
    val context = LocalContext.current
    val hasBt = Build.VERSION.SDK_INT < 31 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
    val printers = remember { if (hasBt) EscPos.pairedPrinters(context) else emptyList() }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Pilih Printer Bluetooth") },
        text = {
            if (printers.isEmpty()) {
                Text(
                    "Tidak ada printer Bluetooth ter-pairing. " +
                        "Pairing dulu printer thermal di Settings → Bluetooth, lalu coba lagi."
                )
            } else {
                Column {
                    printers.forEach { device ->
                        TextButton(
                            onClick = { onPick(device) },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(
                                Icons.Filled.Bluetooth,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(device.name ?: "Printer", fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
        },
        confirmButton = {
            if (printers.isEmpty()) {
                TextButton(onClick = onDismiss) { Text("Tutup") }
            }
        },
        dismissButton = {
            if (printers.isNotEmpty()) {
                TextButton(onClick = onDismiss) { Text("Batal") }
            }
        }
    )
}

@Composable
private fun StrukContent(
    struk: StrukData,
    qrBitmap: android.graphics.Bitmap?,
    onPrint: () -> Unit,
    onPrintThermal: () -> Unit,
    printingThermal: Boolean,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Struk "kertas" A6
        Surface(
            color = Color.White,
            shape = RoundedCornerShape(4.dp),
            tonalElevation = 1.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(
                    text = struk.merchantName,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color.Black,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
                struk.merchantAddress?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF6B7280),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider(color = Color(0xFFE1E7EF))
                Spacer(modifier = Modifier.height(8.dp))

                StrukRow("No. Order", struk.orderNumber)
                struk.customerName?.let { StrukRow("Customer", it) }
                struk.dropoffAddress?.takeIf { it.isNotBlank() }?.let { StrukRow("Alamat antar", it) }

                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider(color = Color(0xFFE1E7EF))
                Spacer(modifier = Modifier.height(8.dp))
                Text("Status pesanan", fontWeight = FontWeight.SemiBold, color = Color.Black)
                StrukRow("Status", struk.merchantStatusLabel())
                struk.merchantAcceptedAt?.takeIf { it.isNotBlank() }?.let { StrukRow("Diterima merchant", it) }
                struk.foodReadyAt?.takeIf { it.isNotBlank() }?.let { StrukRow("Siap diproses", it) }
                if (!struk.rejectReason.isNullOrBlank() || !struk.cancellationReason.isNullOrBlank()) {
                    StrukRow(
                        if (!struk.rejectReason.isNullOrBlank()) "Alasan penolakan" else "Alasan pembatalan",
                        struk.cancellationReason?.takeIf { it.isNotBlank() }
                            ?: struk.rejectReason.orEmpty().rejectReasonLabel()
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider(color = Color(0xFFE1E7EF))
                Spacer(modifier = Modifier.height(8.dp))

                struk.items.forEach { item ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "${item.quantity}× ${item.itemName}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.Black,
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            text = Format.rupiah(item.subtotal),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.Black
                        )
                    }
                    item.notes?.takeIf { it.isNotBlank() }?.let {
                        Text(
                            text = "   • $it",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF6B7280)
                        )
                    }
                    // FB-108-FIX: varian/opsi terpilih di struk digital.
                    // AUDIT-FIX: safe-call konsisten (?. + orEmpty fallback).
                    item.variants?.takeIf { it.isNotEmpty() }?.let { variants ->
                        Text(
                            text = variants.joinToString("\n") { v ->
                                "   • ${v.variantName}: ${v.optionName}"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF6B7280)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider(color = Color(0xFFE1E7EF))
                Spacer(modifier = Modifier.height(4.dp))

                StrukRow("Subtotal", Format.rupiah(struk.subtotalIdr))
                StrukRow("Ongkir", Format.rupiah(struk.deliveryFeeIdr))

                Spacer(modifier = Modifier.height(4.dp))
                HorizontalDivider(color = Color.Black, thickness = 1.dp)
                Spacer(modifier = Modifier.height(4.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "TOTAL",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.Black
                    )
                    Text(
                        text = Format.rupiah(struk.totalPriceIdr),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.Black
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                // QR handover token — di-scan kurir saat pickup
                qrBitmap?.let {
                    Image(
                        bitmap = it.asImageBitmap(),
                        contentDescription = "QR Handover Token",
                        modifier = Modifier
                            .size(180.dp)
                            .align(Alignment.CenterHorizontally),
                        contentScale = ContentScale.Fit
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = "Tunjukkan QR ini ke kurir saat pickup",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF6B7280),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = struk.createdAt.orEmpty(),
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF9CA3AF),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = onPrint,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
        ) {
            Icon(Icons.Filled.Print, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Cetak Struk (PDF / Printer Biasa)", style = MaterialTheme.typography.titleMedium)
        }

        Spacer(modifier = Modifier.height(12.dp))

        // FB-096: cetak langsung ke printer thermal Bluetooth (ESC/POS 58/80mm)
        OutlinedButton(
            onClick = onPrintThermal,
            enabled = !printingThermal,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
        ) {
            if (printingThermal) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp
                )
            } else {
                Icon(Icons.Filled.Bluetooth, contentDescription = null, modifier = Modifier.size(20.dp))
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                if (printingThermal) "Mencetak..." else "Cetak Thermal (Bluetooth)",
                style = MaterialTheme.typography.titleMedium
            )
        }

        Spacer(modifier = Modifier.height(16.dp))
    }
}

private fun StrukData.merchantStatusLabel(): String = when {
    status == "cancelled" && !rejectReason.isNullOrBlank() -> "Ditolak merchant"
    status == "cancelled" -> "Dibatalkan customer"
    status == "pending_merchant" -> "Menunggu konfirmasi"
    status == "preparing" || status == "accepted" -> "Sedang diproses"
    status == "searching" || status == "assigned" || status == "picked_up" || status == "in_transit" || status == "delivering" -> "Dalam pengantaran"
    status == "delivered" -> "Selesai"
    else -> status.replace('_', ' ').replaceFirstChar { it.uppercase() }
}

private fun String.rejectReasonLabel(): String = when (this) {
    "stok_habis" -> "Stok menu habis"
    "terlalu_sibuk" -> "Terlalu sibuk"
    "tutup_mendadak" -> "Tutup mendadak"
    "lainnya" -> "Alasan lainnya"
    else -> this
}

@Composable
private fun StrukRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = Color(0xFF6B7280)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = Color.Black,
            fontWeight = FontWeight.Medium
        )
    }
}

/**
 * Cetak bitmap QR via PrintManager native (PDF → printer / save as PDF).
 * Ukuran halaman A6 — cocok untuk struk thermal.
 */
private fun printBitmap(context: Context, bitmap: Bitmap, jobName: String) {
    val printManager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager

    val adapter = object : PrintDocumentAdapter() {
        override fun onLayout(
            oldAttributes: PrintAttributes?,
            newAttributes: PrintAttributes,
            cancellationSignal: CancellationSignal,
            callback: LayoutResultCallback,
            extras: Bundle?
        ) {
            if (cancellationSignal.isCanceled) {
                callback.onLayoutCancelled()
                return
            }
            val info = PrintDocumentInfo.Builder(jobName)
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                .setPageCount(1)
                .build()
            callback.onLayoutFinished(info, oldAttributes != newAttributes)
        }

        override fun onWrite(
            pages: Array<out PageRange>?,
            destination: ParcelFileDescriptor,
            cancellationSignal: CancellationSignal,
            callback: WriteResultCallback
        ) {
            var pdf: PdfDocument? = null
            try {
                pdf = PdfDocument()
                val pageInfo = PdfDocument.PageInfo.Builder(bitmap.width, bitmap.height, 1).create()
                val page = pdf.startPage(pageInfo)
                page.canvas.drawBitmap(bitmap, 0f, 0f, null)
                pdf.finishPage(page)

                FileOutputStream(destination.fileDescriptor).use { out ->
                    pdf.writeTo(out)
                }
                callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
            } catch (e: Exception) {
                callback.onWriteFailed(e.message)
            } finally {
                pdf?.close()
            }
        }
    }

    val attributes = PrintAttributes.Builder()
        .setMediaSize(PrintAttributes.MediaSize.ISO_A6)
        .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
        .build()

    printManager.print(jobName, adapter, attributes)
}
