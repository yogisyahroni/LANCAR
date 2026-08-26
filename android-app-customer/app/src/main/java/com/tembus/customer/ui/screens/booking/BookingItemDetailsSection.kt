package com.tembus.customer.ui.screens.booking
import android.Manifest
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.LocalActivity
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Scale
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.sp
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.tembus.customer.ui.components.maps.LatLng
import com.tembus.customer.ui.components.maps.MapProperties
import com.tembus.customer.ui.components.maps.MapUiSettings
import com.tembus.customer.data.model.CustomerAddress
import com.tembus.customer.data.model.DeliveryServiceProduct
import com.tembus.customer.data.model.DimensionsPayload
import com.tembus.customer.data.model.MapsGeocodeResult
import com.tembus.customer.data.model.PriceBreakdown
import com.tembus.customer.data.model.ServiceSizeTier
import com.tembus.customer.ui.components.maps.RuntimeMapMarker
import com.tembus.customer.ui.components.maps.RuntimeMapRenderer
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.AccentSoft
import com.tembus.customer.ui.theme.Background
import com.tembus.customer.ui.theme.Error
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.OutlineStrong
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryPale
import com.tembus.customer.ui.theme.PrimarySoft
import com.tembus.customer.ui.theme.Secondary
import com.tembus.customer.ui.theme.SecondaryLight
import com.tembus.customer.ui.theme.Success
import com.tembus.customer.ui.theme.Surface as TembusSurface
import com.tembus.customer.ui.theme.SurfaceVariant
import com.tembus.customer.ui.theme.TembusRadius
import com.tembus.customer.ui.theme.TextDisabled
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

import com.tembus.customer.ui.screens.booking.*

@Composable
internal fun PackageCard(
    state: BookingState,
    onTierSelected: (String, Double, DimensionsPayload) -> Unit
) {
    val selectedService = state.selectedService()
    val serviceMaxWeight = selectedService?.maxWeightKg
    val tiers = remember(state.services) {
        state.services
            .flatMap { it.sizeTiers }
            .filter { it.code.isNotBlank() && it.name.isNotBlank() && it.maxWeightKg > 0.0 }
            .distinctBy { it.code }
            .sortedBy { it.maxWeightKg }
    }
    var selectedTierCode by remember(state.sizeTier, tiers) {
        mutableStateOf(state.sizeTier)
    }
    val selectedTier = tiers.firstOrNull { it.code == state.sizeTier }

    LcCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Ukuran & berat paket", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        }
        Text("Pilih tier paket. Berat dan dimensi teknis akan diisi otomatis untuk menghitung harga.", color = Muted, fontSize = 14.sp)
        Spacer(Modifier.height(16.dp))
        if (tiers.isEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(FieldBg)
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Scale, null, tint = Muted)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("Pilihan paket sedang dimuat", fontWeight = FontWeight.Bold, color = Ink)
                    Text("Pilihan ukuran layanan sedang disinkronkan sebelum order dihitung.", color = Muted, fontSize = 12.sp)
                }
            }
        } else {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(items = tiers, key = { it.code }) { tier: ServiceSizeTier ->
                    val selected = selectedTierCode == tier.code
                    val availableForService = serviceMaxWeight == null || tier.maxWeightKg <= serviceMaxWeight
                    Column(
                        modifier = Modifier
                            .width(148.dp)
                            .clip(RoundedCornerShape(TembusRadius.Card))
                            .background(if (selected) SoftGreen else if (availableForService) MaterialTheme.colorScheme.surface else SurfaceVariant)
                            .border(
                                BorderStroke(1.dp, if (selected) LcGreen else Outline),
                                RoundedCornerShape(TembusRadius.Card)
                            )
                            .clickable(enabled = availableForService) {
                                selectedTierCode = tier.code
                                onTierSelected(
                                    tier.code,
                                    tier.maxWeightKg.coerceAtLeast(1.0),
                                    tier.defaultDimensionsPayload()
                                )
                            }
                            .padding(14.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(tier.name, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = if (availableForService) Ink else Muted)
                        Spacer(Modifier.height(6.dp))
                        Text(if (availableForService) "Maks. ${formatWeightKg(tier.maxWeightKg)} kg" else "Tidak cocok", color = Muted, fontSize = 13.sp)
                    }
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        if (state.isPackageReady()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(FieldBg)
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Scale, null, tint = Primary)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        "${selectedTier?.name ?: "Paket"} • maks. ${formatWeightKg(state.packageWeight)} kg",
                        fontWeight = FontWeight.Bold,
                        color = Ink
                    )
                    Text("Detail teknis otomatis mengikuti tier yang dipilih.", color = Muted, fontSize = 12.sp)
                }
                Text(if (state.dimensionsScanned) "Scan valid" else "Tier dipilih", color = LcGreen, fontWeight = FontWeight.Bold)
            }
        } else {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(FieldBg)
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Scale, null, tint = Muted)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("Ukuran paket belum dipilih", fontWeight = FontWeight.Bold, color = Ink)
                    Text("Pilih salah satu tier paket untuk menghitung harga.", color = Muted, fontSize = 12.sp)
                }
            }
        }
        selectedService?.let { service ->
            if (service.maxWeightKg != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "${service.name} menerima paket sampai ${service.maxWeightKg.toInt()} kg. Pilihan yang melebihi batas layanan dikunci.",
                    color = Muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp
                )
            }
        }
    }
}

@Composable
internal fun AddOnCard(
    deliveryCodeEnabled: Boolean,
    insuranceEnabled: Boolean,
    onDeliveryCodeChange: (Boolean) -> Unit,
    onInsuranceChange: (Boolean) -> Unit
) {
    LcCard {
        Text("Fitur tambahan", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Spacer(Modifier.height(12.dp))
        AddOnRow(
            icon = Icons.Default.Lock,
            title = "Kode terima paket",
            description = "Penerima wajib memberi kode saat paket diterima.",
            price = "Gratis",
            checked = deliveryCodeEnabled,
            onCheckedChange = onDeliveryCodeChange
        )
        HorizontalDivider(color = Outline)
        AddOnRow(
            icon = Icons.Default.Shield,
            title = "Perlindungan paket",
            description = "Tambahkan perlindungan untuk barang bernilai.",
            price = "Opsional",
            checked = insuranceEnabled,
            onCheckedChange = onInsuranceChange
        )
    }
}

@Composable
internal fun AddOnRow(
    icon: ImageVector,
    title: String,
    description: String,
    price: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(TembusRadius.Card))
                .background(SoftOrange),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, null, tint = Secondary)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = Ink)
                Spacer(Modifier.width(8.dp))
                Text(price, fontWeight = FontWeight.Bold, color = LcGreen, fontSize = 13.sp)
            }
            Text(description, color = Muted, fontSize = 13.sp, lineHeight = 18.sp)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
internal fun SavedAddressChip(
    address: CustomerAddress,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .width(240.dp)
            .clip(RoundedCornerShape(TembusRadius.Card))
            .border(BorderStroke(1.dp, Outline), RoundedCornerShape(TembusRadius.Card))
            .background(MaterialTheme.colorScheme.surface)
            .clickable { onClick() }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(TembusRadius.Card))
                .background(if (address.kind == "pickup") SoftGreen else SoftOrange),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                if (address.kind == "pickup") Icons.Default.MyLocation else Icons.Default.Place,
                null,
                tint = if (address.kind == "pickup") LcGreen else Secondary
            )
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(address.label, color = Ink, fontWeight = FontWeight.ExtraBold, maxLines = 1)
            Text(address.address, color = Muted, fontSize = 12.sp, maxLines = 2)
        }
    }
}
