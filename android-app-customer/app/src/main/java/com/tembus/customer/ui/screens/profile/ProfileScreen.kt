package com.tembus.customer.ui.screens.profile

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.automirrored.filled.Help
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.tembus.customer.data.model.ProfileResponse
import com.tembus.customer.data.model.LoyaltyInfo
import com.tembus.customer.data.security.LocalDeviceSecurityManager
import com.tembus.customer.ui.security.LocalSecuritySettingsPanel
import com.tembus.customer.ui.designsystem.TembusBottomNavigation
import com.tembus.customer.ui.designsystem.TembusNavigationItem
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.OrangeCta
import com.tembus.customer.BuildConfig
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

private val AccountCanvas = Color(0xFFF2FCF3) // Figma: TEMBUS - Akun Pengguna


@Composable
private fun profileTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = MaterialTheme.colorScheme.onSurface,
    unfocusedTextColor = MaterialTheme.colorScheme.onSurface,
    disabledTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
    focusedContainerColor = MaterialTheme.colorScheme.surface,
    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
    disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
    cursorColor = MaterialTheme.colorScheme.primary,
    focusedBorderColor = MaterialTheme.colorScheme.primary,
    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
    disabledBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
    focusedLabelColor = MaterialTheme.colorScheme.primary,
    unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
    disabledLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
    focusedPlaceholderColor = MaterialTheme.colorScheme.onSurfaceVariant,
    unfocusedPlaceholderColor = MaterialTheme.colorScheme.onSurfaceVariant
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    viewModel: ProfileViewModel = hiltViewModel(),
    loyaltyViewModel: LoyaltyViewModel = hiltViewModel(),
    onLogout: () -> Unit,
    onAddressesClick: (() -> Unit)? = null,
    onLanguageClick: () -> Unit = {},
    onLoyaltyClick: () -> Unit = {},
    onPrivacyTermsClick: () -> Unit = {},
    onHelpClick: () -> Unit = {},
    onBusinessClick: () -> Unit = {},
    onRatingClick: () -> Unit = {},
    onTopUpClick: () -> Unit = {},
    onPaymentMethodsClick: () -> Unit = {},
    onHomeClick: () -> Unit = {},
    onHistoryClick: () -> Unit = {},
    onMessagesClick: () -> Unit = {},
    onNotificationsClick: () -> Unit = {},
) {
    val state by viewModel.uiState.collectAsState()
    val loyaltyInfo by loyaltyViewModel.loyaltyInfo.collectAsState()
    val loyaltyLoading by loyaltyViewModel.loading.collectAsState()
    val customerPinState by viewModel.customerPinState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val localSecurityManager = remember(context) {
        LocalDeviceSecurityManager(context.applicationContext)
    }
    var activeDialog by remember { mutableStateOf<ProfileDialog?>(null) }

    LaunchedEffect(Unit) {
        loyaltyViewModel.loadLoyaltyInfo()
    }

    LaunchedEffect(state) {
        val currentState = state as? ProfileUiState.Success ?: return@LaunchedEffect
        val notice = currentState.message ?: currentState.error
        if (!notice.isNullOrBlank()) {
            snackbarHostState.showSnackbar(notice)
            viewModel.consumeProfileNotice()
        }
    }

    LaunchedEffect(customerPinState) {
        val notice = customerPinState.message ?: customerPinState.error
        if (!notice.isNullOrBlank()) {
            snackbarHostState.showSnackbar(notice)
            viewModel.consumeCustomerPinNotice()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        bottomBar = {
            TembusBottomNavigation(
                items = listOf(
                    TembusNavigationItem("Beranda", Icons.Default.LocalShipping, false, onHomeClick),
                    TembusNavigationItem("Aktivitas", Icons.Default.History, false, onHistoryClick),
                    TembusNavigationItem("Pesan", Icons.Default.ChatBubbleOutline, false, onMessagesClick),
                    TembusNavigationItem("Notifikasi", Icons.Default.NotificationsActive, false, onNotificationsClick),
                    TembusNavigationItem("Akun", Icons.Default.Person, true, onClick = {}),
                ),
            )
        },
        containerColor = AccountCanvas
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(AccountCanvas)
                .padding(padding)
        ) {
            when (val currentState = state) {
                is ProfileUiState.Loading, ProfileUiState.Idle -> ProfileLoadingState()
                is ProfileUiState.Error -> ProfileErrorState(
                    message = currentState.message,
                    onRetry = viewModel::fetchProfile
                )
                is ProfileUiState.Success -> ProfileContent(
                    profile = currentState.profile,
                    onEditClick = { activeDialog = ProfileDialog.Edit },
                    onAddressesClick = {
                        onAddressesClick?.invoke() ?: run { activeDialog = ProfileDialog.Addresses }
                    },
                    onLanguageClick = onLanguageClick,
                    onLoyaltyClick = onLoyaltyClick,
                    onPrivacyTermsClick = onPrivacyTermsClick,
                    onSettingsClick = { activeDialog = ProfileDialog.Settings },
                    onSecurityClick = { activeDialog = ProfileDialog.Security },
                    onHelpClick = onHelpClick,
                    onBusinessClick = onBusinessClick,
                    onRatingClick = onRatingClick,
                    onNotificationsClick = onNotificationsClick,
                     onWithdrawClick = { activeDialog = ProfileDialog.Withdraw },
                     onTopUpClick = onTopUpClick,
                     onPaymentMethodsClick = onPaymentMethodsClick,
                     loyaltyInfo = loyaltyInfo,
                    loyaltyLoading = loyaltyLoading,
                    onLogout = { viewModel.logout(onLogout) }
                )
            }
        }
    }

    val currentProfile = (state as? ProfileUiState.Success)?.profile
    when (activeDialog) {
        ProfileDialog.Edit -> if (currentProfile != null) {
            EditProfileDialog(
                profile = currentProfile,
                isUpdating = (state as? ProfileUiState.Success)?.isUpdating == true,
                onDismiss = { activeDialog = null },
                onSubmit = { name, phone ->
                    viewModel.updateProfile(name, phone)
                    activeDialog = null
                }
            )
        }
        ProfileDialog.Settings -> SettingsDialog(
            onDismiss = { activeDialog = null },
            onRefresh = {
                activeDialog = null
                viewModel.fetchProfile()
            }
        )
        ProfileDialog.Security -> SecurityDialog(
            securityManager = localSecurityManager,
            customerPinState = customerPinState,
            onDismiss = { activeDialog = null },
            onNotice = { message ->
                scope.launch { snackbarHostState.showSnackbar(message) }
            },
            onChangeCustomerPin = viewModel::changeCustomerPin,
            onLogout = {
                activeDialog = null
                viewModel.logout(onLogout)
            }
        )
        ProfileDialog.Help -> HelpDialog(onDismiss = { activeDialog = null })
        ProfileDialog.Withdraw -> if (currentProfile != null) {
            WithdrawDialog(
                walletBalance = currentProfile.walletBalance,
                onDismiss = { activeDialog = null },
                onSuccess = {
                    activeDialog = null
                    viewModel.fetchProfile() // Refresh saldo setelah withdrawal
                }
            )
        }
        ProfileDialog.Addresses -> {
            AddressBookScreen(
                onBack = { activeDialog = null },
                onSelectAddress = null
            )
        }
        null -> Unit
    }
}

