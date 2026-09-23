package com.tembus.courier.ui.screens.service

import coil.compose.AsyncImage
import com.tembus.courier.BuildConfig
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tembus.courier.data.model.RoadsideVehicleDetails

@Composable
fun RoadsideVehicleVerificationCard(
    customerVehicle: RoadsideVehicleDetails?,
    observedType: String,
    observedMake: String,
    observedModel: String,
    observedPlate: String,
    notes: String,
    matched: Boolean,
    onObservedTypeChange: (String) -> Unit,
    onObservedMakeChange: (String) -> Unit,
    onObservedModelChange: (String) -> Unit,
    onObservedPlateChange: (String) -> Unit,
    onNotesChange: (String) -> Unit,
    onMatchedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.DirectionsCar, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Column(modifier = Modifier.padding(start = 10.dp)) {
                    Text("Verifikasi kendaraan customer", fontWeight = FontWeight.Bold)
                    Text(
                        "Cocokkan kendaraan di lokasi dengan data order dari database.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (customerVehicle == null) {
                Text(
                    "Data kendaraan customer belum tersedia dari order. Jangan mulai layanan sebelum data tersinkron.",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            } else {
                Text("Data customer", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                VehicleValue("Jenis", customerVehicle.type)
                VehicleValue("Merek / model", listOf(customerVehicle.make, customerVehicle.model).filter(String::isNotBlank).joinToString(" "))
                VehicleValue("Kondisi", customerVehicle.condition)
                VehicleValue("Kondisi towing", customerVehicle.towingConditions.joinToString(" • "))
                VehicleValue("Akses / evakuasi", customerVehicle.accessConstraints)
                VehicleValue("Kerusakan", customerVehicle.damage)
                VehicleValue("Catatan customer", customerVehicle.notes)
                if (customerVehicle.photoUrls.isNotEmpty() || customerVehicle.photoItems.isNotEmpty()) {
                    val photoUrl = customerVehicle.photoItems.firstOrNull()?.url?.takeIf { it.isNotBlank() }
                        ?: customerVehicle.photoUrls.firstOrNull().orEmpty()
                    AsyncImage(
                        model = if (photoUrl.startsWith("http")) photoUrl else "${BuildConfig.BASE_URL.trimEnd('/')}/${photoUrl.trimStart('/')}",
                        contentDescription = "Foto kendaraan dari customer",
                        modifier = Modifier.fillMaxWidth().height(150.dp),
                        contentScale = ContentScale.Crop
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CameraAlt, contentDescription = null, modifier = Modifier.size(16.dp))
                        Text(
                            "${maxOf(customerVehicle.photoUrls.size, customerVehicle.photoItems.size)} foto customer tersimpan di server",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(start = 6.dp)
                        )
                    }
                }
            }

            Text("Yang terlihat di lokasi", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            OutlinedTextField(observedType, onObservedTypeChange, label = { Text("Jenis kendaraan") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(observedMake, onObservedMakeChange, label = { Text("Merek") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(observedModel, onObservedModelChange, label = { Text("Model") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(observedPlate, onObservedPlateChange, label = { Text("Nomor polisi (opsional)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(notes, onNotesChange, label = { Text("Catatan pemeriksaan (opsional)") }, modifier = Modifier.fillMaxWidth(), minLines = 2)

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = matched, onCheckedChange = onMatchedChange)
                Text("Kendaraan yang datang sesuai dengan detail customer")
            }
            if (!matched) {
                Text(
                    "Centang setelah cocok. Foto kondisi awal diambil dari kamera pada kartu berikutnya dan dikirim sebagai bukti server.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Text("Siap dikirim bersama foto kamera", modifier = Modifier.padding(start = 6.dp), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun VehicleValue(label: String, value: String) {
    if (value.isBlank()) return
    Row(modifier = Modifier.fillMaxWidth()) {
        Text("$label: ", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall)
        Text(value, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
