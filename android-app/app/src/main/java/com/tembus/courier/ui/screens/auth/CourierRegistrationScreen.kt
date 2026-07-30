package com.tembus.courier.ui.screens.auth

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.RestorePage
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.courier.ui.security.SecureScreenEffect
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.screens.face.ActiveLivenessScreen

@Composable
fun CourierRegistrationScreen(
    onBack: () -> Unit,
    viewModel: CourierRegistrationViewModel = hiltViewModel()
) {
    SecureScreenEffect()

    val state by viewModel.uiState.collectAsState()
    var pendingDocType by remember { mutableStateOf<String?>(null) }
    var showLivenessScanner by remember { mutableStateOf(false) }
    var showKtpScanner by remember { mutableStateOf(false) }
    var showExitConfirmModal by remember { mutableStateOf(false) }

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

    BackHandler {
        if (state.currentStep > 1) {
            viewModel.previousStep()
        } else if (state.hasUnsavedDraft || state.fullName.isNotBlank() || state.nik.isNotBlank() || state.phoneNumber.isNotBlank()) {
            showExitConfirmModal = true
        } else {
            onBack()
        }
    }

    if (showExitConfirmModal) {
        Dialog(onDismissRequest = { showExitConfirmModal = false }) {
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth().padding(16.dp)
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text("Simpan Progres Pendaftaran?", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(
                        "Progres pendaftaran Anda belum selesai. Seluruh data yang telah diisi akan disimpan secara aman di perangkat Anda, sehingga bisa dilanjutkan kapan saja tanpa perlu mengisi ulang dari awal.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                        Button(
                            onClick = { showExitConfirmModal = false },
                            colors = ButtonDefaults.buttonColors(containerColor = Primary),
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("Lanjutkan Pendaftaran", fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(
                            onClick = {
                                showExitConfirmModal = false
                                onBack()
                            },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("Simpan & Keluar", fontWeight = FontWeight.SemiBold)
                        }
                        TextButton(
                            onClick = {
                                showExitConfirmModal = false
                                viewModel.clearDraft()
                                onBack()
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Hapus Data & Keluar", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }

    val documentPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val docType = pendingDocType
        if (uri != null && docType != null) {
            viewModel.uploadDocument(docType, uri)
        }
        pendingDocType = null
    }

    if (showKtpScanner) {
        KtpScannerScreen(
            onSuccess = { bitmap, ktpData ->
                viewModel.uploadKtpBitmap(bitmap, ktpData?.nik, ktpData?.name)
                showKtpScanner = false
            },
            onCancel = { showKtpScanner = false }
        )
        return
    }

    if (showLivenessScanner) {
        ActiveLivenessScreen(
            onSuccess = { bitmap -> 
                viewModel.uploadFaceEnrollmentBitmap(bitmap)
                showLivenessScanner = false
            },
            onCancel = { showLivenessScanner = false }
        )
        return
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
            IconButton(onClick = {
                if (state.currentStep > 1) {
                    viewModel.previousStep()
                } else if (state.hasUnsavedDraft || state.fullName.isNotBlank() || state.nik.isNotBlank() || state.phoneNumber.isNotBlank()) {
                    showExitConfirmModal = true
                } else {
                    onBack()
                }
            }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali", tint = Color.White)
            }

            Text("Daftar Kurir On-Demand", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Color.White)
            Text("Data ini akan diverifikasi oleh tim operasional.", color = Color.White.copy(alpha = 0.78f))

            WizardStepBar(currentStep = state.currentStep, onStepSelected = { viewModel.setStep(it) })

            if (state.hasUnsavedDraft && !state.isSubmitted) {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Icon(Icons.Default.RestorePage, contentDescription = null, tint = Primary)
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Melanjutkan pendaftaran tertunda", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = Primary)
                            Text("Data sebelumnya telah dipulihkan otomatis agar Anda tidak perlu mengisi ulang.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        IconButton(onClick = { viewModel.clearDraft() }) {
                            Icon(Icons.Default.DeleteOutline, contentDescription = "Mulai ulang", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }

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

            when (state.currentStep) {
                1 -> Step1ProfileContent(state, viewModel) { showKtpScanner = true }
                2 -> Step2VehicleContent(state, viewModel)
                3 -> Step3BankContent(state, viewModel)
                4 -> Step4DocumentContent(
                    state = state,
                    requiredDocuments = requiredDocuments,
                    uploadedDocumentCount = uploadedDocumentCount,
                    onPickDocument = { pendingDocType = it; documentPicker.launch("*/*") },
                    onPickImage = { pendingDocType = it; documentPicker.launch("image/*") },
                    onScanKtp = { showKtpScanner = true },
                    onCaptureFace = { showLivenessScanner = true }
                )
            }

            state.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            }

            if (state.currentStep == 4) {
                Spacer(modifier = Modifier.height(4.dp))
                TermsCheckbox(
                    checked = state.agreedToTerms,
                    onCheckedChange = { viewModel.update { copy(agreedToTerms = it) } }
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (state.currentStep > 1) {
                    OutlinedButton(
                        onClick = { viewModel.previousStep() },
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)
                    ) {
                        Text("Kembali", fontWeight = FontWeight.Bold)
                    }
                }

                Button(
                    onClick = {
                        if (state.currentStep < 4) {
                            viewModel.nextStep()
                        } else {
                            viewModel.submit()
                        }
                    },
                    enabled = if (state.currentStep == 4) !state.isLoading && state.agreedToTerms else !state.isLoading,
                    modifier = Modifier.weight(2f).height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = if (state.currentStep > 1) MaterialTheme.colorScheme.surface else Primary),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    if (state.isLoading) {
                        CircularProgressIndicator(color = Primary, modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                    } else {
                        Text(
                            text = if (state.currentStep < 4) "Simpan & Lanjut" else "Kirim Pendaftaran",
                            fontWeight = FontWeight.Bold,
                            color = if (state.currentStep > 1) Primary else Color.White
                        )
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun WizardStepBar(currentStep: Int, onStepSelected: (Int) -> Unit) {
    val steps = listOf("Data Diri", "Kendaraan", "Rekening", "Dokumen")
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            steps.forEachIndexed { index, title ->
                val stepNum = index + 1
                val isActive = stepNum == currentStep
                val isDone = stepNum < currentStep

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clickable(enabled = isDone) { onStepSelected(stepNum) }
                        .padding(4.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .background(
                                color = when {
                                    isDone -> MaterialTheme.colorScheme.surface
                                    isActive -> MaterialTheme.colorScheme.surface
                                    else -> Color.White.copy(alpha = 0.2f)
                                },
                                shape = RoundedCornerShape(50)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        if (isDone) {
                            Icon(Icons.Default.Check, contentDescription = null, tint = Primary, modifier = Modifier.size(16.dp))
                        } else {
                            Text(
                                text = stepNum.toString(),
                                style = MaterialTheme.typography.labelMedium,
                                color = if (isActive) Primary else Color.White,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = title,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = if (isActive || isDone) FontWeight.Bold else FontWeight.Normal,
                        color = if (isActive || isDone) Color.White else Color.White.copy(alpha = 0.6f)
                    )
                }
            }
        }
        LinearProgressIndicator(
            progress = { currentStep / 4f },
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp)),
            color = MaterialTheme.colorScheme.surface,
            trackColor = Color.White.copy(alpha = 0.2f)
        )
    }
}

@Composable
private fun Step1ProfileContent(
    state: CourierRegistrationUiState,
    viewModel: CourierRegistrationViewModel,
    onScanKtp: () -> Unit
) {
    RegistrationSection("1. Data Diri & Verifikasi KTP") {
        Card(
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(
                containerColor = if (state.isOcrVerified) Primary.copy(alpha = 0.1f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
            ),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(
                    imageVector = if (state.isOcrVerified) Icons.Default.Verified else Icons.Default.CameraAlt,
                    contentDescription = null,
                    tint = if (state.isOcrVerified) Primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (state.isOcrVerified) "e-KTP Terverifikasi OCR" else "Scan e-KTP untuk Isi Otomatis",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (state.isOcrVerified) Primary else MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = if (state.isOcrVerified) "NIK dan Nama terisi otomatis. Anda tetap dapat memperbaikinya jika ada kesalahan." else "Gunakan kamera live untuk memindai NIK dan Nama Lengkap secara instan.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                OutlinedButton(onClick = onScanKtp, shape = RoundedCornerShape(8.dp)) {
                    Text(if (state.isOcrVerified) "Scan Ulang" else "Scan KTP")
                }
            }
        }

        AppTextField("NIK (16 digit) ${if (state.isOcrVerified) "[✔ OCR]" else ""}", state.nik, KeyboardType.Number) { viewModel.update { copy(nik = it) } }
        AppTextField("Nama lengkap sesuai KTP ${if (state.isOcrVerified) "[✔ OCR]" else ""}", state.fullName) { viewModel.update { copy(fullName = it) } }
        AppTextField("Nomor WhatsApp aktif", state.phoneNumber, KeyboardType.Phone) { viewModel.update { copy(phoneNumber = it) } }
        AppTextField("Alamat email aktif", state.email, KeyboardType.Email) { viewModel.update { copy(email = it) } }
        AppPasswordField("Password login setelah disetujui", state.password) { viewModel.update { copy(password = it) } }
    }
}

@Composable
private fun Step2VehicleContent(
    state: CourierRegistrationUiState,
    viewModel: CourierRegistrationViewModel
) {
    RegistrationSection("2. Detail Kendaraan Operasional") {
        AppDropdownField(
            label = "Kategori Kendaraan",
            value = state.vehicleCategory,
            options = listOf("matic", "bebek", "sport", "listrik")
        ) { viewModel.update { copy(vehicleCategory = it) } }
        AppTextField("Plat nomor (contoh: B 1234 CD)", state.vehiclePlate) { viewModel.update { copy(vehiclePlate = it) } }
        AppTextField("Merk motor (Honda, Yamaha, dll)", state.vehicleBrand) { viewModel.update { copy(vehicleBrand = it) } }
        AppTextField("Model motor (Beat, Vario, NMAX)", state.vehicleModel) { viewModel.update { copy(vehicleModel = it) } }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AppTextField("Tahun", state.vehicleYear, KeyboardType.Number, modifier = Modifier.weight(1f)) { viewModel.update { copy(vehicleYear = it) } }
            AppTextField("Kapasitas CC", state.vehicleCc, KeyboardType.Number, modifier = Modifier.weight(1f)) { viewModel.update { copy(vehicleCc = it) } }
        }
        CheckRow("SIM C / D aktif", state.simActive) { viewModel.update { copy(simActive = it) } }
        CheckRow("Pajak 5 tahunan (STNK/SKPD) hidup", state.skpdTaxActive) { viewModel.update { copy(skpdTaxActive = it) } }
        CheckRow("Mesin 4-tak (bukan 2-tak berasap)", state.fourStroke) { viewModel.update { copy(fourStroke = it) } }
    }
}

@Composable
private fun Step3BankContent(
    state: CourierRegistrationUiState,
    viewModel: CourierRegistrationViewModel
) {
    RegistrationSection("3. Rekening Bank Pencairan Dana") {
        AppTextField("Nama Bank (BCA, Mandiri, BRI, BNI)", state.bankCode) { viewModel.update { copy(bankCode = it) } }
        AppTextField("Nomor Rekening", state.bankAccountNumber, KeyboardType.Number) { viewModel.update { copy(bankAccountNumber = it) } }
        AppTextField("Nama Pemilik Rekening", state.bankAccountName) { viewModel.update { copy(bankAccountName = it) } }
    }
}

@Composable
private fun Step4DocumentContent(
    state: CourierRegistrationUiState,
    requiredDocuments: List<String>,
    uploadedDocumentCount: Int,
    onPickDocument: (String) -> Unit,
    onPickImage: (String) -> Unit,
    onScanKtp: () -> Unit,
    onCaptureFace: () -> Unit
) {
    RegistrationSection("4. Upload Dokumen Persyaratan") {
        Text("$uploadedDocumentCount dari ${requiredDocuments.size} dokumen wajib terupload", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        DocumentUploadRow("e-KTP Asli (Live Camera)", "ktp", state.ktpRef, state.documentFileNames["ktp"], state.uploadingDocType) {
            onScanKtp()
        }
        DocumentUploadRow("SIM C / D Asli", "sim", state.simRef, state.documentFileNames["sim"], state.uploadingDocType) { docType ->
            onPickDocument(docType)
        }
        DocumentUploadRow("STNK Asli", "stnk", state.stnkRef, state.documentFileNames["stnk"], state.uploadingDocType) { docType ->
            onPickDocument(docType)
        }
        DocumentUploadRow("SKPD Pajak 5 Tahunan", "skpd", state.skpdRef, state.documentFileNames["skpd"], state.uploadingDocType) { docType ->
            onPickDocument(docType)
        }
        DocumentUploadRow("Foto kendaraan", "vehicle_photo", state.vehiclePhotoRef, state.documentFileNames["vehicle_photo"], state.uploadingDocType) { docType ->
            onPickImage(docType)
        }
        DocumentUploadRow("SKCK Asli / Legalisir", "skck", state.skckRef, state.documentFileNames["skck"], state.uploadingDocType) { docType ->
            onPickDocument(docType)
        }
        DocumentUploadRow("Bukti rekening bank", "bank_account", state.bankRef, state.documentFileNames["bank_account"], state.uploadingDocType) { docType ->
            onPickDocument(docType)
        }
        FaceEnrollmentUploadRow(
            faceRef = state.faceEnrollmentRef,
            fileName = state.documentFileNames["face_enrollment"],
            uploadingDocType = state.uploadingDocType,
            onCapture = onCaptureFace
        )
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
private fun AppPasswordField(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    onChange: (String) -> Unit
) {
    var passwordVisible by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        trailingIcon = {
            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                Icon(
                    imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                    contentDescription = if (passwordVisible) "Sembunyikan password" else "Tampilkan password"
                )
            }
        },
        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        supportingText = {
            val isValid = value.length >= 8
            val color = if (value.isEmpty()) MaterialTheme.colorScheme.onSurfaceVariant else if (isValid) Primary else MaterialTheme.colorScheme.error
            val text = if (value.isEmpty()) "Minimal 8 karakter agar akun aman & mudah diingat" else if (isValid) "✔ Kekuatan password: Kuat & Aman" else "❌ Terlalu pendek (minimal 8 karakter)"
            Text(text = text, style = MaterialTheme.typography.bodySmall, color = color)
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppDropdownField(
    label: String,
    value: String,
    options: List<String>,
    modifier: Modifier = Modifier,
    onChange: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
        modifier = modifier
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.menuAnchor().fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option) },
                    onClick = {
                        onChange(option)
                        expanded = false
                    }
                )
            }
        }
    }
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

@Composable
private fun FaceEnrollmentUploadRow(
    faceRef: String,
    fileName: String?,
    uploadingDocType: String?,
    onCapture: () -> Unit
) {
    val isUploading = uploadingDocType == "face_enrollment"
    val uploaded = faceRef.isNotBlank()
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            imageVector = if (uploaded) Icons.Default.CheckCircle else Icons.Default.Face,
            contentDescription = null,
            tint = if (uploaded) Primary else MaterialTheme.colorScheme.onSurfaceVariant
        )
        Column(modifier = Modifier.weight(1f)) {
            Text("Foto Wajah (Live Camera)", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Text(
                fileName ?: if (uploaded) "Foto sudah diambil" else "Wajib menggunakan kamera — tidak boleh dari galeri",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2
            )
        }
        OutlinedButton(
            onClick = onCapture,
            enabled = uploadingDocType == null,
            shape = RoundedCornerShape(12.dp)
        ) {
            if (isUploading) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
            } else {
                Icon(Icons.Default.CameraAlt, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(if (uploaded) "Ambil Ulang" else "Kamera")
            }
        }
    }
}
@Composable
private fun TermsCheckbox(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable { onCheckedChange(!checked) }
            .padding(vertical = 8.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = onCheckedChange
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Saya telah membaca, memahami, dan menyetujui:",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = "Perjanjian Mitra & Kebijakan Privasi TEMBUS",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Bold,
                color = Primary
            )
        }
    }
}
