package com.tembus.courier.ui.screens.service

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import com.tembus.courier.ui.localization.CourierText as Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.core.content.ContextCompat
import java.text.NumberFormat
import java.util.Locale

private const val STEP_CAPABILITY = 0
private const val STEP_PRICING_AND_STOCK = 1
private const val STEP_REVIEW = 2

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceUpgradeScreen(
    viewModel: ServiceUpgradeViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit,
    vehicleType: String = "motor",
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var capturedPhoto by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
        if (bitmap != null) {
            capturedPhoto = bitmap
            viewModel.clearProofImage()
            viewModel.setMessage("Preview foto siap. Periksa gambar sebelum menyimpan.", isError = false)
        } else {
            viewModel.setMessage("Foto kamera dibatalkan. Ambil foto alat untuk melanjutkan.", isError = true)
        }
    }
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
        if (granted) {
            cameraLauncher.launch(null)
        } else {
            viewModel.setMessage("Izin kamera diperlukan untuk memverifikasi alat secara langsung.", isError = true)
        }
    }
    fun openCamera() {
        if (hasCameraPermission) {
            cameraLauncher.launch(null)
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }
    val serviceCode = if (vehicleType.equals("car", ignoreCase = true)) "tambal_ban_mobil" else "tambal_ban_motor"
    val vehicleLabel = if (serviceCode.endsWith("motor")) "motor" else "mobil"

    var currentStep by rememberSaveable { mutableStateOf(STEP_CAPABILITY) }
    var supportsTubeless by rememberSaveable { mutableStateOf(false) }
    var supportsTube by rememberSaveable { mutableStateOf(false) }
    var hasTireRepairKit by rememberSaveable { mutableStateOf(false) }
    var hasElectricPump by rememberSaveable { mutableStateOf(false) }
    var tubelessStock by rememberSaveable { mutableStateOf("") }
    var tubeStock by rememberSaveable { mutableStateOf("") }
    var valveStock by rememberSaveable { mutableStateOf("") }
    var onboardingPricePerHole by rememberSaveable { mutableStateOf("") }

    val adminTariff = uiState.servicePrices.firstOrNull { it.serviceCode == serviceCode }
    val priceCandidate = onboardingPricePerHole.toLongOrNull() ?: 0L
    val priceWithinAdminBounds = adminTariff != null && priceCandidate in adminTariff.minPrice..adminTariff.maxPrice
    val validInventory = (!supportsTubeless || (tubelessStock.toIntOrNull() ?: 0) > 0) &&
        (!supportsTube || (tubeStock.toIntOrNull() ?: 0) > 0)
    val canChooseCapability = (supportsTubeless || supportsTube) && hasTireRepairKit && hasElectricPump
    val canContinueToReview = canChooseCapability && validInventory &&
        priceWithinAdminBounds
    val readyToSubmit = canContinueToReview && viewModel.proofImageUrl.isNotBlank()

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                title = { Text("Daftar Tambal Ban", maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
                    }
                },
            )
        },
        bottomBar = {
            Surface(
                tonalElevation = 3.dp,
                shadowElevation = 8.dp,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .imePadding()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (currentStep > STEP_CAPABILITY) {
                        OutlinedButton(
                            onClick = { currentStep -= 1 },
                            modifier = Modifier.weight(1f),
                        ) {
                            Text("Kembali")
                        }
                    }
                    Button(
                        onClick = {
                            when (currentStep) {
                                STEP_CAPABILITY -> {
                                    if (canChooseCapability) currentStep = STEP_PRICING_AND_STOCK
                                    else viewModel.setMessage(
                                        "Pilih minimal satu tipe ban dan lengkapi kepemilikan kit serta pompa elektrik.",
                                        isError = true,
                                    )
                                }
                                STEP_PRICING_AND_STOCK -> {
                                    if (canContinueToReview) currentStep = STEP_REVIEW
                                    else viewModel.setMessage(
                                        "Isi harga, stok sesuai tipe ban, kit tambal, dan pompa elektrik terlebih dahulu.",
                                        isError = true,
                                    )
                                }
                                else -> {
                                    if (readyToSubmit) {
                                        viewModel.requestUpgrade(
                                            serviceCode = serviceCode,
                                            supportsTubeless = supportsTubeless,
                                            supportsTube = supportsTube,
                                            hasTireRepairKit = hasTireRepairKit,
                                            hasElectricPump = hasElectricPump,
                                            materialInventory = mapOf(
                                                (if (serviceCode.endsWith("motor")) "tambal_tubeless" else "tambal_ban_mobil") to (tubelessStock.toIntOrNull() ?: 0),
                                                (if (serviceCode.endsWith("motor")) "tambal_ban_dalam" else "tambal_ban_dalam_mobil") to (tubeStock.toIntOrNull() ?: 0),
                                                (if (serviceCode.endsWith("motor")) "pentil_ban_motor" else "pentil_ban_mobil") to (valveStock.toIntOrNull() ?: 0),
                                            ),
                                            pricePerHoleIdr = onboardingPricePerHole.toLongOrNull() ?: 0L,
                                        )
                                    } else {
                                        viewModel.setMessage(
                                            "Ambil foto alat dengan kamera agar admin dapat memverifikasi pengajuan.",
                                            isError = true,
                                        )
                                    }
                                }
                            }
                        },
                        enabled = !uiState.isLoading,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            when {
                                uiState.isLoading -> "Mengirim..."
                                currentStep < STEP_REVIEW -> "Lanjut"
                                else -> "Kirim pengajuan"
                            }
                        )
                    }
                }
            }
        },
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            StepProgress(currentStep = currentStep)

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                shape = RoundedCornerShape(20.dp),
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        text = "Layanan untuk kendaraan $vehicleLabel",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = when (currentStep) {
                            STEP_CAPABILITY -> "1. Kemampuan layanan"
                            STEP_PRICING_AND_STOCK -> "2. Stok dan tarif"
                            else -> "3. Verifikasi pengajuan"
                        },
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = when (currentStep) {
                            STEP_CAPABILITY -> "Pilih layanan yang benar-benar bisa kamu kerjakan. Data kendaraan sudah dikunci dari profil yang disetujui."
                            STEP_PRICING_AND_STOCK -> "Masukkan stok yang tersedia dan harga jasa per lubang. Stok akan menjadi syarat menerima order."
                            else -> "Ambil bukti alat dengan kamera. Layanan baru aktif setelah pengajuan diperiksa dan disetujui admin."
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    when (currentStep) {
                        STEP_CAPABILITY -> {
                            Text("Tipe ban yang bisa ditangani", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            CapabilityCheckRow("Tubeless", supportsTubeless) { supportsTubeless = it }
                            CapabilityCheckRow("Ban dengan ban dalam", supportsTube) { supportsTube = it }
                            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                            Text("Peralatan wajib", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            CapabilityCheckRow("Memiliki kit tambal ban", hasTireRepairKit) { hasTireRepairKit = it }
                            CapabilityCheckRow("Memiliki pompa angin elektrik", hasElectricPump) { hasElectricPump = it }
                        }

                        STEP_PRICING_AND_STOCK -> {
                            RoadsideAmountInput(
                                label = "Harga jasa per lubang",
                                value = onboardingPricePerHole,
                                onValueChange = { onboardingPricePerHole = it },
                                supportingText = adminTariff?.let {
                                    "Batas admin: Rp ${formatIdr(it.minPrice)}–Rp ${formatIdr(it.maxPrice)} per lubang."
                                } ?: "Batas harga jasa belum tersedia dari server.",
                            )
                            if (supportsTubeless) {
                                RoadsideAmountInput(
                                    label = "Stok material tambal tubeless",
                                    value = tubelessStock,
                                    onValueChange = { tubelessStock = it },
                                    supportingText = "Wajib diisi karena kamu menerima tubeless.",
                                )
                            }
                            if (supportsTube) {
                                RoadsideAmountInput(
                                    label = "Stok material tambal ban dalam",
                                    value = tubeStock,
                                    onValueChange = { tubeStock = it },
                                    supportingText = "Wajib diisi karena kamu menerima ban dalam.",
                                )
                            }
                            RoadsideAmountInput(
                                label = "Stok pentil cadangan (opsional)",
                                value = valveStock,
                                onValueChange = { valveStock = it },
                            )
                            Text(
                                "Stok dihitung sebagai jumlah material siap pakai. Jika stok habis, penawaran Tambal Ban akan dihentikan sampai diperbarui.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            RoadsideTariffCard(
                                adminTariff = adminTariff,
                                courierPricePerHoleIdr = onboardingPricePerHole.toLongOrNull(),
                            )
                        }

                        else -> {
                            capturedPhoto?.let { photo ->
                                Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(16.dp),
                                ) {
                                    Image(
                                        bitmap = photo.asImageBitmap(),
                                        contentDescription = "Preview foto alat tambal ban",
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .heightIn(min = 180.dp, max = 300.dp),
                                    )
                                }
                                Text(
                                    "Ini preview foto dari kamera. Simpan foto ini jika alat dan pompa terlihat jelas.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                OutlinedButton(
                                    onClick = { viewModel.uploadProofImage(photo) },
                                    enabled = !uiState.isLoading && viewModel.proofImageUrl.isBlank(),
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null)
                                    Spacer(Modifier.width(8.dp))
                                    Text(if (viewModel.proofImageUrl.isBlank()) "Gunakan foto ini" else "Foto sudah disimpan")
                                }
                            }
                            OutlinedButton(
                                onClick = {
                                    capturedPhoto = null
                                    viewModel.clearProofImage()
                                    openCamera()
                                },
                                enabled = !uiState.isLoading,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Icon(
                                    imageVector = if (viewModel.proofImageUrl.isBlank()) Icons.Default.CameraAlt else Icons.Default.CheckCircle,
                                    contentDescription = null,
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(if (capturedPhoto == null && viewModel.proofImageUrl.isBlank()) "Ambil foto dengan kamera" else "Ambil ulang foto")
                            }
                            Text(
                                if (capturedPhoto != null && viewModel.proofImageUrl.isBlank()) {
                                    "Foto belum dilampirkan. Tekan Gunakan foto ini setelah preview diperiksa."
                                } else if (viewModel.proofImageUrl.isBlank()) {
                                    "Kamera wajib digunakan. Pemilihan foto dari galeri tidak tersedia untuk bukti ini."
                                } else {
                                    "Foto kamera sudah tersimpan dan akan dilampirkan pada pengajuan."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = if (viewModel.proofImageUrl.isBlank()) {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                } else {
                                    MaterialTheme.colorScheme.primary
                                },
                            )
                            ReviewRow("Tipe ban", listOfNotNull(
                                "Tubeless".takeIf { supportsTubeless },
                                "Ban dalam".takeIf { supportsTube },
                            ).joinToString(" + "))
                            ReviewRow("Peralatan", "Kit tambal + pompa elektrik")
                            ReviewRow("Harga jasa", "Rp ${onboardingPricePerHole.ifBlank { "0" }} per lubang")
                            ReviewRow("Stok material", listOfNotNull(
                                "Tubeless: ${tubelessStock.ifBlank { "0" }}".takeIf { supportsTubeless },
                                "Ban dalam: ${tubeStock.ifBlank { "0" }}".takeIf { supportsTube },
                            ).joinToString(" • "))
                            Text(
                                "Pengajuan akan berstatus menunggu review. Customer belum bisa menerima layanan ini sampai admin menyetujui data alat dan tarif.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    uiState.message?.let { message ->
                        Text(
                            text = message,
                            color = if (uiState.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }

            Text(
                text = "Harga jasa, tarif perjalanan, dan aturan potongan dibaca dari server. Customer melihatnya sebagai penawaran terkunci sebelum pembayaran.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 20.dp),
            )
        }
    }
}

@Composable
private fun StepProgress(currentStep: Int) {
    val labels = listOf("Kemampuan", "Stok & tarif", "Verifikasi")
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            labels.indices.forEach { index ->
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(5.dp)
                        .background(
                            if (index <= currentStep) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.surfaceVariant,
                            RoundedCornerShape(50),
                        )
                )
            }
        }
        Text(
            "Langkah ${currentStep + 1} dari ${labels.size} • ${labels[currentStep]}",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

@Composable
private fun ReviewRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            label,
            modifier = Modifier.weight(0.38f),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            value,
            modifier = Modifier.weight(0.62f),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun RoadsideTariffCard(
    adminTariff: com.tembus.courier.data.model.CourierServicePrice?,
    courierPricePerHoleIdr: Long?,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(16.dp),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Tarif perjalanan dari admin", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            if (adminTariff == null || adminTariff.adminBaseFareIdr <= 0) {
                Text("Tarif perjalanan belum tersedia dari server. Pengajuan tidak dapat dilanjutkan sebelum admin mengatur tarif.", color = MaterialTheme.colorScheme.error)
            } else {
                ReviewRow("0–${adminTariff.adminIncludedDistanceKm.stripTrailingZeros()} km", "Rp ${formatIdr(adminTariff.adminBaseFareIdr)}")
                ReviewRow("Per km berikutnya", "Rp ${formatIdr(adminTariff.adminPerKmIdr)}")
                ReviewRow("Jasa per lubang", "Rp ${formatIdr(courierPricePerHoleIdr ?: 0L)}")
                Text(
                    if (adminTariff.courierKeepsServiceFee) "Jasa per lubang menjadi pendapatan mitra; potongan hanya mengikuti komponen perjalanan dari konfigurasi server."
                    else "Aturan potongan jasa mengikuti konfigurasi server.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun formatIdr(value: Long): String = NumberFormat.getNumberInstance(Locale("id", "ID")).format(value)

private fun Double.stripTrailingZeros(): String = if (this % 1.0 == 0.0) toInt().toString() else toString()

@Composable
private fun CapabilityCheckRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Text(label, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun RoadsideAmountInput(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    supportingText: String? = null,
) {
    val isPrice = label.contains("Harga")
    OutlinedTextField(
        value = value,
        onValueChange = { input -> if (input.all(Char::isDigit)) onValueChange(input) },
        label = { Text("$label${if (isPrice) " (Rp)" else ""}") },
        prefix = if (isPrice) ({ Text("Rp ") }) else null,
        supportingText = supportingText?.let { { Text(it) } },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
}
