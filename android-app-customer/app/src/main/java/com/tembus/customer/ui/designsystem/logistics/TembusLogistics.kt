package com.tembus.customer.ui.designsystem.logistics

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tembus.customer.ui.designsystem.TembusBadge
import com.tembus.customer.ui.designsystem.TembusBadgeTone
import com.tembus.customer.ui.designsystem.TembusButton
import com.tembus.customer.ui.designsystem.TembusButtonVariant
import com.tembus.customer.ui.designsystem.TembusCard
import com.tembus.customer.ui.designsystem.TembusControlState

data class TembusAddressData(
    val label: String,
    val address: String,
    val coordinateLabel: String? = null,
)

data class TembusRouteSummaryData(
    val pickup: TembusAddressData,
    val dropoff: TembusAddressData,
    val distanceLabel: String? = null,
    val etaLabel: String? = null,
    val providerLabel: String? = null,
)

data class TembusPackageSummaryData(
    val title: String,
    val packageCode: String? = null,
    val details: String? = null,
    val statusLabel: String? = null,
)

enum class TembusCarrierAvailability {
    Available,
    Conditional,
    Unavailable,
}

/** Provider and price fields are authoritative response data, never ad data. */
data class TembusCarrierRateData(
    val id: String,
    val providerName: String,
    val serviceLabel: String,
    val priceLabel: String,
    val etaLabel: String,
    val capabilityLabel: String,
    val distanceLabel: String? = null,
    val ratingLabel: String? = null,
    val statusLabel: String,
    val availability: TembusCarrierAvailability,
    val selected: Boolean = false,
)

data class TembusTrackingStep(
    val label: String,
    val state: TembusTrackingState,
    val timeLabel: String? = null,
    val detail: String? = null,
)

enum class TembusTrackingState {
    Completed,
    Active,
    Pending,
    Failed,
}

enum class TembusProofState {
    Verified,
    Pending,
    Rejected,
    Missing,
}

data class TembusProofData(
    val title: String,
    val state: TembusProofState,
    val detail: String,
    val referenceLabel: String? = null,
)

data class TembusQuoteLine(
    val label: String,
    val valueLabel: String,
)

data class TembusQuoteBreakdownData(
    val lines: List<TembusQuoteLine>,
    val totalLabel: String,
    val title: String? = null,
    val quoteIdLabel: String? = null,
    val expiresLabel: String? = null,
    val providerLabel: String? = null,
)

data class TembusVehicleData(
    val typeLabel: String,
    val plateLabel: String? = null,
    val makeModelLabel: String? = null,
    val capacityLabel: String? = null,
)

data class TembusTechnicianData(
    val name: String,
    val capabilityLabel: String,
    val etaLabel: String,
    val ratingLabel: String? = null,
    val statusLabel: String? = null,
)

data class TembusIncidentData(
    val title: String,
    val description: String,
    val locationLabel: String,
    val capabilityLabel: String,
    val etaLabel: String,
    val priceLabel: String? = null,
    val actionLabel: String,
)

data class TembusRequoteApprovalData(
    val reason: String,
    val originalTotalLabel: String,
    val newTotalLabel: String,
    val expiresLabel: String? = null,
)

