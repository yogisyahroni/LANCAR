package com.tembus.courier.ui.screens.service

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import com.tembus.courier.ui.localization.CourierText as Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.courier.ui.components.service.ServicePriceInput

@Composable
fun ServiceUpgradeScreen(
    viewModel: ServiceUpgradeViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val priceDrafts = remember(uiState.servicePrices) {
        mutableStateMapOf<String, String>().apply {
            uiState.servicePrices.forEach { put(it.serviceCode, it.priceAmount.toString()) }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Daftar Layanan Tambal Ban",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        if (uiState.servicePrices.isNotEmpty()) {
            Text(
                text = "Harga jasa roadside",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            Text(
                text = "Harga dan batasnya dimuat dari database admin. Nilai ini dipakai untuk order berikutnya.",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 12.dp)
            )
            uiState.servicePrices.forEach { price ->
                val draft = priceDrafts[price.serviceCode].orEmpty()
                ServicePriceInput(
                    serviceCode = price.serviceCode,
                    price = draft,
                    onPriceChange = { priceDrafts[price.serviceCode] = it },
                    minPrice = price.minPrice,
                    maxPrice = price.maxPrice,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                Button(
                    onClick = { viewModel.saveServicePrice(price.serviceCode, draft.toLongOrNull() ?: 0L) },
                    enabled = uiState.savingPriceCode == null && (draft.toLongOrNull()?.let { it in price.minPrice..price.maxPrice } == true),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                ) {
                    Text(if (uiState.savingPriceCode == price.serviceCode) "Menyimpan..." else "Simpan harga ${price.serviceName.ifBlank { price.serviceCode }}")
                }
            }
        } else {
            Text(
                "Harga layanan roadside belum dikonfigurasi untuk akun ini.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(bottom = 16.dp)
            )
        }

        Text(
            text = "Anda dapat menambah layanan Tambal Ban ke profil Anda. Anda harus mengupload bukti foto peralatan tambal ban (pompa, alat tambal) yang Anda miliki.",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(bottom = 24.dp)
        )

        OutlinedTextField(
            value = viewModel.proofImageUrl,
            onValueChange = { viewModel.proofImageUrl = it },
            label = { Text("URL Foto Bukti Alat") },
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 24.dp)
        )

        Button(
            onClick = { viewModel.requestUpgrade() },
            modifier = Modifier.fillMaxWidth(),
            enabled = !uiState.isLoading && viewModel.proofImageUrl.isNotBlank()
        ) {
            if (uiState.isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), color = MaterialTheme.colorScheme.onPrimary)
            } else {
                Text("Ajukan Layanan")
            }
        }

        if (uiState.message != null) {
            Text(
                text = uiState.message!!,
                color = if (uiState.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 16.dp)
            )
        }

        Spacer(modifier = Modifier.weight(1f))
        
        OutlinedButton(
            onClick = onNavigateBack,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Kembali")
        }
    }
}
