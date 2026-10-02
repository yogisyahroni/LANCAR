package com.tembus.merchant.ui.screens.staff

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.*
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.localization.MerchantTextCatalog
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MerchantStaff
import com.tembus.merchant.data.repository.MerchantRepository
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.TembusRadius

/**
 * StaffScreen — M1 (CORPORATE ONLY). Hanya reachable kalau merchant perusahaan
 * (tab Staff conditional di MainScreen). Owner mengundang/mengelola staff.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StaffScreen(
    merchantId: String,
    repository: MerchantRepository,
    onBack: (() -> Unit)? = null,
    viewModel: StaffViewModel = appViewModel { StaffViewModel(repository, merchantId) }
) {
    val state by viewModel.uiState.collectAsState()
    var showInvite by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Manajemen Staff") },
                navigationIcon = {
                    onBack?.let { back ->
                        IconButton(onClick = back) { Icon(Icons.Filled.ArrowBack, contentDescription = "Kembali") }
                    }
                },
                actions = {
                    if (state.canManage) {
                        IconButton(onClick = { showInvite = true }) {
                            Icon(Icons.Filled.PersonAdd, contentDescription = MerchantTextCatalog.translate("Undang Staff"))
                        }
                    }
                }
            )
        }
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.isLoading && state.items.isNotEmpty(),
            onRefresh = viewModel::load,
            modifier = Modifier.fillMaxSize()
        ) {
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (state.isLoading && state.items.isEmpty()) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            } else if (state.items.isEmpty()) {
                Column(
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Belum ada staff", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Undang kasir atau staff dapur untuk bantu kelola toko.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(16.dp))
                    if (state.canManage) {
                        Button(onClick = { showInvite = true }) { Text("Undang Staff") }
                    }
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (!state.canManage) {
                        item {
                            Text(
                                "Mode lihat: akun ini tidak memiliki izin mengelola staff.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    items(state.items) { staff ->
                        StaffCard(
                            staff = staff,
                            canManage = state.canManage,
                            onRevoke = { viewModel.revoke(staff.id) },
                            onRoleChange = { viewModel.updateRole(staff.id, it) },
                            onPermissionsChange = { viewModel.updatePermissions(staff.id, it) }
                        )
                    }
                }
            }

            state.errorMessage?.let { msg ->
                AlertDialog(
                    onDismissRequest = viewModel::clearError,
                    confirmButton = { TextButton(onClick = viewModel::clearError) { Text("OK") } },
                    title = { Text("Perhatian") },
                    text = { Text(msg) }
                )
            }
        }
        }
    }

    if (showInvite) {
        InviteStaffDialog(
            onDismiss = { showInvite = false },
            onInvite = { email, phone, role ->
                viewModel.invite(email, phone, role)
                showInvite = false
            }
        )
    }
}

/** Loads the merchant first so the corporate-only rule is visible in the UI
 * and not just discovered after a rejected staff request. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MerchantStaffRouteScreen(
    repository: MerchantRepository,
    onBack: () -> Unit
) {
    var isLoading by remember { mutableStateOf(true) }
    var merchant by remember { mutableStateOf<com.tembus.merchant.data.model.Merchant?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        repository.getProfile()
            .onSuccess {
                merchant = it
                isLoading = false
            }
            .onFailure {
                errorMessage = it.message ?: "Profil toko belum dapat dimuat"
                isLoading = false
            }
    }

    when {
        isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        merchant?.isCorporate == true -> StaffScreen(
            merchantId = merchant!!.id,
            repository = repository,
            onBack = onBack
        )
        else -> Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Kelola staf") },
                    navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, contentDescription = "Kembali") } }
                )
            }
        ) { padding ->
            Column(
                Modifier.fillMaxSize().padding(padding).padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    errorMessage ?: "Kelola staf hanya tersedia untuk merchant bisnis atau PT.",
                    style = MaterialTheme.typography.bodyLarge
                )
                Spacer(Modifier.height(12.dp))
                Text("Akun perorangan tetap dapat mengelola toko dari akun pemilik.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun StaffCard(
    staff: MerchantStaff,
    canManage: Boolean,
    onRevoke: () -> Unit,
    onRoleChange: (String) -> Unit,
    onPermissionsChange: (Int) -> Unit
) {
    var showPermissions by remember { mutableStateOf(false) }
    val roleLabel = when (staff.role) {
        "manager" -> "Manager"
        "kitchen" -> "Staff Dapur"
        else -> "Kasir"
    }
    val statusLabel = when {
        staff.isPending -> "Menunggu konfirmasi"
        staff.isRevoked -> "Dicabut"
        else -> "Aktif"
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(TembusRadius.Input)
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    staff.staffName ?: staff.staffEmail ?: "Staff baru",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                AssistChip(
                    onClick = {},
                    label = { Text(statusLabel) },
                    colors = AssistChipDefaults.assistChipColors(
                        containerColor = when {
                            staff.isActive -> MaterialTheme.colorScheme.primaryContainer
                            staff.isPending -> MaterialTheme.colorScheme.tertiaryContainer
                            else -> MaterialTheme.colorScheme.surfaceVariant
                        }
                    )
                )
            }
            Spacer(Modifier.height(4.dp))
            Text("Peran: $roleLabel", style = MaterialTheme.typography.bodyMedium)
            staff.staffEmail?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            if (canManage && !staff.isRevoked) {
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    // Ganti peran
                    var expanded by remember { mutableStateOf(false) }
                    Box {
                        OutlinedButton(onClick = { expanded = true }) { Text("Ubah Peran") }
                        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                            DropdownMenuItem(text = { Text("Kasir") }, onClick = { onRoleChange("kasir"); expanded = false })
                            DropdownMenuItem(text = { Text("Staff Dapur") }, onClick = { onRoleChange("kitchen"); expanded = false })
                            DropdownMenuItem(text = { Text("Manager") }, onClick = { onRoleChange("manager"); expanded = false })
                        }
                    }
                    OutlinedButton(
                        onClick = onRevoke,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
                    ) { Text("Cabut") }
                }
                OutlinedButton(
                    onClick = { showPermissions = true },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Filled.Security, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Atur hak akses")
                }
            }
        }
    }
    if (showPermissions) {
        StaffPermissionsDialog(
            staff = staff,
            onDismiss = { showPermissions = false },
            onSave = { permissions ->
                onPermissionsChange(permissions)
                showPermissions = false
            }
        )
    }
}

private data class PermissionOption(val bit: Int, val label: String)

private val permissionOptions = listOf(
    PermissionOption(MerchantStaff.PERM_VIEW_STORE, "Lihat profil dan pesanan"),
    PermissionOption(MerchantStaff.PERM_MANAGE_MENU, "Kelola menu"),
    PermissionOption(MerchantStaff.PERM_ACCEPT_ORDER, "Terima atau tolak pesanan"),
    PermissionOption(MerchantStaff.PERM_UPDATE_PREP, "Perbarui status persiapan"),
    PermissionOption(MerchantStaff.PERM_CHAT_CUSTOMER, "Chat dengan pelanggan"),
    PermissionOption(MerchantStaff.PERM_MANAGE_STAFF, "Kelola staff lain"),
    PermissionOption(MerchantStaff.PERM_VIEW_REPORTS, "Lihat laporan"),
    PermissionOption(MerchantStaff.PERM_MANAGE_PROMO, "Kelola promo")
)

@Composable
private fun StaffPermissionsDialog(
    staff: MerchantStaff,
    onDismiss: () -> Unit,
    onSave: (Int) -> Unit
) {
    var permissions by remember(staff.permissions) { mutableStateOf(staff.permissions) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Hak akses ${staff.staffName ?: "staff"}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    "Pilih pekerjaan yang boleh dilakukan staff ini. Perubahan berlaku setelah disimpan.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                permissionOptions.forEach { option ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(option.label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                        Switch(
                            checked = permissions and option.bit != 0,
                            onCheckedChange = { enabled ->
                                permissions = if (enabled) permissions or option.bit else permissions and option.bit.inv()
                            }
                        )
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { onSave(permissions) }) { Text("Simpan") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Batal") } }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InviteStaffDialog(
    onDismiss: () -> Unit,
    onInvite: (String?, String?, String) -> Unit
) {
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("kasir") }
    var roleExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = { onInvite(email.ifBlank { null }, phone.ifBlank { null }, role) },
                enabled = email.isNotBlank() || phone.isNotBlank()
            ) { Text("Kirim Undangan") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Batal") } },
        title = { Text("Undang Staff") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("Nomor WA") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth()
                )
                Text("Peran", style = MaterialTheme.typography.labelLarge)
                ExposedDropdownMenuBox(
                    expanded = roleExpanded,
                    onExpandedChange = { roleExpanded = it }
                ) {
                    OutlinedTextField(
                        value = when (role) {
                            "manager" -> "Manager"
                            "kitchen" -> "Staff Dapur"
                            else -> "Kasir"
                        },
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Peran") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = roleExpanded) },
                        modifier = Modifier.menuAnchor().fillMaxWidth()
                    )
                    ExposedDropdownMenu(expanded = roleExpanded, onDismissRequest = { roleExpanded = false }) {
                        DropdownMenuItem(text = { Text("Kasir") }, onClick = { role = "kasir"; roleExpanded = false })
                        DropdownMenuItem(text = { Text("Staff Dapur") }, onClick = { role = "kitchen"; roleExpanded = false })
                        DropdownMenuItem(text = { Text("Manager") }, onClick = { role = "manager"; roleExpanded = false })
                    }
                }
                Text(
                    "Undangan dikirim ke email atau nomor yang dipilih. Setelah dikonfirmasi, staf dapat membantu mengelola toko.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    )
}
