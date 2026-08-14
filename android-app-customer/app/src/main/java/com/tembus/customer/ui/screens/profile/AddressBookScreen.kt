package com.tembus.customer.ui.screens.profile

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
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
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.CustomerAddress
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryLight

// C5: Address book multi-alamat (tambah/pilih/edit/hapus)
@Composable
fun AddressBookScreen(
    onBack: () -> Unit,
    onSelectAddress: ((CustomerAddress) -> Unit)? = null,
    viewModel: AddressBookViewModel = hiltViewModel()
) {
    val addresses by viewModel.addresses.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val error by viewModel.error.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.loadAddresses()
    }

    var showAddDialog by remember { mutableStateOf(false) }
    var editingAddress by remember { mutableStateOf<CustomerAddress?>(null) }

    Scaffold(
        containerColor = Color(0xFFF7F8FA),
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .background(Color.White)
                    .padding(horizontal = 4.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali", tint = Primary)
                }
                Text("Alamat Tersimpan", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Primary)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { showAddDialog = true }) {
                    Icon(Icons.Default.Add, contentDescription = "Tambah Alamat", tint = Primary)
                }
            }
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
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
                            Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFFCBD5E1), modifier = Modifier.size(48.dp))
                            Spacer(Modifier.height(12.dp))
                            Text("Belum ada alamat tersimpan", color = Color(0xFF64748B), fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(4.dp))
                            Text("Tambah alamat untuk checkout lebih cepat", color = Color(0xFF94A3B8), fontSize = 14.sp)
                        }
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(addresses, key = { it.id }) { address ->
                            AddressCard(
                                address = address,
                                onClick = { onSelectAddress?.invoke(address) },
                                onEdit = { editingAddress = address },
                                onDelete = { viewModel.deleteAddress(address.id) }
                            )
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddressEditDialog(
            address = null,
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
                Icon(Icons.Default.LocationOn, contentDescription = null, tint = Primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    address.label,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    color = Color(0xFF0F172A),
                    modifier = Modifier.weight(1f)
                )
                if (address.isFavorite) {
                    Icon(Icons.Default.Star, contentDescription = "Favorit", tint = Color(0xFFF59E0B), modifier = Modifier.size(18.dp))
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(address.address, fontSize = 13.sp, color = Color(0xFF64748B), maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (!address.contactName.isNullOrBlank()) {
                Text("${address.contactName} • ${address.contactPhoneMasked ?: "-"}", fontSize = 12.sp, color = Color(0xFF94A3B8))
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onEdit) { Text("Edit", color = Primary, fontSize = 13.sp) }
                TextButton(onClick = onDelete) { Text("Hapus", color = Color(0xFFEF4444), fontSize = 13.sp) }
            }
        }
    }
}
