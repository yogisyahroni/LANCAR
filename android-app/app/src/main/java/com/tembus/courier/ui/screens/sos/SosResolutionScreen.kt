package com.tembus.courier.ui.screens.sos

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.*
import com.tembus.courier.ui.localization.CourierText as Text
import com.tembus.courier.ui.localization.CourierTextCatalog
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SosResolutionScreen(
    onSubmit: (verdict: String, photoUrl: String) -> Unit
) {
    var selectedVerdict by remember { mutableStateOf("") }
    var proofBitmap by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
    val cameraLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.TakePicturePreview()
    ) { bitmap ->
        if (bitmap != null) proofBitmap = bitmap
    }

    val verdicts = listOf(
        "ACCIDENT" to "Kecelakaan / Medis",
        "CRIME" to "Kriminalitas / Begal",
        "BREAKDOWN" to "Kendala Teknis / Mogok",
        "PRANK" to "Laporan Palsu / Prank"
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Laporan Situasi SOS") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Pilih Situasi di Lapangan",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            verdicts.forEach { (code, label) ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    RadioButton(
                        selected = selectedVerdict == code,
                        onClick = { selectedVerdict = code },
                        colors = RadioButtonDefaults.colors(
                            selectedColor = if (code == "PRANK") Color.Red else MaterialTheme.colorScheme.primary
                        )
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = label,
                        color = if (code == "PRANK" && selectedVerdict == code) Color.Red else MaterialTheme.colorScheme.onSurface
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Bukti Foto",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            OutlinedCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(150.dp),
                onClick = { cameraLauncher.launch(null) }
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    if (proofBitmap != null) {
                        Text("✅ Foto berhasil diambil", color = Color(0xFF4CAF50))
                    } else {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.CameraAlt, contentDescription = CourierTextCatalog.translate("Kamera"))
                            Spacer(Modifier.height(8.dp))
                            Text("Ketuk untuk mengambil foto dari Kamera")
                        }
                    }
                }
            }

            if (selectedVerdict == "PRANK") {
                Text(
                    text = "⚠️ PERINGATAN: Memilih Laporan Palsu akan memberikan penalti denda Rp 100.000 kepada pembuat laporan.",
                    color = Color.Red,
                    style = MaterialTheme.typography.bodySmall
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            Button(
                onClick = { onSubmit(selectedVerdict, "content://media/external/images/sos_resolution_proof.jpg") },
                modifier = Modifier.fillMaxWidth(),
                enabled = selectedVerdict.isNotEmpty() && proofBitmap != null
            ) {
                Text("Kirim Laporan & Selesai")
            }
        }
    }
}
