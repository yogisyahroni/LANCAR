package com.tembus.customer.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Share
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.ReferralReward
import com.tembus.customer.ui.theme.Primary
import kotlinx.coroutines.flow.collectLatest

// C8: Referral / invite reward screen
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReferralScreen(
    onBack: () -> Unit,
    viewModel: ReferralViewModel = hiltViewModel()
) {
    val info by viewModel.referralInfo.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val error by viewModel.error.collectAsState()
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current

    LaunchedEffect(Unit) { viewModel.loadReferralInfo() }

    var showApplyDialog by remember { mutableStateOf(false) }
    var snackbarMsg by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        viewModel.message.collectLatest { msg -> snackbarMsg = msg }
    }

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
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"), tint = Primary)
                }
                Text("Ajak Teman", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Primary)
            }
        }
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = loading && info != null,
            onRefresh = viewModel::loadReferralInfo,
            modifier = Modifier.fillMaxSize()
        ) {
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                loading && info == null -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Primary)
                    }
                }
                error != null && info == null -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Gagal memuat referral", color = Color(0xFFEF4444), fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                            TextButton(onClick = { viewModel.loadReferralInfo() }) {
                                Text("Coba lagi", color = Primary)
                            }
                        }
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        item {
                            ReferralHeaderCard(
                                referralCode = info?.referralCode,
                                referralLink = info?.referralLink ?: "",
                                totalReferred = info?.totalReferred ?: 0,
                                earnedRewards = info?.earnedRewards ?: 0,
                                onCopy = { link ->
                                    clipboardManager.setText(AnnotatedString(link))
                                    snackbarMsg = "Link disalin"
                                },
                                onShare = { /* TODO: share intent */ },
                                onEnterCode = { showApplyDialog = true }
                            )
                        }
                        item { Text("Riwayat Referral", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface) }
                        if (info?.rewards.isNullOrEmpty()) {
                            item {
                                Box(modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) {
                                    Text("Belum ada teman yang menggunakan kodemu", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                                }
                            }
                        } else {
                            items(info!!.rewards, key = { it.id }) { reward ->
                                ReferralRewardCard(reward = reward)
                            }
                        }
                    }
                }
            }
            snackbarMsg?.let { msg ->
                LaunchedEffect(msg) {
                    // Simple toast fallback
                    android.widget.Toast.makeText(context, msg, android.widget.Toast.LENGTH_SHORT).show()
                    snackbarMsg = null
                }
            }
        }
        }
    }

    if (showApplyDialog) {
        ApplyReferralDialog(
            onDismiss = { showApplyDialog = false },
            onApply = { code ->
                viewModel.applyReferralCode(code)
                showApplyDialog = false
            }
        )
    }
}

@Composable
private fun ReferralHeaderCard(
    referralCode: String?,
    referralLink: String,
    totalReferred: Int,
    earnedRewards: Int,
    onCopy: (String) -> Unit,
    onShare: () -> Unit,
    onEnterCode: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text("Kode Referral Kamu", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            if (referralCode != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(referralCode, fontSize = 24.sp, fontWeight = FontWeight.Black, color = Primary, letterSpacing = 2.sp)
                    Spacer(Modifier.width(8.dp))
                    IconButton(onClick = { onCopy(referralLink) }) {
                        Icon(Icons.Default.ContentCopy, contentDescription = CustomerTextCatalog.translate("Salin"), tint = Primary)
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(
                        onClick = onShare,
                        modifier = Modifier.weight(1f).height(44.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Primary)
                    ) {
                        Icon(Icons.Default.Share, contentDescription = "", modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Bagikan", fontWeight = FontWeight.Bold)
                    }
                }
            } else {
                Text("Kode belum tersedia", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
            }
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatChip(label = "Diundang", value = totalReferred.toString())
                StatChip(label = "Reward Cair", value = earnedRewards.toString())
            }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(
                onClick = onEnterCode,
                modifier = Modifier.fillMaxWidth().height(44.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Primary)
            ) {
                Text("Punya kode referral? Masukkan di sini", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun StatChip(label: String, value: String) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = Primary.copy(alpha = 0.08f),
        modifier = Modifier.height(56.dp).width(100.dp)
    ) {
        Column(modifier = Modifier.fillMaxSize().padding(8.dp), verticalArrangement = Arrangement.Center) {
            Text(value, fontSize = 20.sp, fontWeight = FontWeight.Black, color = Primary)
            Text(label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ReferralRewardCard(reward: ReferralReward) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(1.dp)
    ) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Primary.copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Person, contentDescription = "", tint = Primary, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(reward.referredName ?: "Teman", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val rewardLabel = if (reward.rewardValue != null) "Rp ${reward.rewardValue}" else "-"
                Text("Reward: $rewardLabel", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            val statusColor = when (reward.status) {
                "completed" -> Color(0xFF16A34A)
                "pending" -> Color(0xFFF59E0B)
                else -> Color(0xFF94A3B8)
            }
            Text(
                text = if (reward.status == "completed") "Cair" else if (reward.status == "pending") "Pending" else reward.status,
                fontSize = 12.sp, fontWeight = FontWeight.Bold, color = statusColor
            )
        }
    }
}
