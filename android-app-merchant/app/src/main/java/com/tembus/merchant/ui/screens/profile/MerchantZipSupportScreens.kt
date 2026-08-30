package com.tembus.merchant.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarOutline
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MerchantOperatingHour
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.TembusRadius
import java.util.Locale

@Composable
fun OperatingHoursScreen(
    onBack: () -> Unit,
    viewModel: OperatingHoursViewModel = appViewModel { OperatingHoursViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()
    var draft by remember(state.hours) { mutableStateOf(state.hours) }
    var showClosureDialog by remember { mutableStateOf(false) }
    var closureDate by remember { mutableStateOf("") }
    var closureLabel by remember { mutableStateOf("") }

    MerchantZipDetailScaffold(title = "Operating Hours", onBack = onBack) {
        when {
            state.isLoading -> Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Primary)
            }
            state.errorMessage != null && state.hours.isEmpty() -> MerchantZipEmptyState(
                message = state.errorMessage ?: "Jam operasional belum tersedia dari backend.",
                onRetry = viewModel::load
            )
            else -> {
                Text(
                    "Set your regular store hours. Customers will only be able to place orders when your store is open.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(20.dp))
                MerchantZipInfoCard {
                    weeklyDays.forEachIndexed { index, day ->
                        val hour = draft.firstOrNull { it.weekday == day.weekday }
                            ?: MerchantOperatingHour(weekday = day.weekday, isOpen = false)
                        Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(day.label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                Switch(
                                    checked = hour.isOpen,
                                    enabled = !state.isSaving,
                                    onCheckedChange = { isOpen ->
                                        draft = draft.replaceOperatingHour(hour.copy(isOpen = isOpen, opensAt = if (isOpen) hour.opensAt ?: "09:00" else null, closesAt = if (isOpen) hour.closesAt ?: "21:00" else null))
                                    }
                                )
                            }
                            Spacer(Modifier.height(8.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                OutlinedTextField(
                                    value = hour.opensAt.orEmpty(),
                                    onValueChange = { value -> draft = draft.replaceOperatingHour(hour.copy(opensAt = value.take(5))) },
                                    label = { Text("Open") },
                                    enabled = hour.isOpen && !state.isSaving,
                                    singleLine = true,
                                    supportingText = { Text(if (hour.isOpen) "HH:MM" else "Closed") },
                                    modifier = Modifier.weight(1f)
                                )
                                Spacer(Modifier.width(8.dp))
                                Text("–")
                                Spacer(Modifier.width(8.dp))
                                OutlinedTextField(
                                    value = hour.closesAt.orEmpty(),
                                    onValueChange = { value -> draft = draft.replaceOperatingHour(hour.copy(closesAt = value.take(5))) },
                                    label = { Text("Close") },
                                    enabled = hour.isOpen && !state.isSaving,
                                    singleLine = true,
                                    supportingText = { Text(if (hour.isOpen) "HH:MM" else "Closed") },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                        if (index < weeklyDays.lastIndex) HorizontalDivider()
                    }
                }
                Spacer(Modifier.height(24.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Special Closures", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    TextButton(onClick = { showClosureDialog = true }, enabled = !state.isSaving) { Text("Add Holiday") }
                }
                if (state.closures.isEmpty()) {
                    Text("No special closures have been added.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    MerchantZipInfoCard {
                        state.closures.forEachIndexed { index, closure ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Column {
                                    Text(closure.label, fontWeight = FontWeight.SemiBold)
                                    Text(closure.closureDate, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                TextButton(onClick = { viewModel.deleteClosure(closure.id) }, enabled = !state.isSaving) { Text("Delete") }
                            }
                            if (index < state.closures.lastIndex) HorizontalDivider()
                        }
                    }
                }
                state.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                state.saveMessage?.let { Text(it, color = Color(0xFF15803D), style = MaterialTheme.typography.bodySmall) }
                Spacer(Modifier.height(20.dp))
                Button(
                    onClick = { viewModel.save(draft.normalizedOperatingHours()) },
                    enabled = !state.isSaving && draft.size == 7,
                    modifier = Modifier.fillMaxWidth()
                ) { Text(if (state.isSaving) "Saving…" else "Save Schedule") }
            }
        }
    }

    if (showClosureDialog) {
        AlertDialog(
            onDismissRequest = { if (!state.isSaving) showClosureDialog = false },
            title = { Text("Add Holiday") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("The store will remain closed for this local date.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedTextField(value = closureLabel, onValueChange = { closureLabel = it.take(120) }, label = { Text("Holiday name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    OutlinedTextField(value = closureDate, onValueChange = { closureDate = it.take(10) }, label = { Text("Date (YYYY-MM-DD)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                }
            },
            dismissButton = { TextButton(onClick = { showClosureDialog = false }, enabled = !state.isSaving) { Text("Cancel") } },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.addClosure(closureDate.trim(), closureLabel.trim()); showClosureDialog = false },
                    enabled = !state.isSaving && closureLabel.isNotBlank() && closureDate.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))
                ) { Text("Add") }
            }
        )
    }
}

private data class OperatingDay(val weekday: Int, val label: String)
private val weeklyDays = listOf(
    OperatingDay(1, "Monday"), OperatingDay(2, "Tuesday"), OperatingDay(3, "Wednesday"),
    OperatingDay(4, "Thursday"), OperatingDay(5, "Friday"), OperatingDay(6, "Saturday"), OperatingDay(0, "Sunday")
)

private fun List<MerchantOperatingHour>.replaceOperatingHour(updated: MerchantOperatingHour): List<MerchantOperatingHour> =
    (filterNot { it.weekday == updated.weekday } + updated).sortedBy { weeklyDays.indexOfFirst { day -> day.weekday == it.weekday } }

private fun List<MerchantOperatingHour>.normalizedOperatingHours(): List<MerchantOperatingHour> =
    weeklyDays.map { day -> firstOrNull { it.weekday == day.weekday } ?: MerchantOperatingHour(day.weekday, false) }

/** ZIP Edit Public Profile route, using only profile fields supplied by the API. */
@Composable
fun EditPublicProfileScreen(
    onBack: () -> Unit,
    viewModel: ProfileViewModel = appViewModel {
        ProfileViewModel(it.merchantRepository, it.authRepository, it.sessionManager)
    }
) {
    val state by viewModel.uiState.collectAsState()
    var storeName by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }

    androidx.compose.runtime.LaunchedEffect(state.merchant?.id) {
        state.merchant?.let {
            storeName = it.namaToko
            address = it.alamat
        }
    }
    MerchantZipDetailScaffold(title = "Edit Public Profile", onBack = onBack) {
        when {
            state.isLoading -> Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Primary)
            }
            state.merchant == null -> MerchantZipEmptyState(
                message = state.errorMessage ?: "Profil toko belum tersedia dari backend.",
                onRetry = viewModel::load
            )
            else -> {
                val merchant = state.merchant!!
                MerchantZipInfoCard {
                    Text(
                        "Update the information customers see on your store profile.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    OutlinedTextField(
                        value = storeName,
                        onValueChange = { storeName = it.take(150) },
                        label = { Text("Store Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = address,
                        onValueChange = { address = it.take(500) },
                        label = { Text("Address") },
                        minLines = 3,
                        modifier = Modifier.fillMaxWidth()
                    )
                    MerchantZipReadOnlyField("Jam operasional", "${merchant.jamBuka ?: "-"} - ${merchant.jamTutup ?: "-"}")
                    MerchantZipReadOnlyField("Status verifikasi", merchant.verificationStatus)
                    state.profileSaveError?.let { error ->
                        Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    if (state.profileSaved) {
                        Text("Public profile saved.", color = Color(0xFF15803D), style = MaterialTheme.typography.bodySmall)
                    }
                    Button(
                        onClick = { viewModel.updatePublicProfile(storeName, address) },
                        enabled = storeName.isNotBlank() && address.isNotBlank() && !state.isSavingProfile,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (state.isSavingProfile) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        else Text("SAVE PROFILE")
                    }
                }
            }
        }
    }
}

/** ZIP Customer Reviews route. Individual reviews are shown only when the API exposes them. */
@Composable
fun CustomerReviewsScreen(
    onBack: () -> Unit,
    viewModel: CustomerReviewsViewModel = appViewModel {
        CustomerReviewsViewModel(it.merchantRepository)
    }
) {
    val state by viewModel.uiState.collectAsState()
    var replyingTo by remember { mutableStateOf<com.tembus.merchant.data.model.MerchantReview?>(null) }
    val visibleReviews = when (state.activeFilter) {
        CustomerReviewFilter.ALL -> state.reviews
        CustomerReviewFilter.FIVE_STARS -> state.reviews.filter { it.stars == 5 }
        CustomerReviewFilter.UNREPLIED -> state.reviews.filter { it.reply == null }
    }
    MerchantZipDetailScaffold(title = "Customer Reviews", onBack = onBack) {
        when {
            state.isLoading -> Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Primary)
            }
            state.errorMessage != null -> MerchantZipEmptyState(
                message = state.errorMessage ?: "Gagal memuat review customer",
                onRetry = viewModel::load
            )
            else -> {
                val merchant = state.merchant
                if (merchant == null) {
                    MerchantZipEmptyState("Profil toko belum tersedia dari backend.", onRetry = viewModel::load)
                } else {
                    Text("Ulasan Pelanggan", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text(
                        "Pantau kepuasan pelanggan dan tanggapi masukan mereka.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    MerchantReviewSummaryCard(
                        average = merchant.avgRating,
                        total = merchant.ratingCount,
                        distribution = state.ratingDistribution
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ReviewFilterChip("Semua", state.activeFilter == CustomerReviewFilter.ALL) {
                            viewModel.setFilter(CustomerReviewFilter.ALL)
                        }
                        ReviewFilterChip("5 ★", state.activeFilter == CustomerReviewFilter.FIVE_STARS) {
                            viewModel.setFilter(CustomerReviewFilter.FIVE_STARS)
                        }
                        ReviewFilterChip("Belum Dibalas", state.activeFilter == CustomerReviewFilter.UNREPLIED) {
                            viewModel.setFilter(CustomerReviewFilter.UNREPLIED)
                        }
                    }
                    state.replyError?.let { error ->
                        MerchantZipInfoCard {
                            Text(error, color = MaterialTheme.colorScheme.error)
                            TextButton(onClick = viewModel::clearReplyError) { Text("Tutup") }
                        }
                    }
                    if (visibleReviews.isEmpty()) {
                        MerchantZipEmptyState(
                            if (state.reviews.isEmpty()) "Belum ada review customer." else "Tidak ada review untuk filter ini."
                        )
                    } else {
                        visibleReviews.forEach { review ->
                            CustomerReviewCard(review, onReply = { replyingTo = review })
                        }
                    }
                }
            }
        }
    }

    replyingTo?.let { review ->
        MerchantReviewReplyDialog(
            review = review,
            isSaving = state.isReplying,
            onDismiss = { if (!state.isReplying) replyingTo = null },
            onSubmit = { body ->
                viewModel.replyToReview(review.id, body)
                replyingTo = null
            }
        )
    }
}

@Composable
private fun MerchantReviewSummaryCard(
    average: Double,
    total: Int,
    distribution: List<com.tembus.merchant.data.model.MerchantRatingBucket>
) {
    MerchantZipInfoCard {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(String.format(Locale.US, "%.1f", average), style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold, color = Primary)
            Row {
                repeat(5) { index ->
                    Icon(
                        if (index < average.toInt()) Icons.Filled.Star else Icons.Filled.StarOutline,
                        contentDescription = null,
                        tint = Color(0xFFF97316),
                        modifier = Modifier.size(22.dp)
                    )
                }
            }
            Text("Berdasarkan $total ulasan", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        (5 downTo 1).forEach { stars ->
            val count = distribution.firstOrNull { it.stars == stars }?.count ?: 0
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("$stars Bintang", style = MaterialTheme.typography.labelMedium, modifier = Modifier.width(70.dp))
                LinearProgressIndicator(
                    progress = { if (total > 0) count.toFloat() / total else 0f },
                    modifier = Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(4.dp)),
                    color = Primary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )
                Text("$count", modifier = Modifier.width(28.dp).padding(start = 8.dp), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun ReviewFilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) }
    )
}

@Composable
private fun CustomerReviewCard(
    review: com.tembus.merchant.data.model.MerchantReview,
    onReply: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.size(40.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(review.reviewerName.initials(), fontWeight = FontWeight.Bold, color = Primary)
                        }
                    }
                    Spacer(Modifier.size(8.dp))
                    Column {
                        Text(review.reviewerName.ifBlank { "Customer" }, fontWeight = FontWeight.Bold)
                        Text(review.createdAt.take(10), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Row {
                    repeat(5) { index ->
                        Icon(
                            if (index < review.stars.coerceIn(0, 5)) Icons.Filled.Star else Icons.Filled.StarOutline,
                            contentDescription = null,
                            tint = if (index < review.stars.coerceIn(0, 5)) Color(0xFFF97316) else MaterialTheme.colorScheme.outlineVariant,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
            if (review.comment.isNotBlank()) {
                Text(review.comment, style = MaterialTheme.typography.bodyMedium)
            }
            if (review.tags.isNotEmpty()) {
                Text(review.tags.joinToString(" • "), style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            review.reply?.let { reply ->
                Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Tanggapan Anda", style = MaterialTheme.typography.labelMedium, color = Primary)
                        Text(reply.body, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                OutlinedButton(onClick = onReply) { Text(if (review.reply == null) "Balas" else "Ubah Balasan") }
            }
        }
    }
}

@Composable
private fun MerchantReviewReplyDialog(
    review: com.tembus.merchant.data.model.MerchantReview,
    isSaving: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit
) {
    var body by remember(review.id, review.reply?.body) { mutableStateOf(review.reply?.body.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (review.reply == null) "Balas Ulasan" else "Ubah Balasan") },
        text = {
            OutlinedTextField(
                value = body,
                onValueChange = { body = it.take(1000) },
                label = { Text("Tanggapan Anda") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            Button(onClick = { onSubmit(body.trim()) }, enabled = body.trim().isNotEmpty() && !isSaving) {
                if (isSaving) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                else Text("Simpan")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !isSaving) { Text("Batal") } }
    )
}

private fun String.initials(): String =
    trim().split(Regex("\\s+")).filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }.ifBlank { "C" }

@Composable
private fun MerchantZipDetailScaffold(title: String, onBack: () -> Unit, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().background(PrimaryPale)) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
            }
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            content()
        }
    }
}

@Composable
private fun MerchantZipInfoCard(content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        content = { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content) }
    )
}

@Composable
private fun MerchantZipInfoRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun MerchantZipReadOnlyField(label: String, value: String) {
    OutlinedTextField(
        value = value.ifBlank { "Belum tersedia" },
        onValueChange = {},
        readOnly = true,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun MerchantZipEmptyState(message: String, onRetry: (() -> Unit)? = null) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(Icons.Filled.Storefront, contentDescription = null, tint = Primary, modifier = Modifier.size(40.dp))
        Spacer(Modifier.height(8.dp))
        Text(message, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        onRetry?.let {
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = it) { Text("Coba Lagi") }
        }
    }
}
