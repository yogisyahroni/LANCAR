package com.tembus.merchant.ui.screens.home

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.tembus.merchant.ui.theme.Primary

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
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text("Jam Operasional", fontSize = 20.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = Primary)
                Spacer(Modifier.height(4.dp))
                Text("Toko akan otomatis buka & tutup sesuai jam ini.", fontSize = 13.sp, color = Color(0xFF64748B))
                Spacer(Modifier.height(16.dp))

                Text("Jam Buka", fontSize = 14.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, color = Color(0xFF0F172A))
                Spacer(Modifier.height(4.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F5F9))
                ) {
                    TimePicker(state = bukaState, modifier = Modifier.fillMaxWidth())
                }
                Spacer(Modifier.height(12.dp))

                Text("Jam Tutup", fontSize = 14.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, color = Color(0xFF0F172A))
                Spacer(Modifier.height(4.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F5F9))
                ) {
                    TimePicker(state = tutupState, modifier = Modifier.fillMaxWidth())
                }

                error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, fontSize = 12.sp, color = Color(0xFFEF4444))
                }

                Spacer(Modifier.height(16.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) {
                        Text("Batal", color = Color(0xFF64748B))
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
                        colors = ButtonDefaults.buttonColors(containerColor = Primary),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Simpan", color = Color.White)
                    }
                }
            }
        }
    }
}
