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
internal fun BookingHeader(onBackClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Primary)
            .statusBarsPadding()
            .padding(start = 10.dp, end = 20.dp, top = 12.dp, bottom = 18.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onBackClick) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali", tint = MaterialTheme.colorScheme.onPrimary)
        }
        Spacer(Modifier.width(8.dp))
        Column {
            Text("TEMBUS", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onPrimary)
            Text("Pengiriman on-demand", fontSize = 14.sp, color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.82f))
        }
    }
}

@Composable
internal fun DeliveryDetailCard(
    state: BookingState,
    onPickupClick: () -> Unit,
    onDestinationClick: () -> Unit,
    onRequestLocationClick: () -> Unit
) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp)
    ) {
        Column(Modifier.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Detail pengiriman paket", fontWeight = FontWeight.ExtraBold, fontSize = 21.sp, color = Ink)
                    Text("Alamat dipakai untuk hitung harga dan pencarian kurir.", color = Muted, fontSize = 13.sp)
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(SoftBlue)
                        .padding(horizontal = 12.dp, vertical = 7.dp)
                ) {
                    Text("ON DEMAND", color = Primary, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Rute", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp, color = Ink)
                Spacer(Modifier.weight(1f))
                AssistChip(
                    onClick = onDestinationClick,
                    label = { Text("Pilih tujuan") },
                    leadingIcon = { Icon(Icons.Default.Place, null, Modifier.size(18.dp)) }
                )
            }
            Spacer(Modifier.height(10.dp))
            AddressRow(
                icon = Icons.Default.MyLocation,
                iconColor = LcGreen,
                title = "Ambil paket di",
                address = state.pickupAddress.ifBlank { "Pilih titik pickup" },
                emphasized = state.pickupAddress.isNotBlank(),
                onClick = onPickupClick
            )
            DottedConnector()
            AddressRow(
                icon = Icons.Default.Place,
                iconColor = Secondary,
                title = "Kirim paket ke",
                address = state.destinationAddress.ifBlank { "Pilih lokasi tujuan" },
                emphasized = state.destinationAddress.isNotBlank(),
                onClick = onDestinationClick
            )
            Spacer(Modifier.height(14.dp))
            Row(
                modifier = Modifier
                        .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(SoftGreen)
                    .clickable { onRequestLocationClick() }
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Map, null, tint = LcGreen)
                Spacer(Modifier.width(10.dp))
                Text("Minta lokasi dari penerima", color = LcGreen, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = LcGreen)
            }
        }
    }
}

@Composable
internal fun AddressRow(
    icon: ImageVector,
    iconColor: Color,
    title: String,
    address: String,
    emphasized: Boolean,
    onClick: (() -> Unit)?
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(TembusRadius.Card))
            .clickable(enabled = onClick != null) { onClick?.invoke() }
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(RoundedCornerShape(TembusRadius.Card))
                .background(iconColor.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, null, tint = iconColor)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = Muted, fontSize = 13.sp)
            Text(
                address,
                color = if (emphasized) Ink else TextDisabled,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2
            )
        }
        if (onClick != null) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = TextDisabled)
        }
    }
}

@Composable
internal fun DottedConnector() {
    Row(Modifier.padding(start = 20.dp)) {
        Box(
            modifier = Modifier
                .height(24.dp)
                .width(1.dp)
                .background(OutlineStrong)
        )
    }
}

@Composable
internal fun BookingStepHintCard() {
    LcCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(SoftBlue),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Navigation, null, tint = Primary)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("Mulai dari alamat", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
                Text(
                    "Pilih titik pickup dan tujuan. Setelah lengkap, ukuran paket dan pilihan layanan akan muncul otomatis.",
                    color = Muted,
                    fontSize = 13.sp,
                    lineHeight = 18.sp
                )
            }
        }
    }
}

@Composable
internal fun RecipientCard(
    state: BookingState,
    onNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onItemChange: (String) -> Unit
) {
    LcCard {
        Text("Detail penerima & barang", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Text("Data ini dikirim ke kurir dan dipakai untuk bukti operasional.", color = Muted, fontSize = 13.sp)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.recipientName,
            onValueChange = onNameChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Nama penerima") },
            singleLine = true,
            shape = RoundedCornerShape(TembusRadius.Input),
            colors = tembusLightTextFieldColors()
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = state.recipientPhone,
            onValueChange = onPhoneChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Nomor handphone penerima") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            shape = RoundedCornerShape(TembusRadius.Input),
            colors = tembusLightTextFieldColors()
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = state.itemDescription,
            onValueChange = onItemChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Isi paket / catatan barang") },
            singleLine = true,
            shape = RoundedCornerShape(TembusRadius.Input),
            colors = tembusLightTextFieldColors()
        )
    }
}
