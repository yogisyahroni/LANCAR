package com.tembus.customer.ui.screens.profile

import android.Manifest
import android.content.pm.PackageManager
import androidx.compose.foundation.background
import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.CustomerAddress
import com.tembus.customer.data.model.LocationPayload
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryLight

private val AddressCanvas = Color(0xFFF7F8F6) // Figma: TEMBUS - Alamat Tersimpan

// C5: Address book multi-alamat (tambah/pilih/edit/hapus)
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddressBookScreen(
    onBack: () -> Unit,
    onSelectAddress: ((CustomerAddress) -> Unit)? = null,
    viewModel: AddressBookViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    var deviceLocation by remember { mutableStateOf<LocationPayload?>(null) }
    val addresses by viewModel.addresses.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val error by viewModel.error.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.loadAddresses()
        val hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (hasFine || hasCoarse) {
            LocationServices.getFusedLocationProviderClient(context).lastLocation
                .addOnSuccessListener { location ->
                    if (location != null) {
                        deviceLocation = LocationPayload(location.latitude, location.longitude)
                    }
                }
        }
    }

    var showAddDialog by remember { mutableStateOf(false) }
    var editingAddress by remember { mutableStateOf<CustomerAddress?>(null) }
    var query by remember { mutableStateOf("") }
    var selectedFilter by remember { mutableStateOf("Semua") }

    Scaffold(
        containerColor = AddressCanvas,
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .background(AddressCanvas)
                    .padding(horizontal = 4.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"), tint = Primary)
                }
                Text("Alamat Tersimpan", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Primary)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { showAddDialog = true }) {
                    Icon(Icons.Default.Add, contentDescription = CustomerTextCatalog.translate("Tambah Alamat"), tint = Primary)
                }
            }
        },
        bottomBar = {
            Surface(color = AddressCanvas) {
                Button(
                    onClick = { showAddDialog = true },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF7800), contentColor = Color.White),
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Tambah alamat baru", fontWeight = FontWeight.Bold)
                }
            }
        }
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = loading && addresses.isNotEmpty(),
            onRefresh = viewModel::loadAddresses,
            modifier = Modifier.fillMaxSize()
        ) {
        Column(modifier = Modifier.fillMaxSize().background(AddressCanvas).padding(padding)) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                singleLine = true,
                placeholder = { Text("Cari alamat, gedung, atau kantor...", fontSize = 12.sp) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(18.dp)) },
                shape = RoundedCornerShape(22.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.White,
                    unfocusedContainerColor = Color.White,
                    focusedBorderColor = Primary,
                    unfocusedBorderColor = Color(0xFFDCE7DF),
                ),
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf("Semua", "Rumah", "Kantor").forEach { filter ->
                    FilterChip(
                        selected = selectedFilter == filter,
                        onClick = { selectedFilter = filter },
                        label = { Text(filter, fontSize = 11.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = Primary,
                            selectedLabelColor = Color.White,
                            containerColor = Color.White,
                        ),
                    )
                }
            }
            when {
                loading && addresses.isEmpty() -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Primary)
                    }
                }
                error != null && addresses.isEmpty() -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Gagal memuat alamat", color = Color(0xFFEF4444), fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                            TextButton(onClick = { viewModel.loadAddresses() }) {
                                Text("Coba lagi", color = Primary)
                            }
                        }
                    }
                }
                addresses.isEmpty() -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.LocationOn, contentDescription = "", tint = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.size(48.dp))
                            Spacer(Modifier.height(12.dp))
                            Text("Belum ada alamat tersimpan", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(4.dp))
                            Text("Tambah alamat untuk checkout lebih cepat", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                        }
                    }
                }
                else -> {
                    val visibleAddresses = addresses.filter { address ->
                        val matchesQuery = query.isBlank() || listOf(address.label, address.address, address.contactName.orEmpty())
                            .any { it.contains(query, ignoreCase = true) }
                        val matchesFilter = selectedFilter == "Semua" || address.label.contains(selectedFilter, ignoreCase = true)
                        matchesQuery && matchesFilter
                    }
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(visibleAddresses, key = { it.id }) { address ->
                            AddressCard(
                                address = address,
                                onClick = { onSelectAddress?.invoke(address) },
                                onEdit = { editingAddress = address },
                                onDelete = { viewModel.deleteAddress(address.id) }
                            )
                        }
                        if (visibleAddresses.isEmpty()) {
                            item {
                                Text(
                                    "Tidak ada alamat yang cocok",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
        }
    }

    if (showAddDialog) {
        AddressEditDialog(
            address = null,
            currentLocation = deviceLocation,
            onDismiss = { showAddDialog = false },
            onSave = { request ->
                viewModel.createAddress(request)
                showAddDialog = false
            }
        )
    }

    editingAddress?.let { addr ->
        AddressEditDialog(
            address = addr,
            currentLocation = null,
            onDismiss = { editingAddress = null },
            onSave = { request ->
                viewModel.updateAddress(addr.id, request)
                editingAddress = null
            }
        )
    }
}

@Composable
private fun AddressCard(
    address: CustomerAddress,
    onClick: (() -> Unit)? = null,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.LocationOn, contentDescription = "", tint = Primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    address.label,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f)
                )
                if (address.isFavorite) {
                    Icon(Icons.Default.Star, contentDescription = CustomerTextCatalog.translate("Favorit"), tint = Color(0xFFF59E0B), modifier = Modifier.size(18.dp))
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(address.address, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (!address.contactName.isNullOrBlank()) {
                Text("${address.contactName} • ${address.contactPhoneMasked ?: "-"}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onEdit) { Text("Edit", color = Primary, fontSize = 13.sp) }
                TextButton(onClick = onDelete) { Text("Hapus", color = Color(0xFFEF4444), fontSize = 13.sp) }
            }
        }
    }
}
