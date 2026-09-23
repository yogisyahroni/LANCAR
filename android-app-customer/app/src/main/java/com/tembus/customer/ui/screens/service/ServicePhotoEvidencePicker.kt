package com.tembus.customer.ui.screens.service

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import com.tembus.customer.ui.localization.CustomerText as Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.SavedStateHandle
import coil.compose.AsyncImage
import com.tembus.customer.ui.components.createCameraCaptureUri
import com.tembus.customer.ui.theme.OrangeCta
import com.tembus.customer.ui.theme.PrimarySoft

private const val MAX_SERVICE_PHOTOS = 3
const val SERVICE_PHOTO_URIS_KEY = "service_photo_uris"
const val SERVICE_PHOTO_MIME_TYPES_KEY = "service_photo_mime_types"
const val SERVICE_DAMAGE_TYPE_KEY = "service_damage_type"
const val SERVICE_NOTES_KEY = "service_notes"

data class LocalServicePhoto(
    val uri: Uri,
    val mimeType: String,
)

data class ServiceRequestDraft(
    val damageType: String = "",
    val notes: String = "",
)

fun stageServicePhotos(handle: SavedStateHandle?, photos: List<LocalServicePhoto>) {
    if (handle == null) return
    handle[SERVICE_PHOTO_URIS_KEY] = ArrayList(photos.map { it.uri.toString() })
    handle[SERVICE_PHOTO_MIME_TYPES_KEY] = ArrayList(photos.map { it.mimeType })
}

fun restoreServicePhotos(handle: SavedStateHandle?): List<LocalServicePhoto> {
    if (handle == null) return emptyList()

    fun readStrings(key: String): List<String> = when (val value = handle.get<Any>(key)) {
        is List<*> -> value.filterIsInstance<String>()
        else -> emptyList()
    }

    val uris = readStrings(SERVICE_PHOTO_URIS_KEY)
    val mimeTypes = readStrings(SERVICE_PHOTO_MIME_TYPES_KEY)
    return uris.mapIndexed { index, uri ->
        LocalServicePhoto(Uri.parse(uri), mimeTypes.getOrNull(index) ?: "image/jpeg")
    }
}

fun stageServiceRequestDraft(handle: SavedStateHandle?, damageType: String, notes: String) {
    if (handle == null) return
    handle[SERVICE_DAMAGE_TYPE_KEY] = damageType
    handle[SERVICE_NOTES_KEY] = notes
}

fun restoreServiceRequestDraft(handle: SavedStateHandle?): ServiceRequestDraft {
    if (handle == null) return ServiceRequestDraft()
    return ServiceRequestDraft(
        damageType = handle.get<String>(SERVICE_DAMAGE_TYPE_KEY).orEmpty(),
        notes = handle.get<String>(SERVICE_NOTES_KEY).orEmpty(),
    )
}

@Composable
fun ServicePhotoEvidencePicker(
    isTowing: Boolean,
    photos: List<LocalServicePhoto>,
    onPhotosChanged: (List<LocalServicePhoto>) -> Unit,
    notes: String = "",
    onNotesChanged: (String) -> Unit = {},
    showNotes: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var pendingCameraUri by remember { mutableStateOf<Uri?>(null) }
    var cameraError by remember { mutableStateOf<String?>(null) }

    fun addUris(uris: List<Uri>) {
        val remaining = MAX_SERVICE_PHOTOS - photos.size
        if (remaining <= 0) return
        val additions = uris
            .filterNot { uri -> photos.any { it.uri == uri } }
            .take(remaining)
            .map { uri -> LocalServicePhoto(uri, context.contentResolver.getType(uri) ?: "image/jpeg") }
        if (additions.isNotEmpty()) onPhotosChanged(photos + additions)
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { captured ->
        val uri = pendingCameraUri
        pendingCameraUri = null
        if (captured && uri != null) {
            addUris(listOf(uri))
            cameraError = null
        } else if (uri != null) {
            context.contentResolver.delete(uri, null, null)
            cameraError = "Foto dari kamera belum tersimpan. Coba lagi."
        }
    }

    fun launchCamera() {
        val uri = createCameraCaptureUri(context, "tembus-roadside")
        if (uri == null) {
            cameraError = "Kamera belum dapat disiapkan. Coba lagi."
            return
        }
        pendingCameraUri = uri
        cameraLauncher.launch(uri)
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) launchCamera() else cameraError = "Izin kamera diperlukan untuk mengambil foto kondisi kendaraan."
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                if (showNotes) "Foto Kondisi & Catatan (Opsional)"
                else if (isTowing) "Foto kondisi kendaraan" else "Foto kondisi ban",
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                if (isTowing) {
                    "Tambahkan foto kendaraan dari beberapa sudut agar petugas menyiapkan armada yang tepat."
                } else {
                    "Tambahkan foto ban dan area sekitar agar montir memahami kondisi sebelum datang."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (photos.isNotEmpty()) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(photos, key = { it.uri.toString() }) { photo ->
                        Box(Modifier.size(92.dp)) {
                            AsyncImage(
                                model = photo.uri,
                                contentDescription = "Foto kondisi layanan",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(92.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    .border(1.dp, PrimarySoft, RoundedCornerShape(14.dp)),
                            )
                            IconButton(
                                onClick = { onPhotosChanged(photos.filterNot { it.uri == photo.uri }) },
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .size(28.dp)
                                    .background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.65f), RoundedCornerShape(14.dp)),
                            ) {
                                Icon(Icons.Default.Close, contentDescription = "Hapus foto", tint = MaterialTheme.colorScheme.onPrimary)
                            }
                        }
                    }
                }
            }

            if (showNotes) {
                OutlinedTextField(
                    value = notes,
                    onValueChange = onNotesChanged,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Catatan (opsional)") },
                    placeholder = { Text("Contoh: ban depan kiri terkena paku") },
                    minLines = 2,
                    maxLines = 3,
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(
                    onClick = {
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                            launchCamera()
                        } else {
                            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                        }
                    },
                    enabled = photos.size < MAX_SERVICE_PHOTOS,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.CameraAlt, contentDescription = null)
                    Spacer(Modifier.size(6.dp))
                    Text("Kamera")
                }
            }
            Text(
                "${photos.size}/$MAX_SERVICE_PHOTOS foto diambil dari kamera · format JPG · maksimal 5 MB per foto",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            cameraError?.let { message ->
                Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                TextButton(onClick = { cameraError = null }) { Text("Tutup") }
            }
        }
    }
}

fun prepareServicePhotoUploads(
    context: Context,
    photos: List<LocalServicePhoto>,
    photoRole: String,
): Result<List<ServicePhotoUploadPayload>> {
    return runCatching {
        photos.mapIndexed { index, photo ->
            val bytes = context.contentResolver.openInputStream(photo.uri)?.use { input -> input.readBytes() }
                ?: error("Foto ke-${index + 1} tidak dapat dibaca")
            if (bytes.isEmpty()) error("Foto ke-${index + 1} kosong")
            if (bytes.size > 5 * 1024 * 1024) error("Foto ke-${index + 1} melebihi batas 5 MB")
            ServicePhotoUploadPayload(
                photoRole = photoRole,
                bytes = bytes,
                mimeType = photo.mimeType,
                fileName = "roadside-${photoRole}-${index + 1}",
            )
        }
    }
}
