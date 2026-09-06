package com.tembus.customer.ui.screens.detail

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.ServiceAdjustment
import com.tembus.customer.data.repository.ServiceAdjustmentRepository
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.TembusRadius
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale
import javax.inject.Inject

data class RoadsideAdjustmentUiState(
    val isLoading: Boolean = false,
    val adjustments: List<ServiceAdjustment> = emptyList(),
    val decidingId: String? = null,
    val error: String? = null
)

@HiltViewModel
class RoadsideAdjustmentViewModel @Inject constructor(
    private val repository: ServiceAdjustmentRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(RoadsideAdjustmentUiState())
    val uiState: StateFlow<RoadsideAdjustmentUiState> = _uiState.asStateFlow()

    fun load(orderId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            repository.listForOrder(orderId)
                .onSuccess { adjustments ->
                    _uiState.update { it.copy(isLoading = false, adjustments = adjustments, error = null) }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = error.localizedMessage ?: "Penyesuaian harga belum dapat dimuat"
                        )
                    }
                }
        }
    }

    fun decide(orderId: String, adjustmentId: String, approve: Boolean) {
        viewModelScope.launch {
            _uiState.update { it.copy(decidingId = adjustmentId, error = null) }
            repository.decide(adjustmentId, approve)
                .onSuccess { updated ->
                    _uiState.update { state ->
                        state.copy(
                            decidingId = null,
                            adjustments = state.adjustments.map { current ->
                                if (current.id == updated.id) updated else current
                            },
                            error = null
                        )
                    }
                    load(orderId)
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            decidingId = null,
                            error = error.localizedMessage ?: "Keputusan penyesuaian belum tersimpan"
                        )
                    }
                }
        }
    }
}

@Composable
fun RoadsideAdjustmentSection(
    orderId: String,
    viewModel: RoadsideAdjustmentViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()
    var pendingDecision by remember { mutableStateOf<Pair<ServiceAdjustment, Boolean>?>(null) }

    LaunchedEffect(orderId) {
        viewModel.load(orderId)
    }

    pendingDecision?.let { (adjustment, approve) ->
        AlertDialog(
            onDismissRequest = { pendingDecision = null },
            title = {
                Text(if (approve) "Setujui biaya tambahan?" else "Tolak biaya tambahan?")
            },
            text = {
                Text(
                    if (approve) {
                        "Total pesanan akan berubah dari ${rupiah(adjustment.originalTotalIdr)} menjadi ${rupiah(adjustment.proposedTotalIdr)}."
                    } else {
                        "Biaya tambahan ${rupiah(adjustment.deltaIdr)} tidak akan diterapkan ke pesanan."
                    }
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingDecision = null
                        viewModel.decide(orderId, adjustment.id, approve)
                    }
                ) {
                    Text(if (approve) "Ya, setujui" else "Ya, tolak", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDecision = null }) {
                    Text("Batal")
                }
            }
        )
    }

    if (state.isLoading && state.adjustments.isEmpty()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.Center
        ) {
            CircularProgressIndicator(modifier = Modifier.height(24.dp))
        }
        return
    }

    if (state.adjustments.isEmpty() && state.error == null) return

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        state.error?.let { message ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
            ) {
                Text(
                    message,
                    modifier = Modifier.padding(12.dp),
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
        }

        state.adjustments.forEach { adjustment ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(TembusRadius.Card),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, Outline)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Penyesuaian biaya di lokasi", fontWeight = FontWeight.Bold)
                        Text(
                            adjustmentStatusLabel(adjustment.status),
                            color = adjustmentStatusColor(adjustment.status),
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Text(adjustment.reason, color = MaterialTheme.colorScheme.onSurfaceVariant)

                    adjustment.items.forEach { item ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("${item.quantity}× ${item.label}", modifier = Modifier.weight(1f))
                            Text(rupiah(item.totalIdr), fontWeight = FontWeight.Medium)
                        }
                    }

                    HorizontalDivider()
                    priceRow("Harga awal", adjustment.originalTotalIdr)
                    priceRow("Tambahan", adjustment.deltaIdr)
                    priceRow("Total setelah disetujui", adjustment.proposedTotalIdr, bold = true)

                    if (adjustment.status.equals("pending", ignoreCase = true)) {
                        Text(
                            "Biaya tambahan belum diterapkan sampai Anda menyetujuinya.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedButton(
                                onClick = { pendingDecision = adjustment to false },
                                enabled = state.decidingId == null,
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("Tolak")
                            }
                            Button(
                                onClick = { pendingDecision = adjustment to true },
                                enabled = state.decidingId == null,
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(if (state.decidingId == adjustment.id) "Memproses..." else "Setujui")
                            }
                        }
                    } else if (adjustment.status.equals("approved", ignoreCase = true)) {
                        Text(
                            "Disetujui. Tambahan ${rupiah(adjustment.approvedDeltaIdr)} menunggu proses penagihan sesuai metode pembayaran.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Primary
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun priceRow(label: String, amount: Long, bold: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label)
        Text(rupiah(amount), fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)
    }
}

private fun rupiah(value: Long): String =
    NumberFormat.getCurrencyInstance(Locale("id", "ID")).apply {
        maximumFractionDigits = 0
    }.format(value)

private fun adjustmentStatusLabel(status: String): String = when (status.lowercase()) {
    "approved" -> "Disetujui"
    "rejected" -> "Ditolak"
    else -> "Menunggu persetujuan"
}

@Composable
private fun adjustmentStatusColor(status: String): Color = when (status.lowercase()) {
    "approved" -> Primary
    "rejected" -> MaterialTheme.colorScheme.error
    else -> MaterialTheme.colorScheme.tertiary
}
