package com.tembus.merchant.ui.screens.home

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import com.tembus.merchant.ui.localization.MerchantText as Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.tembus.merchant.ui.theme.TembusComponentDefaults
import com.tembus.merchant.ui.theme.TembusRadius

// M5: Dialog edit jam operasional (buka/tutup) merchant
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OperatingHoursDialog(
    currentBuka: String?,
    currentTutup: String?,
    onDismiss: () -> Unit,
    onSave: (buka: String, tutup: String) -> Unit
) {
    val bukaParts = (currentBuka ?: "08:00").split(":")
    val tutupParts = (currentTutup ?: "20:00").split(":")

    var bukaState by remember { mutableStateOf(TimePickerState(bukaParts.getOrNull(0)?.toIntOrNull() ?: 8, bukaParts.getOrNull(1)?.toIntOrNull() ?: 0, is24Hour = true)) }
    var tutupState by remember { mutableStateOf(TimePickerState(tutupParts.getOrNull(0)?.toIntOrNull() ?: 20, tutupParts.getOrNull(1)?.toIntOrNull() ?: 0, is24Hour = true)) }
    var error by remember { mutableStateOf<String?>(null) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            shape = TembusComponentDefaults.cardShape(),
            colors = TembusComponentDefaults.cardColors()
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text("Jam Operasional", fontSize = 20.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Spacer(Modifier.height(4.dp))
                Text("Toko akan otomatis buka & tutup sesuai jam ini.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(16.dp))

                Text("Jam Buka", fontSize = 14.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                Spacer(Modifier.height(4.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = TembusComponentDefaults.cardShape(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    TimeInput(state = bukaState, modifier = Modifier.fillMaxWidth())
                }
                Spacer(Modifier.height(12.dp))

                Text("Jam Tutup", fontSize = 14.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                Spacer(Modifier.height(4.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = TembusComponentDefaults.cardShape(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    TimeInput(state = tutupState, modifier = Modifier.fillMaxWidth())
                }

                error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                }

                Spacer(Modifier.height(16.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) {
                        Text("Batal", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = {
                            val buka = String.format("%02d:%02d", bukaState.hour, bukaState.minute)
                            val tutup = String.format("%02d:%02d", tutupState.hour, tutupState.minute)
                            if (buka == tutup) {
                                error = "Jam buka dan tutup tidak boleh sama"
                                return@Button
                            }
                            onSave(buka, tutup)
                        },
                        colors = TembusComponentDefaults.primaryButtonColors(),
                        shape = TembusComponentDefaults.buttonShape()
                    ) {
                        Text("Simpan")
                    }
                }
            }
        }
    }
}