@Composable
private fun ProfileContent(
    profile: ProfileResponse,
    loyaltyInfo: LoyaltyInfo?,
    loyaltyLoading: Boolean,
    onEditClick: () -> Unit,
    onAddressesClick: () -> Unit,
    onLanguageClick: () -> Unit,
    onLoyaltyClick: () -> Unit,
    onPrivacyTermsClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onSecurityClick: () -> Unit,
    onHelpClick: () -> Unit,
    onBusinessClick: () -> Unit,
    onRatingClick: () -> Unit,
    onNotificationsClick: () -> Unit,
    onWithdrawClick: () -> Unit,
    onTopUpClick: () -> Unit,
    onPaymentMethodsClick: () -> Unit,
    onLogout: () -> Unit
) {
    val primaryContact = profile.email.ifBlank {
        profile.phoneNumber.ifBlank { "Kontak belum dilengkapi" }
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(top = 6.dp, bottom = 28.dp),
    ) {
        AccountChromeHeader()
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            AvatarBadge(name = profile.name, imageUrl = profile.profileImageUrl, size = 54.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = profile.name.ifBlank { "Pelanggan TEMBUS" },
                    fontWeight = FontWeight.Black,
                    letterSpacing = (-0.3).sp,
                    fontSize = 18.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(primaryContact, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("Customer TEMBUS", color = Primary, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            }
            IconButton(onClick = onEditClick) {
                Icon(Icons.Default.Edit, contentDescription = "Ubah profil", tint = Primary, modifier = Modifier.size(19.dp))
            }
        }

        Spacer(Modifier.height(16.dp))
        WalletCard(
            balance = profile.walletBalance,
            onWithdrawClick = onWithdrawClick,
            onTopUpClick = onTopUpClick
        )
        Spacer(Modifier.height(14.dp))
        MembershipSummaryCard(
            info = loyaltyInfo,
            isLoading = loyaltyLoading,
            onClick = onLoyaltyClick,
        )
        Spacer(Modifier.height(14.dp))

        ProfileMenuSection(
            title = "PENGATURAN TRANSAKSI & BISNIS",
            items = listOf(
                AccountMenuItem(Icons.Default.LocationOn, "Alamat Tersimpan", "Kelola alamat tersimpan", onAddressesClick),
                AccountMenuItem(Icons.Default.AccountBalanceWallet, "Metode Pembayaran", "TEMBUS-Pay dan metode pembayaran", onPaymentMethodsClick),
                AccountMenuItem(Icons.Default.Description, "Profil Bisnis & E-Faktur", "Kelola faktur dan profil bisnis", onBusinessClick),
            ),
        )
        Spacer(Modifier.height(14.dp))
        ProfileMenuSection(
            title = "PREFERENSI LAYANAN & KEAMANAN",
            items = listOf(
                AccountMenuItem(Icons.Default.People, "Kontak Darurat Keluarga", "Atur kontak untuk keadaan darurat", onSettingsClick),
                AccountMenuItem(Icons.Default.NotificationsActive, "Notifikasi & Pesan Siaga", "Update status, promo, dan pengingat", onNotificationsClick),
                AccountMenuItem(Icons.Default.Shield, "Keamanan & PIN Transaksi", "PIN akun dan perlindungan perangkat", onSecurityClick),
                AccountMenuItem(Icons.Default.Language, "Bahasa & Satuan Jarak", "Bahasa Indonesia • Kilometer", onLanguageClick),
            ),
        )
        Spacer(Modifier.height(14.dp))
        ProfileMenuSection(
            title = "BANTUAN & LEGALITAS",
            items = listOf(
                AccountMenuItem(Icons.AutoMirrored.Filled.Help, "Pusat Bantuan & CS 24 Jam", "Bantuan untuk order dan akun", onHelpClick),
                AccountMenuItem(Icons.Default.Description, "Privasi & Ketentuan Layanan", "Kebijakan dan ketentuan TEMBUS", onPrivacyTermsClick),
                AccountMenuItem(Icons.Default.Star, "Beri Rating TEMBUS", "Bagikan pengalamanmu", onRatingClick),
            ),
        )

        Spacer(Modifier.height(14.dp))
        Spacer(Modifier.height(4.dp))
        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = OrangeCta),
            border = BorderStroke(1.dp, OrangeCta.copy(alpha = 0.6f))
        ) {
            Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "")
            Spacer(Modifier.width(8.dp))
            Text("Keluar dari Akun", fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(24.dp))
        Text(
            text = "Versi Aplikasi: ${BuildConfig.VERSION_NAME}",
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium
        )
        Spacer(Modifier.height(24.dp))
    }
}

