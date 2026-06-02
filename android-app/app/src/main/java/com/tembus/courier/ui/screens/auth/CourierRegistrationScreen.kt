package com.tembus.courier.ui.screens.auth

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.courier.ui.security.SecureScreenEffect
import com.tembus.courier.ui.theme.Primary

@Composable
fun CourierRegistrationScreen(
    onBack: () -> Unit,
    viewModel: CourierRegistrationViewModel = hiltViewModel()
) {
    SecureScreenEffect()

    val state by viewModel.uiState.collectAsState()
    var pendingDocType by remember { mutableStateOf<String?>(null) }
    val requiredDocuments = listOf(
        state.ktpRef,
        state.simRef,
        state.stnkRef,
        state.skpdRef,
        state.vehiclePhotoRef,
        state.skckRef,
        state.bankRef,
        state.faceEnrollmentRef
    )
    val uploadedDocumentCount = requiredDocuments.count { it.isNotBlank() }
    val profileReady = state.fullName.isNotBlank() &&
        state.phoneNumber.isNotBlank() &&
        state.email.isNotBlank() &&
        state.password.isNotBlank()
    val vehicleReady = state.vehiclePlate.isNotBlank() &&
        state.vehicleBrand.isNotBlank() &&
        state.vehicleModel.isNotBlank() &&
        state.vehicleYear.isNotBlank() &&
        state.vehicleCc.isNotBlank() &&
        state.fourStroke &&
        state.simActive &&
        state.skpdTaxActive
    val bankReady = state.bankCode.isNotBlank() &&
        state.bankAccountNumber.isNotBlank() &&
        state.bankAccountName.isNotBlank()
    val documentPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val docType = pendingDocType
        if (uri != null && docType != null) {
            viewModel.uploadDocument(docType, uri)
        }
        pendingDocType = null
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Primary, MaterialTheme.colorScheme.background),
                    endY = 760f
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali", tint = Color.White)
            }

            Text("Daftar Kurir On-Demand", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Color.White)
            Text("Data ini akan diverifikasi oleh tim operasional.", color = Color.White.copy(alpha = 0.78f))

            RegistrationProgressCard(
                profileReady = profileReady,
                vehicleReady = vehicleReady,
                bankReady = bankReady,
                uploadedDocumentCount = uploadedDocumentCount,
                totalDocuments = requiredDocuments.size
            )

            if (state.isSubmitted) {
                Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Primary, modifier = Modifier.size(42.dp))
                        Text("Pendaftaran terkirim", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text("Tim operasional akan memeriksa e-KTP, SIM, STNK, SKPD, SKCK, rekening bank, verifikasi wajah, dan kelayakan kendaraan.")
                        Button(onClick = onBack, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Primary)) {
                            Text("Kembali ke Login")
                        }
                    }
                }
                return@Column
            }

            RegistrationSection("Data Diri") {
                AppTextField("Nama lengkap", state.fullName) { viewModel.update { copy(fullName = it) } }
                AppTextField("Nomor HP", state.phoneNumber, KeyboardType.Phone) { viewModel.update { copy(phoneNumber = it) } }
                AppTextField("Email", state.email, KeyboardType.Email) { viewModel.update { copy(email = it) } }
                AppTextField("Password login setelah disetujui", state.password, KeyboardType.Password) { viewModel.update { copy(password = it) } }
            }

            RegistrationSection("Kendaraan") {
                AppTextField("Plat nomor", state.vehiclePlate) { viewModel.update { copy(vehiclePlate = it.uppercase()) } }
                AppTextField("Merek", state.vehicleBrand) { viewModel.update { copy(vehicleBrand = it) } }
                AppTextField("Model", state.vehicleModel) { viewModel.update { copy(vehicleModel = it) } }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppTextField("Tahun", state.vehicleYear, KeyboardType.Number, Modifier.weight(1f)) { viewModel.update { copy(vehicleYear = it) } }
                    AppTextField("CC", state.vehicleCc, KeyboardType.Number, Modifier.weight(1f)) { viewModel.update { copy(vehicleCc = it) } }
                }
                AppTextField("Tipe kendaraan (matic/bebek/trail/sport/touring)", state.vehicleCategory) { viewModel.update { copy(vehicleCategory = it.lowercase()) } }
                CheckRow("Mesin 4 tak", state.fourStroke) { viewModel.update { copy(fourStroke = it) } }
                CheckRow("SIM masih berlaku", state.simActive) { viewModel.update { copy(simActive = it) } }
                CheckRow("SKPD/pajak 5 tahunan masih berlaku", state.skpdTaxActive) { viewModel.update { copy(skpdTaxActive = it) } }
            }

            RegistrationSection("Rekening Bank") {
                AppTextField("Kode bank (BCA/BNI/MANDIRI/dsb)", state.bankCode) { viewModel.update { copy(bankCode = it.uppercase()) } }
                AppTextField("Nomor rekening", state.bankAccountNumber, KeyboardType.Number) { viewModel.update { copy(bankAccountNumber = it) } }
                AppTextField("Nama pemilik rekening", state.bankAccountName) { viewModel.update { copy(bankAccountName = it) } }
            }

            RegistrationSection("Referensi Dokumen") {
                Text("Upload JPG, PNG, WEBP, atau PDF maksimal 10 MB per dokumen.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                LinearProgressIndicator(
                    progress = { uploadedDocumentCount / requiredDocuments.size.toFloat() },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp),
                    color = Primary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )
                Text("$uploadedDocumentCount dari ${requiredDocuments.size} dokumen wajib terupload", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                DocumentUploadRow("e-KTP Asli", "ktp", state.ktpRef, state.documentFileNames["ktp"], state.uploadingDocType) { docType ->
                    pendingDocType = docType
                    documentPicker.launch("image/*")
                }
                DocumentUploadRow("SIM C / D Asli", "sim", state.simRef, state.documentFileNames["sim"], state.uploadingDocType) { docType ->
                    pendingDocType = docType
                    documentPicker.launch("*/*")
                }
                DocumentUploadRow("STNK Asli", "stnk", state.stnkRef, state.documentFileNames["stnk"], state.uploadingDocType) { docType ->
                    pendingDocType = docType
                    documentPicker.launch("*/*")
                }
                DocumentUploadRow("SKPD Pajak 5 Tahunan", "skpd", state.skpdRef, state.documentFileNames["skpd"], state.uploadingDocType) { docType ->
                    pendingDocType = docType
                    documentPicker.launch("*/*")
                }
                DocumentUploadRow("Foto kendaraan", "vehicle_photo", state.vehiclePhotoRef, state.documentFileNames["vehicle_photo"], state.uploadingDocType) { docType ->
                    pendingDocType = docType
                    documentPicker.launch("image/*")
                }
                DocumentUploadRow("SKCK Asli / Legalisir", "skck", state.skckRef, state.documentFileNames["skck"], state.uploadingDocType) { docType ->
                    pendingDocType = docType
                    documentPicker.launch("*/*")
                }
                DocumentUploadRow("Bukti rekening bank", "bank_account", state.bankRef, state.documentFileNames["bank_account"], state.uploadingDocType) { docType ->
                    pendingDocType = docType
                    documentPicker.launch("*/*")
                }
                DocumentUploadRow("Verifikasi wajah", "face_enrollment", state.faceEnrollmentRef, state.documentFileNames["face_enrollment"], state.uploadingDocType) { docType ->
                    pendingDocType = docType
                    documentPicker.launch("image/*")
                }
            }

            state.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            }

            Button(
                onClick = viewModel::submit,
                enabled = !state.isLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Primary),
                shape = RoundedCornerShape(12.dp)
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                } else {
                    Text("Kirim Pendaftaran", fontWeight = FontWeight.Bold)
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun RegistrationProgressCard(
    profileReady: Boolean,
    vehicleReady: Boolean,
    bankReady: Boolean,
    uploadedDocumentCount: Int,
    totalDocuments: Int
) {
    val progressSteps = listOf(
        "Data diri" to profileReady,
        "Kendaraan" to vehicleReady,
        "Rekening" to bankReady,
        "Dokumen" to (uploadedDocumentCount == totalDocuments)
    )
    val completed = progressSteps.count { it.second }
    Card(shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text("Progress Pendaftaran", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("$completed dari ${progressSteps.size} tahap siap direview", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                AssistChip(
                    onClick = {},
                    label = { Text("$uploadedDocumentCount/$totalDocuments dokumen") },
                    leadingIcon = { Icon(Icons.Default.CloudUpload, contentDescription = null, modifier = Modifier.size(16.dp)) }
                )
            }
            LinearProgressIndicator(
                progress = { completed / progressSteps.size.toFloat() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp),
                color = Primary,
                trackColor = MaterialTheme.colorScheme.surfaceVariant
            )
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                progressSteps.forEach { (label, ready) ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(label, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            if (ready) "Siap" else "Lengkapi",
                            style = MaterialTheme.typography.labelLarge,
                            color = if (ready) Primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RegistrationSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            content()
        }
    }
}

@Composable
private fun AppTextField(
    label: String,
    value: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    modifier: Modifier = Modifier,
    onChange: (String) -> Unit
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp)
    )
}

@Composable
private fun CheckRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
private fun DocumentUploadRow(
    label: String,
    docType: String,
    fileUrl: String,
    fileName: String?,
    uploadingDocType: String?,
    onPick: (String) -> Unit
) {
    val isUploading = uploadingDocType == docType
    val uploaded = fileUrl.isNotBlank()
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            imageVector = if (uploaded) Icons.Default.CheckCircle else Icons.AutoMirrored.Filled.InsertDriveFile,
            contentDescription = null,
            tint = if (uploaded) Primary else MaterialTheme.colorScheme.onSurfaceVariant
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Text(
                fileName ?: if (uploaded) "Dokumen sudah terupload" else "Belum ada file",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1
            )
        }
        OutlinedButton(
            onClick = { onPick(docType) },
            enabled = uploadingDocType == null,
            shape = RoundedCornerShape(12.dp)
        ) {
            if (isUploading) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
            } else {
                Icon(Icons.Default.CloudUpload, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(if (uploaded) "Ganti" else "Upload")
            }
        }
    }
}