@Composable
fun TembusAddressCard(data: TembusAddressData, modifier: Modifier = Modifier, onSelect: (() -> Unit)? = null) {
    TembusCard(modifier = modifier.fillMaxWidth(), onClick = onSelect) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Default.LocationOn, contentDescription = "", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Text(data.label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            }
            Text(data.address, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            data.coordinateLabel?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
fun TembusRouteSummary(data: TembusRouteSummaryData, modifier: Modifier = Modifier) {
    TembusCard(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            TembusAddressCard(data.pickup)
            TembusAddressCard(data.dropoff)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                data.distanceLabel?.let { TembusBadge(it, tone = TembusBadgeTone.Info) }
                data.etaLabel?.let { TembusBadge(it, tone = TembusBadgeTone.Info) }
            }
            data.providerLabel?.let { Text("Operator rute: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
fun TembusPackageSummary(data: TembusPackageSummaryData, modifier: Modifier = Modifier) {
    TembusCard(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.LocalShipping, contentDescription = "", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(data.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                data.packageCode?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                data.details?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            }
            data.statusLabel?.let { TembusBadge(it, tone = TembusBadgeTone.Info) }
        }
    }
}

@Composable
fun TembusCarrierRateCard(data: TembusCarrierRateData, onSelect: () -> Unit, modifier: Modifier = Modifier) {
    val selectable = data.availability != TembusCarrierAvailability.Unavailable
    TembusCard(modifier = modifier.fillMaxWidth(), onClick = if (selectable) onSelect else null) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(data.providerName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(data.serviceLabel, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                TembusBadge(data.statusLabel, tone = when (data.availability) {
                    TembusCarrierAvailability.Available -> TembusBadgeTone.Success
                    TembusCarrierAvailability.Conditional -> TembusBadgeTone.Warning
                    TembusCarrierAvailability.Unavailable -> TembusBadgeTone.Error
                })
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(data.priceLabel, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Text(data.etaLabel, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
            }
            Text(data.capabilityLabel, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            data.distanceLabel?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            data.ratingLabel?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            // Provider truth is displayed directly; this component has no ad or campaign input.
            TembusButton(text = if (data.selected) "Dipilih" else "Pilih", onClick = onSelect, state = if (selectable) TembusControlState.Default else TembusControlState.Disabled, variant = if (data.selected) TembusButtonVariant.Tonal else TembusButtonVariant.Primary, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
fun TembusTrackingTimeline(steps: List<TembusTrackingStep>, modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = steps.joinToString("; ") { step -> "${step.label}: ${step.state.label()}" } }, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        steps.forEach { step ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                Icon(step.state.icon(), contentDescription = "", tint = step.state.tint(), modifier = Modifier.size(20.dp))
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(step.label, style = MaterialTheme.typography.bodyMedium, fontWeight = if (step.state == TembusTrackingState.Active) FontWeight.Bold else FontWeight.Normal)
                    step.detail?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                }
                step.timeLabel?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
    }
}

@Composable
fun TembusProofCard(data: TembusProofData, modifier: Modifier = Modifier, onAction: (() -> Unit)? = null, actionLabel: String? = null) {
    TembusCard(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(data.state.icon(), contentDescription = "", tint = data.state.tint(), modifier = Modifier.size(22.dp))
                Text(data.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                TembusBadge(data.state.label(), tone = data.state.tone())
            }
            Text(data.detail, style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
            data.referenceLabel?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            if (onAction != null && actionLabel != null) TembusButton(text = actionLabel, onClick = onAction, variant = TembusButtonVariant.Outline, modifier = Modifier.heightIn(min = 48.dp))
        }
    }
}

@Composable
fun TembusQuoteBreakdown(data: TembusQuoteBreakdownData, modifier: Modifier = Modifier) {
    TembusCard(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            data.title?.let { Text(it, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
            data.providerLabel?.let { Text("Sumber quote: $it", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            data.lines.forEach { line ->
                Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    Text(line.label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(line.valueLabel, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                }
            }
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Total", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(data.totalLabel, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            }
            data.quoteIdLabel?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            data.expiresLabel?.let { TembusBadge(it, tone = TembusBadgeTone.Warning) }
        }
    }
}

@Composable
fun TembusVehicleCard(data: TembusVehicleData, modifier: Modifier = Modifier) {
    TembusCard(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.LocalShipping, contentDescription = "", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(data.typeLabel, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                data.makeModelLabel?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                data.plateLabel?.let { Text(it, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold) }
                data.capacityLabel?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
    }
}

@Composable
fun TembusTechnicianCard(data: TembusTechnicianData, modifier: Modifier = Modifier) {
    TembusCard(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(data.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(data.capabilityLabel, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TembusBadge(data.etaLabel, tone = TembusBadgeTone.Info)
                data.ratingLabel?.let { TembusBadge(it, tone = TembusBadgeTone.Neutral) }
            }
            data.statusLabel?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
fun TembusIncidentSummary(data: TembusIncidentData, onAction: () -> Unit, modifier: Modifier = Modifier) {
    TembusCard(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Default.Warning, contentDescription = "", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(22.dp))
                Text(data.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            Text(data.description, style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
            TembusFactRow("Lokasi", data.locationLabel)
            TembusFactRow("Kapabilitas", data.capabilityLabel)
            TembusFactRow("ETA", data.etaLabel)
            data.priceLabel?.let { TembusFactRow("Harga", it) }
            TembusButton(text = data.actionLabel, onClick = onAction, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
fun TembusRequoteApprovalCard(data: TembusRequoteApprovalData, onApprove: () -> Unit, onReject: (() -> Unit)? = null, modifier: Modifier = Modifier) {
    TembusCard(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Konfirmasi perubahan quote", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(data.reason, style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
            TembusFactRow("Sebelumnya", data.originalTotalLabel)
            TembusFactRow("Quote baru", data.newTotalLabel)
            data.expiresLabel?.let { TembusBadge(it, tone = TembusBadgeTone.Warning) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                if (onReject != null) TembusButton(text = "Tolak", onClick = onReject, variant = TembusButtonVariant.Outline, modifier = Modifier.weight(1f))
                TembusButton(text = "Setujui", onClick = onApprove, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
fun TembusSafetyNotice(message: String, modifier: Modifier = Modifier, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    TembusCard(modifier = modifier.fillMaxWidth(), elevated = true) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Default.Security, contentDescription = "", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                Text("Keselamatan", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            }
            Text(message, style = MaterialTheme.typography.bodyMedium, maxLines = 5, overflow = TextOverflow.Ellipsis)
            if (actionLabel != null && onAction != null) TembusButton(text = actionLabel, onClick = onAction, variant = TembusButtonVariant.Outline, modifier = Modifier.heightIn(min = 48.dp))
        }
    }
}

@Composable
private fun TembusFactRow(label: String, value: String) {
    Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

private fun TembusCarrierAvailability.label(): String = when (this) {
    TembusCarrierAvailability.Available -> "Tersedia"
    TembusCarrierAvailability.Conditional -> "Bersyarat"
    TembusCarrierAvailability.Unavailable -> "Tidak tersedia"
}

private fun TembusTrackingState.label(): String = when (this) {
    TembusTrackingState.Completed -> "Selesai"
    TembusTrackingState.Active -> "Berlangsung"
    TembusTrackingState.Pending -> "Menunggu"
    TembusTrackingState.Failed -> "Gagal"
}

private fun TembusTrackingState.icon() = when (this) {
    TembusTrackingState.Completed -> Icons.Default.CheckCircle
    TembusTrackingState.Active -> Icons.Default.LocalShipping
    TembusTrackingState.Pending -> Icons.Default.Schedule
    TembusTrackingState.Failed -> Icons.Default.Warning
}

@Composable
private fun TembusTrackingState.tint() = when (this) {
    TembusTrackingState.Completed -> MaterialTheme.colorScheme.primary
    TembusTrackingState.Active -> MaterialTheme.colorScheme.primary
    TembusTrackingState.Pending -> MaterialTheme.colorScheme.tertiary
    TembusTrackingState.Failed -> MaterialTheme.colorScheme.error
}

private fun TembusTrackingState.iconStateTone(): TembusBadgeTone = when (this) {
    TembusTrackingState.Completed -> TembusBadgeTone.Success
    TembusTrackingState.Active -> TembusBadgeTone.Info
    TembusTrackingState.Pending -> TembusBadgeTone.Warning
    TembusTrackingState.Failed -> TembusBadgeTone.Error
}

private fun TembusProofState.label(): String = when (this) {
    TembusProofState.Verified -> "Terverifikasi"
    TembusProofState.Pending -> "Menunggu"
    TembusProofState.Rejected -> "Ditolak"
    TembusProofState.Missing -> "Belum ada"
}

private fun TembusProofState.icon() = when (this) {
    TembusProofState.Verified -> Icons.Default.CheckCircle
    TembusProofState.Pending -> Icons.Default.Schedule
    TembusProofState.Rejected -> Icons.Default.Warning
    TembusProofState.Missing -> Icons.Default.Warning
}

@Composable
private fun TembusProofState.tint() = when (this) {
    TembusProofState.Verified -> MaterialTheme.colorScheme.primary
    TembusProofState.Pending -> MaterialTheme.colorScheme.tertiary
    TembusProofState.Rejected -> MaterialTheme.colorScheme.error
    TembusProofState.Missing -> MaterialTheme.colorScheme.onSurfaceVariant
}

private fun TembusProofState.tone() = when (this) {
    TembusProofState.Verified -> TembusBadgeTone.Success
    TembusProofState.Pending -> TembusBadgeTone.Warning
    TembusProofState.Rejected -> TembusBadgeTone.Error
    TembusProofState.Missing -> TembusBadgeTone.Neutral
}
