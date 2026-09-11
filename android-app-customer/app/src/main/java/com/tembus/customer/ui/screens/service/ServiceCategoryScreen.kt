package com.tembus.customer.ui.screens.service

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.ui.designsystem.service.TembusParcelIdentity
import com.tembus.customer.ui.designsystem.service.TembusServiceIdentityCard
import com.tembus.customer.ui.designsystem.service.TembusTireRepairIdentity
import com.tembus.customer.ui.designsystem.service.TembusTowingIdentity

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceCategoryScreen(
    onBackClick: () -> Unit,
    onCategorySelected: (String) -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Pilih Layanan", fontWeight = FontWeight.Bold) },
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
            // Antar Barang
            TembusServiceIdentityCard(
                identity = TembusParcelIdentity,
                onClick = { onCategorySelected("on_demand") }
            )
            
            // Tambal Ban
            TembusServiceIdentityCard(
                identity = TembusTireRepairIdentity,
                onClick = { onCategorySelected("tambal_ban") }
            )
            
            // Towing
            TembusServiceIdentityCard(
                identity = TembusTowingIdentity,
                onClick = { onCategorySelected("towing") }
            )
            
            Spacer(Modifier.height(16.dp))
            
            Text(
                "Catatan: harga jasa ditentukan oleh petugas. Biaya per-km ditentukan oleh sistem.",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