private data class AccountMenuItem(
    val icon: ImageVector,
    val label: String,
    val description: String,
    val onClick: () -> Unit,
)

@Composable
private fun ProfileMenuSection(
    title: String,
    items: List<AccountMenuItem>,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            title,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 9.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 0.7.sp,
        )
        Spacer(Modifier.height(6.dp))
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        ) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 3.dp)) {
                items.forEachIndexed { index, item ->
                    MenuRow(
                        icon = item.icon,
                        label = item.label,
                        description = item.description,
                        onClick = item.onClick,
                        showDivider = index < items.lastIndex,
                    )
                }
            }
        }
    }
}

@Composable
private fun MembershipSummaryCard(
    info: LoyaltyInfo?,
    isLoading: Boolean,
    onClick: () -> Unit,
) {
    val title = info?.nextTier?.takeIf { it.isNotBlank() }?.let { "Menuju $it Prioritas" }
        ?: info?.tier?.takeIf { it.isNotBlank() }?.let { "Member $it" }
        ?: "Keanggotaan TEMBUS"
    val detail = when {
        info?.nextTier?.isNotBlank() == true ->
            "Kurang ${info.pointsToNextTier} poin lagi • diskon ${info.nextTierDiscountPct ?: 0}%"
        info?.tier?.isNotBlank() == true -> "Status dan benefit mengikuti akun TEMBUS kamu"
        isLoading -> "Memuat status keanggotaan dari server"
        else -> "Lihat status dan benefit keanggotaan"
    }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF8EA)),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, Color(0xFFF0D9A7)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 13.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(11.dp))
                    .background(Color(0xFFFFE8B3)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFB7791F), modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, fontSize = 12.sp, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.onSurface)
                Text(detail, fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (info != null && info.nextTier != null) {
                    LinearProgressIndicator(
                        progress = { info.progressPct.coerceIn(0, 100) / 100f },
                        modifier = Modifier.fillMaxWidth().height(5.dp).clip(CircleShape),
                        color = Color(0xFFD39B2A),
                        trackColor = Color(0xFFF2E2BE),
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color(0xFF9A7428), modifier = Modifier.size(19.dp))
        }
    }
}

