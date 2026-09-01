package com.tembus.customer.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import com.tembus.customer.ui.localization.CustomerText as Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VehicleDetailInput(
    serviceSubType: String,
    vehicleType: String,
    onVehicleTypeChange: (String) -> Unit,
    damageType: String,
    onDamageTypeChange: (String) -> Unit,
    vehicleMake: String,
    onVehicleMakeChange: (String) -> Unit,
    vehicleModel: String,
    onVehicleModelChange: (String) -> Unit,
    vehicleCondition: String,
    onVehicleConditionChange: (String) -> Unit,
    accessConstraints: String,
    onAccessConstraintsChange: (String) -> Unit,
    notes: String,
    onNotesChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val isMotor = serviceSubType.contains("motor")
    val isTambalBan = serviceSubType.startsWith("tambal_ban")
    
    val vehicleTypes = if (isMotor) {
        listOf("Bebek", "Matic", "Sport")
    } else {
        listOf("Sedan", "MPV", "SUV")
    }
    
    val damageTypes = if (isTambalBan) {
        listOf("Ban Bocor", "Ban Pecah", "Ban Aus", "Kendala Lainnya")
    } else {
        listOf("Mesin Mati", "Kelistrikan", "Kecelakaan", "Kendala Lainnya")
    }
    val conditions = listOf("Bisa berjalan", "Tidak bisa berjalan", "Rusak berat", "Kondisi tidak diketahui")
    
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                "Detail Kendaraan",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            
            Spacer(Modifier.height(16.dp))
            
            // Vehicle type dropdown
            var expanded by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(
                expanded = expanded,
                onExpandedChange = { expanded = it }
            ) {
                TextField(
                    value = vehicleType,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Tipe Kendaraan") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                )
                
                ExposedDropdownMenu(
                    expanded = expanded,
                    onDismissRequest = { expanded = false }
                ) {
                    vehicleTypes.forEach { type ->
                        DropdownMenuItem(
                            text = { Text(type) },
                            onClick = {
                                onVehicleTypeChange(type)
                                expanded = false
                            }
                        )
                    }
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // Damage type dropdown
            var expandedDamage by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(
                expanded = expandedDamage,
                onExpandedChange = { expandedDamage = it }
            ) {
                TextField(
                    value = damageType,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(if (isTambalBan) "Jenis Kerusakan" else "Jenis Kendala") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedDamage) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                )
                
                ExposedDropdownMenu(
                    expanded = expandedDamage,
                    onDismissRequest = { expandedDamage = false }
                ) {
                    damageTypes.forEach { type ->
                        DropdownMenuItem(
                            text = { Text(type) },
                            onClick = {
                                onDamageTypeChange(type)
                                expandedDamage = false
                            }
                        )
                    }
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            OutlinedTextField(
                value = vehicleMake,
                onValueChange = onVehicleMakeChange,
                label = { Text("Merek kendaraan") },
                placeholder = { Text("Contoh: Toyota") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = vehicleModel,
                onValueChange = onVehicleModelChange,
                label = { Text("Model kendaraan") },
                placeholder = { Text("Contoh: Avanza 2019") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Spacer(Modifier.height(12.dp))

            var expandedCondition by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(
                expanded = expandedCondition,
                onExpandedChange = { expandedCondition = it }
            ) {
                TextField(
                    value = vehicleCondition,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Kondisi kendaraan") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedCondition) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                )
                ExposedDropdownMenu(
                    expanded = expandedCondition,
                    onDismissRequest = { expandedCondition = false }
                ) {
                    conditions.forEach { condition ->
                        DropdownMenuItem(
                            text = { Text(condition) },
                            onClick = {
                                onVehicleConditionChange(condition)
                                expandedCondition = false
                            }
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = accessConstraints,
                onValueChange = onAccessConstraintsChange,
                label = { Text("Akses dan kendala lokasi") },
                placeholder = { Text("Contoh: gang sempit, perlu akses derek dari jalan utama") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 3
            )

            Spacer(Modifier.height(16.dp))

            // Notes
            OutlinedTextField(
                value = notes,
                onValueChange = onNotesChange,
                label = { Text("Catatan (opsional)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3
            )
        }
    }
}
