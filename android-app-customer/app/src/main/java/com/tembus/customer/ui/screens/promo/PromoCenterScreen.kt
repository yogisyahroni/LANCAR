package com.tembus.customer.ui.screens.promo

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.model.CustomerEligiblePromo
import com.tembus.customer.ui.designsystem.TembusBadge
import com.tembus.customer.ui.designsystem.TembusBadgeTone
import com.tembus.customer.ui.designsystem.TembusButton
import com.tembus.customer.ui.designsystem.TembusCard
import com.tembus.customer.ui.theme.Background
import com.tembus.customer.ui.theme.OrangeCta
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryPale
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PromoCenterUiState(
    val isLoading: Boolean = false,
    val promos: List<CustomerEligiblePromo> = emptyList(),
    val error: String? = null,
)

@HiltViewModel
class PromoCenterViewModel @Inject constructor(
    private val apiService: TEMBUSApiService,
) : ViewModel() {
    private val _uiState = MutableStateFlow(PromoCenterUiState())
    val uiState: StateFlow<PromoCenterUiState> = _uiState.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            runCatching { apiService.getCustomerEligiblePromos(limit = 20) }
                .onSuccess { response ->
                    if (response.isSuccessful) {
                        _uiState.value = PromoCenterUiState(promos = response.body()?.data.orEmpty())
                    } else {
                        _uiState.value = PromoCenterUiState(error = "Promo belum dapat dimuat (${response.code()}).")
                    }
                }
                .onFailure { error ->
                    _uiState.value = PromoCenterUiState(error = error.localizedMessage ?: "Promo belum dapat dimuat.")
                }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PromoCenterScreen(
    onBackClick: () -> Unit,
    onUsePromo: (String) -> Unit,
    viewModel: PromoCenterViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        containerColor = Background,
        topBar = {
            TopAppBar(
                title = { Text("Detail & Klaim Promo", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"))
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Primary),
                ) {
                    Row(modifier = Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.LocalOffer, contentDescription = null, tint = OrangeCta, modifier = Modifier.size(34.dp))
                        Spacer(Modifier.size(12.dp))
                        Column {
                            Text("Promo TEMBUS", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
                            Text("Pilih promo aktif dari server untuk order kamu.", color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp)
                        }
                    }
                }
            }

            when {
                state.isLoading -> item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator() } }
                state.error != null -> item {
                    TembusCard {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error)
                            OutlinedButton(onClick = viewModel::refresh, modifier = Modifier.fillMaxWidth()) {
                                Icon(Icons.Default.Refresh, contentDescription = null)
                                Text("Coba lagi")
                            }
                        }
                    }
                }
                state.promos.isEmpty() -> item {
                    TembusCard {
                        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Text("Belum ada promo yang tersedia", fontWeight = FontWeight.Bold)
                            Text("Promo aktif akan muncul di sini setelah dipublikasikan oleh server.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                else -> items(state.promos, key = { it.id.ifBlank { it.code } }) { promo ->
                    PromoCard(promo = promo, onUse = { onUsePromo(promo.code) })
                }
            }
        }
    }
}

@Composable
private fun PromoCard(promo: CustomerEligiblePromo, onUse: () -> Unit) {
    TembusCard {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(promo.name.ifBlank { promo.code }, fontWeight = FontWeight.Black, fontSize = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(promo.code, color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                TembusBadge("Aktif", tone = TembusBadgeTone.Success)
            }
            promo.description?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(discountLabel(promo), color = OrangeCta, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
                TembusButton(text = "Pakai", onClick = onUse, trailingIcon = Icons.AutoMirrored.Filled.ArrowForward)
            }
        }
    }
}

private fun discountLabel(promo: CustomerEligiblePromo): String {
    return when {
        promo.discountPercent != null && promo.discountPercent > 0 -> "Diskon ${promo.discountPercent}%"
        promo.discountValueIdr > 0 -> "Diskon Rp ${formatRupiah(promo.discountValueIdr)}"
        else -> "Promo aktif"
    }
}

private fun formatRupiah(value: Long): String = value.coerceAtLeast(0).toString().reversed().chunked(3).joinToString(".").reversed()
