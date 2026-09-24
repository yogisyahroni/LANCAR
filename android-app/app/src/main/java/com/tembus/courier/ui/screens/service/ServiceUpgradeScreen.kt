package com.tembus.courier.ui.screens.service

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import com.tembus.courier.ui.localization.CourierText as Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
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
    val perKmDrafts = remember(uiState.servicePrices) {
        mutableStateMapOf<String, String>().apply {
            uiState.servicePrices.forEach { put(it.serviceCode, it.perKmRateIdr.toString()) }
        }
    }
    val tollEntryDrafts = remember(uiState.servicePrices) {
        mutableStateMapOf<String, String>().apply {
            uiState.servicePrices.forEach { put(it.serviceCode, it.tollEntryIdr.toString()) }
        }
    }
    val tollExitDrafts = remember(uiState.servicePrices) {
        mutableStateMapOf<String, String>().apply {
            uiState.servicePrices.forEach { put(it.serviceCode, it.tollExitIdr.toString()) }
        }
    }
    val pricePerHoleDrafts = remember(uiState.servicePrices) {
        mutableStateMapOf<String, String>().apply {
            uiState.servicePrices.forEach { put(it.serviceCode, it.pricePerHoleIdr.toString()) }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Tarif Layanan Roadside",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        if (uiState.servicePrices.isNotEmpty()) {
            Text(
                text = "Harga yang tampil di penawaran customer",
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
                RoadsideAmountInput(
                    label = "Harga jarak per km",
                    value = perKmDrafts[price.serviceCode].orEmpty(),
                    onValueChange = { perKmDrafts[price.serviceCode] = it },
                    modifier = Modifier.padding(bottom = 8.dp),
                )
                RoadsideAmountInput(
                    label = "Tol masuk",
                    value = tollEntryDrafts[price.serviceCode].orEmpty(),
                    onValueChange = { tollEntryDrafts[price.serviceCode] = it },
                    modifier = Modifier.padding(bottom = 8.dp),
                )
                RoadsideAmountInput(
                    label = "Tol keluar",
                    value = tollExitDrafts[price.serviceCode].orEmpty(),
                    onValueChange = { tollExitDrafts[price.serviceCode] = it },
                    modifier = Modifier.padding(bottom = 8.dp),
                )
                if (price.serviceCode.startsWith("tambal_ban")) {
                    RoadsideAmountInput(
                        label = "Harga per lubang tambal ban",
                        value = pricePerHoleDrafts[price.serviceCode].orEmpty(),
                        onValueChange = { pricePerHoleDrafts[price.serviceCode] = it },
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                }
                Button(
                    onClick = {
                        viewModel.saveServicePrice(
                            serviceCode = price.serviceCode,
                            priceAmount = draft.toLongOrNull() ?: 0L,
                            perKmRateIdr = perKmDrafts[price.serviceCode]?.toLongOrNull() ?: 0L,
                            tollEntryIdr = tollEntryDrafts[price.serviceCode]?.toLongOrNull() ?: 0L,
                            tollExitIdr = tollExitDrafts[price.serviceCode]?.toLongOrNull() ?: 0L,
                            pricePerHoleIdr = pricePerHoleDrafts[price.serviceCode]?.toLongOrNull() ?: 0L,
                        )
                    },
                    enabled = uiState.savingPriceCode == null
                        && (draft.toLongOrNull()?.let { it in price.minPrice..price.maxPrice } == true)
                        && (perKmDrafts[price.serviceCode]?.toLongOrNull() ?: -1L) >= 0
                        && (tollEntryDrafts[price.serviceCode]?.toLongOrNull() ?: -1L) >= 0
                        && (tollExitDrafts[price.serviceCode]?.toLongOrNull() ?: -1L) >= 0
                        && (!price.serviceCode.startsWith("tambal_ban")
                            || (pricePerHoleDrafts[price.serviceCode]?.toLongOrNull() ?: 0L) > 0),
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
            text = "Harga jasa, tarif jarak, dan estimasi tol disimpan ke server. Customer melihatnya sebagai penawaran terkunci sebelum pembayaran.",
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

@Composable
private fun RoadsideAmountInput(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { input -> if (input.all(Char::isDigit)) onValueChange(input) },
        label = { Text("$label (Rp)") },
        prefix = { Text("Rp ") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        singleLine = true,
        modifier = modifier.fillMaxWidth(),
    )
}