@Composable
private fun AvatarBadge(
    name: String,
    imageUrl: String? = null,
    size: androidx.compose.ui.unit.Dp = 112.dp,
) {
    val initial = name.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "L"
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(Primary.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center
    ) {
        if (!imageUrl.isNullOrBlank()) {
            AsyncImage(
                model = imageUrl,
                contentDescription = "Foto profil",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else if (initial == "L") {
            Icon(
                Icons.Default.Person,
                contentDescription = "",
                modifier = Modifier.size(size * 0.46f),
                tint = Primary
            )
        } else {
            Text(
                text = initial,
                color = Primary,
                fontSize = if (size < 80.dp) 22.sp else 42.sp,
                fontWeight = FontWeight.Black
            )
        }
    }
}

@Composable
private fun WalletCard(
    balance: Long,
    onWithdrawClick: () -> Unit,
    onTopUpClick: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF006640)),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(34.dp).clip(CircleShape).background(Color(0xFFE4F4EC)), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.AccountBalanceWallet, contentDescription = "Saldo TEMBUS-Pay", tint = Color(0xFF006640), modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("SALDO TEMBUS-PAY", color = Color(0xFFA9D4C0), fontSize = 9.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.35.sp)
                Text(formatRupiah(balance), color = Color.White, fontWeight = FontWeight.Black, fontSize = 17.sp, maxLines = 1)
            }
            Surface(onClick = onTopUpClick, color = Color(0xFFFF7800), shape = RoundedCornerShape(999.dp)) {
                Row(Modifier.padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Add, contentDescription = null, tint = Color.White, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(3.dp))
                    Text("Top up", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Black)
                }
            }
            Spacer(Modifier.width(7.dp))
            IconButton(onClick = onWithdrawClick, enabled = balance > 0L, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Default.AccountBalanceWallet, contentDescription = "Tarik dana", tint = if (balance > 0L) Color.White else Color.White.copy(alpha = 0.35f), modifier = Modifier.size(17.dp))
            }
        }
    }
}

@Composable
private fun AccountChromeHeader() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "TEMBUS",
            color = Color(0xFF005E3D),
            fontSize = 16.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 0.3.sp,
        )
        Spacer(Modifier.width(8.dp))
        Surface(
            color = Color(0xFFFFF7F1),
            shape = RoundedCornerShape(999.dp),
            border = BorderStroke(1.dp, Color(0xFFFF7800).copy(alpha = 0.28f)),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = Color(0xFFFF7800),
                    modifier = Modifier.size(12.dp),
                )
                Spacer(Modifier.width(3.dp))
                Text("Pilih area", color = MaterialTheme.colorScheme.onSurface, fontSize = 10.sp)
            }
        }
    }
}

@Composable
private fun ProfileStatusCard(profile: ProfileResponse) {
    val verifiedPhoneNumber = profile.phoneNumber.asPhoneDisplay()
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                text = "Status Akun",
                fontWeight = FontWeight.Black,
                letterSpacing = (-0.5).sp,
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurface
            )
            StatusRow(Icons.Default.VerifiedUser, "Identitas", if (profile.name.isNotBlank()) "Lengkap" else "Perlu dilengkapi")
            StatusRow(
                Icons.Default.Email,
                "Kontak utama",
                profile.email.ifBlank { profile.phoneNumber.ifBlank { "Perlu dilengkapi" } }
            )
            StatusRow(
                Icons.Default.NotificationsActive,
                "Nomor handphone",
                verifiedPhoneNumber
            )
            StatusRow(Icons.Default.Security, "Proteksi sesi", "Encrypted session aktif")
        }
    }
}

