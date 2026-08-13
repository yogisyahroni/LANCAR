package com.tembus.customer.ui.screens.detail

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
import coil.compose.rememberAsyncImagePainter

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

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            imageUri = it
            mimeType = context.contentResolver.getType(it) ?: "image/jpeg"
            val inputStream = context.contentResolver.openInputStream(it)
            imageBytes = inputStream?.readBytes()
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Laporkan Masalah", fontWeight = FontWeight.Bold)
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Tutup")
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

                Button(onClick = { imagePicker.launch("image/*") }) {
                    Text(if (imageUri != null) "Ganti Foto" else "Pilih Foto")
                }

                imageUri?.let {
                    Image(
                        painter = rememberAsyncImagePainter(it),
                        contentDescription = "Preview",
                        modifier = Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(8.dp)),
                        contentScale = ContentScale.Crop
                    )
                }

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
