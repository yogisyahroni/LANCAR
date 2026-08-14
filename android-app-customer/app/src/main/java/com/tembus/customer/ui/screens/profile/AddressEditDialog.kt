package com.tembus.customer.ui.screens.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.data.model.CustomerAddress
import com.tembus.customer.data.model.CustomerAddressRequest
import com.tembus.customer.data.model.LocationPayload

// C5: Dialog tambah/edit alamat
@Composable
fun AddressEditDialog(
    address: CustomerAddress?,
    onDismiss: () -> Unit,
    onSave: (CustomerAddressRequest) -> Unit
) {
    var label by remember { mutableStateOf(address?.label ?: "") }
    var contactName by remember { mutableStateOf(address?.contactName ?: "") }
    var contactPhone by remember { mutableStateOf("") }
    var street by remember { mutableStateOf(address?.address ?: "") }
    var notes by remember { mutableStateOf(address?.notes ?: "") }
    var isFavorite by remember { mutableStateOf(address?.isFavorite ?: false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (address == null) "Tambah Alamat" else "Edit Alamat", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = label,
                    onValueChange = { label = it },
                    label = { Text("Label (Rumah/Kantor/dll)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = contactName,
                    onValueChange = { contactName = it },
                    label = { Text("Nama Kontak (opsional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = contactPhone,
                    onValueChange = { contactPhone = it },
                    label = { Text("No. HP (opsional)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = street,
                    onValueChange = { street = it },
                    label = { Text("Alamat Lengkap") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2
                )
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Catatan (patokan, dll)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = isFavorite, onCheckedChange = { isFavorite = it })
                    Text("Jadikan alamat favorit", fontSize = 13.sp)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSave(
                        CustomerAddressRequest(
                            label = label,
                            contactName = contactName.ifBlank { null },
                            contactPhone = contactPhone.ifBlank { null },
                            address = street,
                            location = LocationPayload(
                                address?.lat ?: -6.2088,
                                address?.lng ?: 106.8456
                            ),
                            notes = notes.ifBlank { null },
                            kind = "receiver",
                            isFavorite = isFavorite
                        )
                    )
                },
                enabled = label.isNotBlank() && street.isNotBlank()
            ) {
                Text("Simpan", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Batal") }
        }
    )
}