@Composable
private fun StatusRow(icon: ImageVector, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = "", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
            Text(
                value,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun MenuRow(
    icon: ImageVector,
    label: String,
    description: String? = null,
    onClick: () -> Unit,
    showDivider: Boolean = true
) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        color = Color.Transparent
    ) {
        Row(
            modifier = Modifier.padding(vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = "", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
            }
            Spacer(Modifier.width(11.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.SemiBold)
                if (!description.isNullOrBlank()) {
                    Text(
                        description,
                        fontSize = 8.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Icon(Icons.Default.ChevronRight, contentDescription = "", tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
        }
    }
    if (showDivider) HorizontalDivider(thickness = 0.5.dp, color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
}

@Composable
private fun EditProfileDialog(
    profile: ProfileResponse,
    isUpdating: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String, String) -> Unit
) {
    var name by remember(profile.id) { mutableStateOf(profile.name) }
    var phone by remember(profile.id) { mutableStateOf(profile.phoneNumber.takeIf { !it.contains("@") }.orEmpty()) }
    val canSubmit = name.trim().length >= 2 && !isUpdating

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Ubah Profil", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nama lengkap") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = profileTextFieldColors()
                )
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("Nomor handphone") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = profileTextFieldColors()
                )
                Text(
                    text = "Perubahan disimpan ke database TEMBUS dan tersinkron ke sesi aplikasi.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSubmit(name, phone) },
                enabled = canSubmit,
                colors = ButtonDefaults.buttonColors(containerColor = Primary)
            ) {
                if (isUpdating) {
                    Box(
                        modifier = Modifier
                            .size(16.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.82f))
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Text("Simpan")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Batal")
            }
        }
    )
}

@Composable
private fun SettingsDialog(onDismiss: () -> Unit, onRefresh: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Pengaturan Aplikasi", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                StatusRow(Icons.Default.NotificationsActive, "Notifikasi", "Mengikuti preferensi sistem perangkat")
                StatusRow(Icons.Default.Refresh, "Konfigurasi peta", "Disinkronkan otomatis tanpa update aplikasi")
                Text(
                    text = "Gunakan sinkronisasi untuk mengambil konfigurasi terbaru dari server.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp
                )
            }
        },
        confirmButton = {
            Button(onClick = onRefresh, colors = ButtonDefaults.buttonColors(containerColor = Primary)) {
                Text("Sinkronkan")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Tutup")
            }
        }
    )
}

@Composable
private fun SecurityDialog(
    securityManager: LocalDeviceSecurityManager,
    customerPinState: CustomerPinUiState,
    onDismiss: () -> Unit,
    onNotice: (String) -> Unit,
    onChangeCustomerPin: (String, String) -> Unit,
    onLogout: () -> Unit
) {
    var showCustomerPinDialog by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Keamanan Akun", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                StatusRow(Icons.Default.Lock, "Penyimpanan token", "EncryptedSharedPreferences aktif")
                StatusRow(Icons.Default.Shield, "Verifikasi sesi", "OTP hanya untuk registrasi dan perangkat baru")
                LocalSecuritySettingsPanel(
                    securityManager = securityManager,
                    onNotice = onNotice
                )
                OutlinedButton(
                    onClick = { showCustomerPinDialog = true },
                    enabled = !customerPinState.isUpdating,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Lock, contentDescription = "")
                    Spacer(Modifier.width(8.dp))
                    Text("Ubah PIN akun / transaksi")
                }
                Text(
                    text = "PIN akun diverifikasi server untuk aksi akun/transaksi. PIN dan biometrik perangkat tetap diproses lokal di HP ini.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp
                )
            }
        },
        confirmButton = {
            OutlinedButton(
                onClick = onLogout,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.6f))
            ) {
                Text("Keluar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Tutup")
            }
        }
    )

    if (showCustomerPinDialog) {
        ChangeCustomerPinDialog(
            isUpdating = customerPinState.isUpdating,
            errorMessage = customerPinState.error,
            successMessage = customerPinState.message,
            onDismiss = { showCustomerPinDialog = false },
            onSubmit = onChangeCustomerPin,
        )
    }
}

