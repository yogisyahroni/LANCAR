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
internal fun PreselectedPromoCard(
    promoCode: String,
    onClear: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = SoftOrange),
        border = BorderStroke(1.dp, Accent.copy(alpha = 0.28f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(MaterialTheme.colorScheme.surface),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.LocalOffer, contentDescription = null, tint = Accent)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Promo disiapkan", color = OnSurface, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                Text(
                    promoCode,
                    color = Accent,
                    fontWeight = FontWeight.Black,
                    fontSize = 14.sp
                )
            }
            TextButton(onClick = onClear) {
                Text("Lepas", color = Primary, fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@Composable
internal fun VoucherCard(
    state: BookingState,
    onCodeChange: (String) -> Unit,
    onApply: () -> Unit,
    onClear: () -> Unit
) {
    var localCode by rememberSaveable { mutableStateOf("") }
    val applied = state.voucherApplied

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(
            containerColor = if (applied) PrimaryPale else MaterialTheme.colorScheme.surface
        ),
        border = BorderStroke(1.dp, if (applied) Success.copy(alpha = 0.5f) else Outline)
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(46.dp)
                        .clip(RoundedCornerShape(TembusRadius.Card))
                        .background(if (applied) PrimarySoft else SoftOrange),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.LocalActivity,
                        contentDescription = null,
                        tint = if (applied) Success else Accent
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("Kode Voucher", color = OnSurface, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                    Text(
                        if (applied) "${state.voucherName} (${state.voucherCode})" else "Diskon tambahan di luar promo",
                        color = if (applied) Success else Muted,
                        fontSize = 12.sp
                    )
                }
                if (applied) {
                    TextButton(onClick = onClear) {
                        Text("Hapus", color = Error, fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
            if (applied) {
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Diskon", fontSize = 13.sp, color = Success, fontWeight = FontWeight.Bold)
                    Text(
                        "− Rp ${state.voucherDiscountIdr.toString().replace(Regex("\\B(?=(\\d{3})+(?!\\d))"), ".")}",
                        fontSize = 14.sp,
                        color = Success,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            } else {
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = localCode,
                        onValueChange = {
                            localCode = it
                            onCodeChange(it)
                        },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("Masukkan kode (mis. HEMAT10)", fontSize = 13.sp) },
                        singleLine = true,
                        shape = RoundedCornerShape(TembusRadius.Input)
                    )
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = onApply,
                        enabled = localCode.isNotBlank() && !state.voucherLoading,
                        shape = RoundedCornerShape(TembusRadius.Button),
                        colors = ButtonDefaults.buttonColors(containerColor = Primary)
                    ) {
                        if (state.voucherLoading) {
                            CircularProgressIndicator(
                                color = MaterialTheme.colorScheme.onPrimary,
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text("Pakai", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                state.voucherError?.let { err ->
                    Spacer(Modifier.height(6.dp))
                    Text(
                        err,
                        color = Error,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}
