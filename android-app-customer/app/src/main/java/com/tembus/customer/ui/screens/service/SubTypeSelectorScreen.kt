package com.tembus.customer.ui.screens.service

import androidx.compose.foundation.clickable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.TwoWheeler
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.ui.theme.TembusRadius

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SubTypeSelectorScreen(
    category: String,
    onBackClick: () -> Unit,
    onSubTypeSelected: (String) -> Unit
) {
    val isTambalBan = category == "tambal_ban"
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        if (isTambalBan) "Pilih Jenis Kendaraan" else "Pilih Jenis Towing",
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"))
                    }
                }
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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Motor
                SubTypeCard(
                    icon = Icons.Default.TwoWheeler,
                    title = "Motor",
                    subtitle = if (isTambalBan) "Bebek/Matic/Sport" else "Angkut pakai Pickup/Van",
                    priceRange = if (isTambalBan) "Harga mulai Rp 25.000" else "Harga mulai Rp 50.000",
                    color = MaterialTheme.colorScheme.primaryContainer,
                    onClick = { onSubTypeSelected("${category}_motor") },
                    modifier = Modifier.weight(1f)
                )
                
                // Mobil
                SubTypeCard(
                    icon = Icons.Default.DirectionsCar,
                    title = "Mobil",
                    subtitle = if (isTambalBan) "Sedan/MPV/SUV" else "Angkut pakai Towing Truck",
                    priceRange = if (isTambalBan) "Harga mulai Rp 45.000" else "Harga mulai Rp 75.000",
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    onClick = { onSubTypeSelected("${category}_mobil") },
                    modifier = Modifier.weight(1f)
                )
            }
            
            Spacer(Modifier.height(16.dp))
            
            Text(
                "Catatan: harga jasa ditentukan oleh masing-masing petugas. Biaya per-km ditentukan oleh sistem.",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun SubTypeCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    priceRange: String,
    color: androidx.compose.ui.graphics.Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .clickable { onClick() },
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = color),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                icon,
                contentDescription = null,
                modifier = Modifier.size(48.dp),
                tint = MaterialTheme.colorScheme.onSurface
            )
            
            Spacer(Modifier.height(12.dp))
            
            Text(
                title,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            
            Spacer(Modifier.height(4.dp))
            
            Text(
                subtitle,
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(Modifier.height(8.dp))
            
            Text(
                priceRange,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}
