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
internal fun LocationInputSheet(
    title: String,
    subtitle: String,
    buttonLabel: String,
    savedAddresses: List<CustomerAddress>,
    addressKind: String,
    geocodeResults: List<MapsGeocodeResult>,
    isSearchingLocation: Boolean,
    geocodeError: String?,
    selectedMapLocation: LatLng?,
    selectedMapAddress: String,
    isResolvingMapPoint: Boolean,
    onSearch: (String) -> Unit,
    onGeocodeSelected: (MapsGeocodeResult) -> Unit,
    onSelect: (LatLng, String) -> Unit,
    onSavedAddressSelected: (CustomerAddress) -> Unit,
    onSaveAndSelect: (String, LatLng, String) -> Unit
) {
    var address by remember { mutableStateOf("") }
    var saveFavorite by remember { mutableStateOf(false) }
    var label by remember { mutableStateOf(if (addressKind == "pickup") "Pickup utama" else "Tujuan favorit") }
    val selectedAddress = selectedMapAddress.ifBlank { address.trim() }
    val canSave = selectedMapLocation != null && selectedAddress.length >= 6 && !isResolvingMapPoint

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(title, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Text(subtitle, color = Muted, lineHeight = 20.sp)
        if (savedAddresses.isNotEmpty()) {
            Text("Alamat tersimpan", color = Ink, fontWeight = FontWeight.ExtraBold)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(savedAddresses, key = { it.id }) { savedAddress ->
                    SavedAddressChip(
                        address = savedAddress,
                        onClick = { onSavedAddressSelected(savedAddress) }
                    )
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(TembusRadius.Card))
                .background(if (selectedMapLocation == null) FieldBg else PrimaryPale)
                .border(
                    BorderStroke(
                        1.dp,
                        if (selectedMapLocation == null) Outline else Success.copy(alpha = 0.32f)
                    ),
                    RoundedCornerShape(TembusRadius.Card)
                )
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(if (selectedMapLocation == null) MaterialTheme.colorScheme.surface else PrimarySoft),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (selectedMapLocation == null) Icons.Default.Search else Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = if (selectedMapLocation == null) Muted else LcGreen,
                    modifier = Modifier.size(24.dp)
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    if (selectedMapLocation == null) "Cari alamat lewat nama lokasi" else "Alamat terpilih",
                    color = Ink,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 16.sp
                )
                Text(
                    if (selectedMapLocation == null) {
                        "Ketik nama gedung, jalan, atau area lalu pilih dari hasil pencarian."
                    } else if (isResolvingMapPoint) {
                        "Menyinkronkan alamat terpilih..."
                    } else {
                        selectedAddress
                    },
                    color = Muted,
                    fontSize = 13.sp,
                    lineHeight = 18.sp
                )
            }
        }
        OutlinedTextField(
            value = address,
            onValueChange = { address = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(if (addressKind == "pickup") "Cari alamat pickup" else "Cari alamat tujuan") },
            minLines = 2,
            shape = RoundedCornerShape(TembusRadius.Input),
            colors = tembusLightTextFieldColors()
        )
        Button(
            onClick = { onSearch(address) },
            enabled = address.trim().length >= 3 && !isSearchingLocation,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = RoundedCornerShape(TembusRadius.Button),
            colors = ButtonDefaults.buttonColors(containerColor = Primary)
        ) {
            Icon(Icons.Default.Search, null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(if (isSearchingLocation) "Mencari alamat..." else "Cari lokasi")
        }
        geocodeError?.let { message ->
            Text(message, color = Secondary, fontSize = 13.sp)
        }
        if (geocodeResults.isNotEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                .clip(RoundedCornerShape(TembusRadius.Card))
                .border(BorderStroke(1.dp, Outline), RoundedCornerShape(TembusRadius.Card))
                .background(MaterialTheme.colorScheme.surface)
                    .padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text("Pilih hasil pencarian", color = Ink, fontWeight = FontWeight.ExtraBold)
                geocodeResults.take(5).forEach { result ->
                    GeocodeResultRow(
                        result = result,
                        onClick = {
                            address = result.label
                            onGeocodeSelected(result)
                        }
                    )
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(TembusRadius.Card))
                .background(FieldBg)
                .clickable { saveFavorite = !saveFavorite }
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(checked = saveFavorite, onCheckedChange = { saveFavorite = it })
            Column(Modifier.weight(1f)) {
                Text("Simpan ke alamat favorit", fontWeight = FontWeight.Bold, color = Ink)
                Text("Alamat ini akan muncul lagi saat membuat pengiriman berikutnya.", color = Muted, fontSize = 12.sp)
            }
        }
        if (saveFavorite) {
            OutlinedTextField(
                value = label,
                onValueChange = { label = it.take(80) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Nama alamat") },
                singleLine = true,
                shape = RoundedCornerShape(TembusRadius.Input),
                colors = tembusLightTextFieldColors()
            )
        }
        Button(
            onClick = {
                selectedMapLocation?.let { selectedLocation ->
                    if (saveFavorite) {
                        onSaveAndSelect(label.trim(), selectedLocation, selectedAddress)
                    } else {
                        onSelect(selectedLocation, selectedAddress)
                    }
                }
            },
            enabled = canSave && (!saveFavorite || label.trim().length >= 2),
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp),
            shape = RoundedCornerShape(TembusRadius.Button),
            colors = ButtonDefaults.buttonColors(containerColor = LcGreen)
        ) {
            Text(buttonLabel, fontWeight = FontWeight.ExtraBold)
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
internal fun RequestReceiverLocationSheet(
    link: String,
    status: String?,
    submittedAddress: String?,
    submittedContactName: String?,
    submittedContactPhone: String?,
    expiresAt: String?,
    isLoading: Boolean,
    onCreateLink: () -> Unit,
    onRefresh: () -> Unit,
    onRevoke: () -> Unit,
    onCopy: () -> Unit,
    onShare: () -> Unit
) {
    val isRevoked = status == "revoked"
    val canUseLink = link.isNotBlank() && !isRevoked

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 22.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(76.dp)
                .clip(RoundedCornerShape(TembusRadius.Card))
                .background(SoftGreen),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Default.Map, null, tint = LcGreen, modifier = Modifier.size(38.dp))
        }
        Spacer(Modifier.height(18.dp))
        Text(
            "Minta lokasi penerima",
            fontSize = 24.sp,
            fontWeight = FontWeight.ExtraBold,
            color = Ink
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Bagikan link agar penerima mengisi alamat dropoff yang lebih akurat. Setelah penerima mengirim, cek kembali untuk memakai titik tersebut.",
            color = Muted,
            fontSize = 14.sp,
            lineHeight = 20.sp
        )
        Spacer(Modifier.height(18.dp))
        if (!status.isNullOrBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(if (status == "submitted") SoftGreen else FieldBg)
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    if (status == "submitted") Icons.Default.CheckCircle else Icons.Default.AccessTime,
                    null,
                    tint = if (status == "submitted") LcGreen else Muted
                )
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        when (status) {
                            "submitted" -> "Lokasi sudah diisi"
                            "expired" -> "Link kedaluwarsa"
                            "revoked" -> "Link dibatalkan"
                            else -> "Menunggu penerima"
                        },
                        color = Ink,
                        fontWeight = FontWeight.ExtraBold
                    )
                    Text(
                        if (expiresAt.isNullOrBlank()) "Status tersinkron dari server" else "Aktif sampai ${expiresAt.take(16).replace("T", " ")}",
                        color = Muted,
                        fontSize = 12.sp
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
        }
        if (!submittedAddress.isNullOrBlank()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(SoftGreen)
                    .padding(14.dp)
            ) {
                Text("Alamat dari penerima", color = LcGreen, fontWeight = FontWeight.ExtraBold)
                Spacer(Modifier.height(4.dp))
                Text(submittedAddress, color = Ink, fontWeight = FontWeight.Bold)
                if (!submittedContactName.isNullOrBlank()) {
                    Text(
                        listOfNotNull(submittedContactName, submittedContactPhone).joinToString(" • "),
                        color = Muted,
                        fontSize = 12.sp
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(TembusRadius.Card))
                .background(FieldBg)
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Lock, null, tint = Muted)
            Spacer(Modifier.width(10.dp))
            Text(
                if (isRevoked) "Link sudah dibatalkan" else link.ifBlank { "Link belum dibuat" },
                color = Ink,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
                maxLines = 2
            )
            TextButton(onClick = onCopy, enabled = canUseLink) {
                Text("Salin", color = LcGreen, fontWeight = FontWeight.ExtraBold)
            }
        }
        Spacer(Modifier.height(18.dp))
        if (canUseLink) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = onShare,
                    enabled = !isLoading,
                    modifier = Modifier
                        .weight(1f)
                        .height(50.dp),
                    shape = RoundedCornerShape(TembusRadius.Button),
                    colors = ButtonDefaults.buttonColors(containerColor = LcGreen)
                ) {
                    Text("Bagikan", fontWeight = FontWeight.ExtraBold)
                }
                Button(
                    onClick = onRefresh,
                    enabled = !isLoading,
                    modifier = Modifier
                        .weight(1f)
                        .height(50.dp),
                    shape = RoundedCornerShape(TembusRadius.Button),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary)
                ) {
                    Text(if (isLoading) "Mengecek..." else "Cek status", fontWeight = FontWeight.ExtraBold)
                }
            }
            Spacer(Modifier.height(10.dp))
            OutlinedButton(
                onClick = onRevoke,
                enabled = !isLoading && status == "pending",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(TembusRadius.Button),
                border = BorderStroke(1.dp, Error.copy(alpha = 0.45f)),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Error)
            ) {
                Text("Batalkan link", fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(10.dp))
        }
        Button(
            onClick = if (link.isBlank()) onCreateLink else onCopy,
            enabled = !isLoading && !isRevoked,
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp),
            shape = RoundedCornerShape(TembusRadius.Button),
            colors = ButtonDefaults.buttonColors(containerColor = LcGreen)
        ) {
            Text(
                when {
                    isLoading -> "Membuat link..."
                    link.isBlank() -> "Buat link lokasi"
                    isRevoked -> "Link dibatalkan"
                    else -> "Salin link"
                },
                fontWeight = FontWeight.ExtraBold
            )
        }
        Spacer(Modifier.height(18.dp))
    }
}
