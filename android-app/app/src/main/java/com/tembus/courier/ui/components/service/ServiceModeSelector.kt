package com.tembus.courier.ui.components.service

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.TwoWheeler
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import com.tembus.courier.ui.localization.CourierText as Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ============================================================
// SERVICE MODE SELECTOR — Multi-mode switcher
// ============================================================

data class ServiceMode(
    val code: String,
    val name: String,
    val icon: ImageVector,
    val description: String
)

@Composable
fun ServiceModeSelector(
    availableModes: List<ServiceMode>,
    currentMode: String,
    onModeSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        Text(
            "Pilih Mode Layanan",
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )
        
        Spacer(Modifier.height(12.dp))
        
        availableModes.forEach { mode ->
            val isSelected = mode.code == currentMode
            
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp)
                    .clickable { onModeSelected(mode.code) },
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (isSelected) 
                        MaterialTheme.colorScheme.primaryContainer 
                    else 
                        MaterialTheme.colorScheme.surface
                ),
                elevation = CardDefaults.cardElevation(
                    defaultElevation = if (isSelected) 4.dp else 1.dp
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        mode.icon,
                        contentDescription = null,
                        modifier = Modifier.size(32.dp),
                        tint = if (isSelected) 
                            MaterialTheme.colorScheme.primary 
                        else 
                            MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    
                    Spacer(Modifier.width(16.dp))
                    
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            mode.name,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            mode.description,
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    
                    if (isSelected) {
                        Text(
                            "Aktif",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        }
    }
}

// Default service modes
val defaultServiceModes = listOf(
    ServiceMode(
        code = "on_demand",
        name = "Antar Barang",
        icon = Icons.Default.LocalShipping,
        description = "Pengiriman paket on-demand"
    ),
    ServiceMode(
        code = "tambal_ban_motor",
        name = "Tambal Ban Motor",
        icon = Icons.Default.TwoWheeler,
        description = "Perbaikan ban sepeda motor"
    ),
    ServiceMode(
        code = "tambal_ban_mobil",
        name = "Tambal Ban Mobil",
        icon = Icons.Default.Build,
        description = "Perbaikan ban kendaraan roda empat"
    ),
    ServiceMode(
        code = "towing_motor",
        name = "Towing Motor",
        icon = Icons.Default.LocalShipping,
        description = "Derek sepeda motor"
    ),
    ServiceMode(
        code = "towing_mobil",
        name = "Towing Mobil",
        icon = Icons.Default.DirectionsCar,
        description = "Derek kendaraan roda empat"
    )
)
