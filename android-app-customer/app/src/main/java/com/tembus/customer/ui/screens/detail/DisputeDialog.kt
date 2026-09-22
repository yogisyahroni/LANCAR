package com.tembus.customer.ui.screens.detail

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import coil.compose.rememberAsyncImagePainter
import com.tembus.customer.ui.a11y.criticalAction
import com.tembus.customer.ui.components.createCameraCaptureUri

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DisputeDialog(
    onDismiss: () -> Unit,
    onSubmit: (type: String, description: String, evidenceBytes: ByteArray?, evidenceMimeType: String?) -> Unit,
    submitState: DisputeSubmitState,
    isFood: Boolean = false
) {
    val context = LocalContext.current
    var type by remember { mutableStateOf(if (isFood) "makanan_tidak_sesuai" else "lost_item") }
    var description by remember { mutableStateOf("") }
    var imageUri by remember { mutableStateOf<Uri?>(null) }
    var imageBytes by remember { mutableStateOf<ByteArray?>(null) }
    var mimeType by remember { mutableStateOf<String?>(null) }
    var agreed by remember { mutableStateOf(false) }
    var pendingCameraUri by remember { mutableStateOf<Uri?>(null) }
    var cameraError by remember { mutableStateOf<String?>(null) }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { captured ->
        val uri = pendingCameraUri
        pendingCameraUri = null
        if (captured && uri != null) {
            imageUri = uri
            mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"
            imageBytes = context.contentResolver.openInputStream(uri)?.use { inputStream -> inputStream.readBytes() }
            cameraError = null
        } else if (uri != null) {
            context.contentResolver.delete(uri, null, null)
            cameraError = "Foto belum tersimpan. Coba ambil ulang dari kamera."
        }
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            val uri = createCameraCaptureUri(context, "tembus-dispute")
            if (uri == null) {
                cameraError = "Kamera belum dapat disiapkan. Coba lagi."
            } else {
                pendingCameraUri = uri
                cameraLauncher.launch(uri)
            }
        } else {
            cameraError = "Izin kamera diperlukan untuk mengambil bukti foto."
        }
    }

    fun launchCamera() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            val uri = createCameraCaptureUri(context, "tembus-dispute")
            if (uri == null) {
                cameraError = "Kamera belum dapat disiapkan. Coba lagi."
            } else {
                pendingCameraUri = uri
                cameraLauncher.launch(uri)
            }
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Laporkan Masalah", fontWeight = FontWeight.Bold)
                IconButton(onClick = onDismiss, modifier = Modifier.criticalAction("Tutup laporan masalah")) {
                    Icon(Icons.Default.Close, contentDescription = CustomerTextCatalog.translate("Tutup"))
                }
            }
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Kategori Masalah", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                val categories = if (isFood) {
                    listOf(
                        "makanan_tidak_sesuai" to "Makanan Tidak Sesuai",
                        "kurang_item" to "Item Kurang/Hilang",
                        "kualitas_buruk" to "Makanan Basi/Rusak",
                        "terlalu_dingin" to "Terlalu Dingin",
                        "other" to "Lainnya"
                    )
                } else {
                    listOf("lost_item" to "Barang Hilang", "damaged" to "Barang Rusak", "other" to "Lainnya")
                }
                categories.forEach { (key, label) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = type == key, onClick = { type = key })
                        Text(label, modifier = Modifier.clickable { type = key })
                    }
                }

                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("Penjelasan / Ciri Barang") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3
                )

                if (type == "lost_item" || isFood) {
                    Text("Bukti Foto (Wajib)", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = MaterialTheme.colorScheme.error)
                } else {
                    Text("Upload Bukti Foto", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }

                Button(onClick = { launchCamera() }, modifier = Modifier.criticalAction("Ambil bukti foto dengan kamera")) {
                    Text(if (imageUri != null) "Ambil Ulang Foto" else "Ambil Foto")
                }

                imageUri?.let {
                    Image(
                        painter = rememberAsyncImagePainter(it),
                        contentDescription = CustomerTextCatalog.translate("Preview"),
                        modifier = Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(8.dp)),
                        contentScale = ContentScale.Crop
                    )
                }

                cameraError?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }

                if (type == "lost_item") {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().background(Color(0xFFFFF3E0), RoundedCornerShape(8.dp)).padding(8.dp)) {
                        Checkbox(checked = agreed, onCheckedChange = { agreed = it })
                        Text(
                            "Saya menyetujui S&K ganti rugi: Nilai invoice maks atau 10x ongkir (pilih terendah) bila tidak menggunakan Asuransi.",
                            fontSize = 12.sp, color = Color.DarkGray
                        )
                    }
                }
                
                if (submitState is DisputeSubmitState.Error) {
                    Text(submitState.message, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                }
            }
        },
        confirmButton = {
            // Food: bukti foto wajib (backend menolak food category tanpa evidence).
            val evidenceRequired = type == "lost_item" || isFood
            val isButtonEnabled = description.isNotBlank() && submitState !is DisputeSubmitState.Loading && (!evidenceRequired || (imageBytes != null && (type != "lost_item" || agreed)))
            Button(
                onClick = { onSubmit(type, description, imageBytes, mimeType) },
                enabled = isButtonEnabled,
                modifier = Modifier.criticalAction("Kirim laporan masalah"),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
            ) {
                if (submitState is DisputeSubmitState.Loading) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Color.White)
                } else {
                    Text("Kirim Laporan")
                }
            }
        }
    )
}