@Composable
private fun ChangeCustomerPinDialog(
    isUpdating: Boolean,
    errorMessage: String?,
    successMessage: String?,
    onDismiss: () -> Unit,
    onSubmit: (String, String) -> Unit,
) {
    var currentPin by remember { mutableStateOf("") }
    var newPin by remember { mutableStateOf("") }
    var confirmPin by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { if (!isUpdating) onDismiss() },
        title = { Text("Ubah PIN akun", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("PIN akun berbeda dari PIN perangkat. Jangan gunakan PIN yang sama dengan akun lain.", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(
                    value = currentPin,
                    onValueChange = { currentPin = it.filter(Char::isDigit).take(6) },
                    label = { Text("PIN saat ini") },
                    singleLine = true,
                    enabled = !isUpdating,
                    visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.NumberPassword),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = newPin,
                    onValueChange = { newPin = it.filter(Char::isDigit).take(6) },
                    label = { Text("PIN baru") },
                    singleLine = true,
                    enabled = !isUpdating,
                    visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.NumberPassword),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = confirmPin,
                    onValueChange = { confirmPin = it.filter(Char::isDigit).take(6) },
                    label = { Text("Ulangi PIN baru") },
                    singleLine = true,
                    enabled = !isUpdating,
                    visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.NumberPassword),
                    modifier = Modifier.fillMaxWidth(),
                )
                (localError ?: errorMessage)?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                successMessage?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    localError = when {
                        currentPin.length != 6 || newPin.length != 6 || confirmPin.length != 6 -> "Semua PIN harus 6 digit."
                        newPin != confirmPin -> "Konfirmasi PIN baru belum sama."
                        else -> null
                    }
                    if (localError == null) onSubmit(currentPin, newPin)
                },
                enabled = !isUpdating,
            ) { if (isUpdating) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Simpan") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !isUpdating) { Text("Tutup") } },
    )
}

@Composable
private fun HelpDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
    // S2-CUSTOMER-04: WhatsApp CS deep link — nomor bisa diganti via env/config
    val whatsappNumber = "6285156448966"
    val whatsappUrl = "https://wa.me/$whatsappNumber?text=Halo%20TEMBUS%2C%20saya%20butuh%20bantuan."

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Pusat Bantuan", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Tim operasional TEMBUS siap membantu kendala akun, pembayaran, dan pengiriman.")
                Text("Email: bantuan@tembus.com", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("WhatsApp: +62 851-5644-8966", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = {
            // WhatsApp sebagai channel utama (lebih cepat)
            Button(
                onClick = {
                    val intent = Intent(Intent.ACTION_VIEW).apply {
                        data = Uri.parse(whatsappUrl)
                    }
                    try {
                        context.startActivity(intent)
                    } catch (_: ActivityNotFoundException) {
                        // Fallback ke email kalau WhatsApp tidak terinstall
                        val emailIntent = Intent(Intent.ACTION_SENDTO).apply {
                            data = Uri.parse("mailto:support@tembus.id")
                            putExtra(Intent.EXTRA_SUBJECT, "Bantuan aplikasi customer TEMBUS")
                        }
                        try { context.startActivity(emailIntent) } catch (_: Exception) { }
                    }
                    onDismiss()
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF25D366))
            ) {
                Text("Chat WhatsApp CS", color = Color.White)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Tutup")
            }
        }
    )
}

@Composable
private fun ProfileLoadingState() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant)
        )
        Spacer(Modifier.height(18.dp))
        Box(
            modifier = Modifier
                .width(180.dp)
                .height(22.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
        )
        Spacer(Modifier.height(8.dp))
        Box(
            modifier = Modifier
                .width(132.dp)
                .height(14.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
        )
        Spacer(Modifier.height(28.dp))
        repeat(3) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(86.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(MaterialTheme.colorScheme.surface)
            )
            Spacer(Modifier.height(16.dp))
        }
        Text("Memuat profil...", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ProfileErrorState(message: String, onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(Icons.Default.Security, contentDescription = "", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(48.dp))
            Spacer(Modifier.height(12.dp))
            Text("Profil belum tersinkron", fontWeight = FontWeight.Bold, fontSize = 20.sp)
            Spacer(Modifier.height(6.dp))
            Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(16.dp))
            Button(onClick = onRetry, colors = ButtonDefaults.buttonColors(containerColor = Primary)) {
                Text("Coba Lagi")
            }
        }
    }
}

private fun formatRupiah(value: Long): String {
    val formatter = NumberFormat.getCurrencyInstance(Locale("id", "ID"))
    formatter.maximumFractionDigits = 0
    return formatter.format(value).replace("Rp", "Rp ").replace(",00", "")
}

private fun String.asPhoneDisplay(): String {
    val normalized = trim()
    return if (normalized.isBlank() || normalized.contains("@")) "Perlu dilengkapi" else normalized
}

private enum class ProfileDialog {
    Edit,
    Addresses,
    Settings,
    Security,
    Help,
    Withdraw
}
