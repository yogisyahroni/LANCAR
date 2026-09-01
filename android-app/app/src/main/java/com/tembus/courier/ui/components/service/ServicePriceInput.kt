package com.tembus.courier.ui.components.service

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import com.tembus.courier.ui.localization.CourierText as Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ============================================================
// SERVICE PRICE INPUT — Input Harga Jasa
// ============================================================

@Composable
fun ServicePriceInput(
    serviceCode: String,
    price: String,
    onPriceChange: (String) -> Unit,
    minPrice: Long = 15000,
    maxPrice: Long = 150000,
    modifier: Modifier = Modifier
) {
    var error by remember { mutableStateOf<String?>(null) }
    
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
                "Harga Jasa",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            
            Spacer(Modifier.height(8.dp))
            
            Text(
                "Tentukan harga jasa Anda untuk layanan ini",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(Modifier.height(12.dp))
            
            OutlinedTextField(
                value = price,
                onValueChange = { newValue ->
                    // Only allow numbers
                    if (newValue.all { it.isDigit() }) {
                        onPriceChange(newValue)
                        val priceLong = newValue.toLongOrNull() ?: 0
                        error = when {
                            priceLong < minPrice -> "Harga minimal Rp ${formatRupiah(minPrice)}"
                            priceLong > maxPrice -> "Harga maksimal Rp ${formatRupiah(maxPrice)}"
                            else -> null
                        }
                    }
                },
                label = { Text("Harga Jasa (Rp)") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                isError = error != null,
                supportingText = error?.let { { Text(it) } },
                prefix = { Text("Rp ") }
            )
            
            Spacer(Modifier.height(8.dp))
            
            Text(
                "Batas: Rp ${formatRupiah(minPrice)} - Rp ${formatRupiah(maxPrice)}",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

private fun formatRupiah(amount: Long): String {
    return amount.toString().reversed().chunked(3).joinToString(".").reversed()
}
