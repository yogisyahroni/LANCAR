package com.tembus.courier.ui.screens.service

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Color as AndroidColor
import android.graphics.Paint
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import com.tembus.courier.ui.localization.CourierText as Text
import com.tembus.courier.ui.localization.CourierTextCatalog
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CompletionScreen(
    serviceType: String, // "tambal_ban" or "towing"
    onBackClick: () -> Unit,
    onComplete: (String, Bitmap, Bitmap?, Map<String, Any>?) -> Unit // notes, completion photo, signature, structured damage
) {
    val context = LocalContext.current
    var notes by remember { mutableStateOf("") }
    var completionPhoto by remember { mutableStateOf<Bitmap?>(null) }
    var signatureName by remember { mutableStateOf("") }
    var signatureStrokes by remember { mutableStateOf<List<List<Offset>>>(emptyList()) }
    var showCompleteConfirm by remember { mutableStateOf(false) }
    var damageAreas by remember { mutableStateOf(setOf<String>()) }
    var damageSeverity by remember { mutableStateOf("none") }
    var damageNotes by remember { mutableStateOf("") }
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicturePreview()
    ) { bitmap ->
        if (bitmap != null) completionPhoto = bitmap
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
        if (granted) cameraLauncher.launch(null)
    }
    val requiresSignature = serviceType == "towing"
    val hasSignatureInk = signatureStrokes.any { it.size > 1 }
    val canComplete = completionPhoto != null &&
        (!requiresSignature || (signatureName.isNotBlank() && hasSignatureInk))

    if (showCompleteConfirm) {
        AlertDialog(
            onDismissRequest = { showCompleteConfirm = false },
            title = { Text("Selesaikan layanan?") },
            text = {
                Text(
                    if (requiresSignature) {
                        "Pastikan foto hasil, nama penerima, dan tanda tangan customer sudah benar. Setelah dikirim, layanan akan masuk proses selesai."
                    } else {
                        "Pastikan foto hasil dan catatan layanan sudah benar. Setelah dikirim, layanan akan masuk proses selesai."
                    },
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showCompleteConfirm = false
                        completionPhoto?.let { photo ->
                            val signatureBitmap = if (requiresSignature) {
                                signatureBitmapFromStrokes(signatureStrokes)
                            } else {
                                null
                            }
                            onComplete(
                                buildCompletionNotes(notes, true, signatureName, signatureBitmap != null),
                                photo,
                                signatureBitmap,
                                if (requiresSignature) {
                                    mapOf(
                                        "areas" to damageAreas.toList(),
                                        "severity" to damageSeverity,
                                        "safe_to_transport" to (damageSeverity != "major"),
                                        "notes" to damageNotes.trim()
                                    )
                                } else null
                            )
                        }
                    }
                ) {
                    Text("Konfirmasi", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showCompleteConfirm = false }) {
                    Text("Batal")
                }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Selesai", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CourierTextCatalog.translate("Kembali"))
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            Text(
                if (serviceType == "tambal_ban") "Foto Hasil Perbaikan" else "Foto Hasil & Serah Terima",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            )
            
            Spacer(Modifier.height(16.dp))

            CompletionPhotoCard(
                photo = completionPhoto,
                onCapture = {
                    if (hasCameraPermission) {
                        cameraLauncher.launch(null)
                    } else {
                        permissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                },
                onRetake = { cameraLauncher.launch(null) }
            )
            
            if (serviceType == "towing") {
                Spacer(Modifier.height(16.dp))

                Text(
                    "Serah terima customer",
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                
                Spacer(Modifier.height(16.dp))

                OutlinedTextField(
                    value = signatureName,
                    onValueChange = { signatureName = it },
                    label = { Text("Nama penerima/penandatangan") },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Nama customer atau penerima kendaraan") },
                    singleLine = true
                )

                Spacer(Modifier.height(16.dp))

                SignatureCard(
                    strokes = signatureStrokes,
                    onStrokesChange = { signatureStrokes = it },
                    onClear = { signatureStrokes = emptyList() }
                )

                Spacer(Modifier.height(16.dp))
                Text("Laporan kondisi kendaraan", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Text(
                    "Pilih area yang terlihat saat inspeksi. Ini disimpan sebagai laporan kondisi, bukan diagnosis kerusakan.",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                val damageOptions = listOf(
                    "front_bumper" to "Bumper depan",
                    "rear_bumper" to "Bumper belakang",
                    "left_door" to "Pintu kiri",
                    "right_door" to "Pintu kanan",
                    "wheels" to "Roda/ban",
                    "other" to "Bagian lain"
                )
                damageOptions.forEach { (code, label) ->
                    FilterChip(
                        selected = code in damageAreas,
                        onClick = { damageAreas = if (code in damageAreas) damageAreas - code else damageAreas + code },
                        label = { Text(label) },
                        modifier = Modifier.padding(end = 6.dp, bottom = 6.dp)
                    )
                }
                Text("Tingkat kondisi", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row {
                    listOf("none" to "Tidak ada", "minor" to "Ringan", "major" to "Berat").forEach { (code, label) ->
                        FilterChip(
                            selected = damageSeverity == code,
                            onClick = { damageSeverity = code },
                            label = { Text(label) },
                            modifier = Modifier.padding(end = 6.dp)
                        )
                    }
                }
                OutlinedTextField(
                    value = damageNotes,
                    onValueChange = { damageNotes = it },
                    label = { Text("Catatan kondisi") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                    placeholder = { Text("Contoh: gores terlihat di bumper depan") }
                )
            }

            Spacer(Modifier.height(16.dp))
            
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Catatan Layanan") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                placeholder = { Text("Durasi kerja, bahan digunakan, dll") }
            )
            
            Spacer(Modifier.height(24.dp))

            if (!canComplete) {
                val helperText = if (requiresSignature) {
                    "Ambil foto hasil, isi nama penerima, dan minta tanda tangan sebelum menyelesaikan layanan."
                } else {
                    "Ambil foto hasil layanan sebelum menyelesaikan."
                }
                Text(
                    helperText,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(Modifier.height(8.dp))
            }
            
            Button(
                onClick = { showCompleteConfirm = true },
                modifier = Modifier.fillMaxWidth(),
                enabled = canComplete,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Text("Selesaikan Layanan", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun SignatureCard(
    strokes: List<List<Offset>>,
    onStrokesChange: (List<List<Offset>>) -> Unit,
    onClear: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                "Tanda tangan customer",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                "Minta penerima tanda tangan di area bawah.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(12.dp))

            SignaturePad(
                strokes = strokes,
                onStrokesChange = onStrokesChange
            )

            Spacer(Modifier.height(12.dp))

            OutlinedButton(
                onClick = onClear,
                modifier = Modifier.fillMaxWidth(),
                enabled = strokes.any { it.isNotEmpty() }
            ) {
                Text("Hapus Tanda Tangan")
            }
        }
    }
}

@Composable
private fun SignaturePad(
    strokes: List<List<Offset>>,
    onStrokesChange: (List<List<Offset>>) -> Unit
) {
    var canvasSize by remember { mutableStateOf(IntSize.Zero) }
    var activeStroke by remember { mutableStateOf<List<Offset>>(emptyList()) }
    val inkColor = MaterialTheme.colorScheme.onSurface
    val displayStrokes = if (activeStroke.isEmpty()) strokes else strokes + listOf(activeStroke)

    fun normalize(offset: Offset): Offset {
        val width = canvasSize.width.coerceAtLeast(1).toFloat()
        val height = canvasSize.height.coerceAtLeast(1).toFloat()
        return Offset(
            x = (offset.x / width).coerceIn(0f, 1f),
            y = (offset.y / height).coerceIn(0f, 1f)
        )
    }

    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(180.dp)
            .background(MaterialTheme.colorScheme.surface, MaterialTheme.shapes.small)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.small)
            .onSizeChanged { canvasSize = it }
            .pointerInput(canvasSize, strokes) {
                detectDragGestures(
                    onDragStart = { offset ->
                        activeStroke = listOf(normalize(offset))
                    },
                    onDrag = { change, _ ->
                        activeStroke = activeStroke + normalize(change.position)
                        change.consume()
                    },
                    onDragEnd = {
                        if (activeStroke.size > 1) {
                            onStrokesChange(strokes + listOf(activeStroke))
                        }
                        activeStroke = emptyList()
                    },
                    onDragCancel = {
                        activeStroke = emptyList()
                    }
                )
            }
    ) {
        displayStrokes.forEach { stroke ->
            if (stroke.size > 1) {
                val path = Path().apply {
                    moveTo(stroke.first().x * size.width, stroke.first().y * size.height)
                    stroke.drop(1).forEach { point ->
                        lineTo(point.x * size.width, point.y * size.height)
                    }
                }
                drawPath(
                    path = path,
                    color = inkColor,
                    style = Stroke(
                        width = 4.dp.toPx(),
                        cap = StrokeCap.Round,
                        join = StrokeJoin.Round
                    )
                )
            }
        }
    }
}

@Composable
private fun CompletionPhotoCard(
    photo: Bitmap?,
    onCapture: () -> Unit,
    onRetake: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            if (photo != null) {
                Image(
                    bitmap = photo.asImageBitmap(),
                    contentDescription = CourierTextCatalog.translate("Foto hasil layanan"),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(220.dp),
                    contentScale = ContentScale.Crop
                )

                Spacer(Modifier.height(12.dp))

                Text(
                    "Foto hasil layanan sudah diambil.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(Modifier.height(12.dp))

                OutlinedButton(
                    onClick = onRetake,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.CameraAlt, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text("Ambil Ulang Foto")
                }
            } else {
                Text(
                    "Bukti foto hasil layanan",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "Ambil foto kondisi akhir sebelum layanan ditutup.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(Modifier.height(12.dp))

                Button(
                    onClick = onCapture,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.CameraAlt, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text("Ambil Foto Hasil")
                }
            }
        }
    }
}

private fun buildCompletionNotes(
    notes: String,
    completionPhotoCaptured: Boolean,
    signatureName: String,
    signatureCaptured: Boolean
): String {
    val evidenceLines = buildList {
        if (completionPhotoCaptured) add("Foto completion diambil di aplikasi kurir.")
        signatureName.trim().takeIf { it.isNotBlank() }?.let { add("Serah terima oleh: $it.") }
        if (signatureCaptured) add("Tanda tangan digital tersimpan.")
    }
    if (evidenceLines.isEmpty()) return notes
    return (listOf(notes.trim()).filter { it.isNotBlank() } + evidenceLines).joinToString("\n")
}

private fun signatureBitmapFromStrokes(
    strokes: List<List<Offset>>,
    width: Int = 900,
    height: Int = 360
): Bitmap {
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(bitmap)
    canvas.drawColor(AndroidColor.WHITE)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = AndroidColor.BLACK
        style = Paint.Style.STROKE
        strokeWidth = 6f
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    strokes.forEach { stroke ->
        if (stroke.size > 1) {
            for (index in 1 until stroke.size) {
                val from = stroke[index - 1]
                val to = stroke[index]
                canvas.drawLine(
                    from.x * width,
                    from.y * height,
                    to.x * width,
                    to.y * height,
                    paint
                )
            }
        }
    }
    return bitmap
}
